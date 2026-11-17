#!/usr/bin/env bash
set +x
set -euo pipefail
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ && "${GITHUB_RUN_ATTEMPT:-}" =~ ^[0-9]+$ ]] || exit 1
script_dir=$(cd "$(dirname "$0")" && pwd)
bash "$script_dir/check-dist.sh"
# O helper carrega a chave protegida no agente e instala a limpeza EXIT/INT/TERM.
source "$script_dir/ssh-auth.sh"
[[ -S "$SSH_AUTH_SOCK" && -s "$work/identity.pub" ]] || exit 1
host="protegeo@$SSH_HOST"
release="${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
# Teste do subsistema real, antes de qualquer escrita remota.
printf 'pwd\nls /home/protegeo/public_html/recrutamento\n' > "$work/probe"
sftp "${opts[@]}" -P 22 -b "$work/probe" "$host"
# Evitar nomes que não possam ser representados com segurança em batch SFTP/tar.
python3 - <<'PY'
from pathlib import Path
import re
for p in Path('dist').rglob('*'):
    if not re.fullmatch(r'[A-Za-z0-9_./-]+', p.as_posix()):
        raise SystemExit('Nome não permitido no artefacto')
PY
tar -czf "$work/frontend.tar.gz" -C dist .
# Pré-validação, staging privado e backup completo fora de public_html.
ssh "${opts[@]}" -p 22 "$host" "bash -s -- prepare $release" < "$script_dir/remote-release.sh"
printf 'put "%s" "/home/protegeo/deploy-recrutamento/%s/frontend.tar.gz"\n' "$work/frontend.tar.gz" "$release" > "$work/upload"
sftp "${opts[@]}" -P 22 -b "$work/upload" "$host"
ssh "${opts[@]}" -p 22 "$host" "bash -s -- publish $release" < "$script_dir/remote-release.sh"
