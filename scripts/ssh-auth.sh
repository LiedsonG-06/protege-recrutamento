#!/usr/bin/env bash
# Carregado apenas por deploy-sftp.sh e pelos testes locais.
set +x
set -euo pipefail
umask 077
for name in SSH_HOST SSH_KEY SSH_PASSPHRASE SSH_KNOWN_HOSTS; do
  [[ -n "${!name:-}" ]] || { echo "Secret obrigatório em falta: $name" >&2; exit 1; }
done
# Não propagar a passphrase ao agente ou a outros processos auxiliares.
export -n SSH_PASSPHRASE
[[ "$SSH_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]] || exit 1
work=$(mktemp -d)
agent_started=false
cleanup_ssh() {
  if [[ "$agent_started" == true ]]; then
    ssh-agent -k >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup_ssh EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n' "$SSH_KEY" > "$work/key"
printf '%s\n' "$SSH_KNOWN_HOSTS" > "$work/known_hosts"
unset SSH_KEY SSH_KNOWN_HOSTS
# Exigir entrada para o hostname exacto (incluindo suporte a hosts hashed).
ssh-keygen -F "$SSH_HOST" -f "$work/known_hosts" > "$work/matched-host" || {
  echo 'known_hosts não contém o servidor esperado.' >&2; exit 1;
}
ssh-keygen -l -f "$work/matched-host" >/dev/null 2>&1 || {
  echo 'Chave de host inválida.' >&2; exit 1;
}
# Nunca reutilizar ou terminar o agente do utilizador.
unset SSH_AUTH_SOCK SSH_AGENT_PID
agent_output=$(ssh-agent -s -a "$work/agent.sock") || exit 1
eval "$agent_output" >/dev/null
unset agent_output
agent_started=true
cat > "$work/askpass" <<'ASKPASS'
#!/bin/sh
# Responder uma única vez: uma passphrase errada não pode criar um ciclo.
mkdir "$0.used" 2>/dev/null || exit 1
printf '%s\n' "$SSH_PASSPHRASE"
ASKPASS
chmod 700 "$work/askpass"
# A passphrase só entra no ambiente de ssh-add/askpass, nunca nos argumentos.
# force + stdin fechado impede prompts de terminal em runners e testes locais.
if ! SSH_PASSPHRASE="$SSH_PASSPHRASE" SSH_ASKPASS="$work/askpass" \
    SSH_ASKPASS_REQUIRE=force DISPLAY=codex-askpass \
    ssh-add -t 600 "$work/key" </dev/null >/dev/null 2>&1; then
  unset SSH_PASSPHRASE
  echo 'Não foi possível carregar a chave SSH; verificar chave e passphrase.' >&2
  exit 1
fi
unset SSH_PASSPHRASE
ssh-add -L > "$work/identity.pub"
rm -f "$work/key" "$work/askpass"
opts=(-F /dev/null -i "$work/identity.pub" -o "IdentityAgent=$SSH_AUTH_SOCK"
  -o BatchMode=yes -o IdentitiesOnly=yes -o PreferredAuthentications=publickey
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$work/known_hosts"
  -o GlobalKnownHostsFile=/dev/null -o VerifyHostKeyDNS=no -o UpdateHostKeys=no
  -o ForwardAgent=no -o ConnectTimeout=20 -o ServerAliveInterval=15 -o ServerAliveCountMax=3)
