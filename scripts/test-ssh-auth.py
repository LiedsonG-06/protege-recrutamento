"""Chaves e agentes reais; nenhum SSH/SFTP de rede é executado."""
import os
from pathlib import Path
import subprocess
import tempfile

helper = Path('scripts/ssh-auth.sh').resolve()
secret = 'ficticia espaços $ ` " passphrase'
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    tempfiles = root / 'temporary'
    tempfiles.mkdir()
    key = root / 'key'
    hostkey = root / 'host'
    for path, phrase in [(key, secret), (hostkey, '')]:
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', phrase, '-f', str(path)], check=True)
    host_public = hostkey.with_suffix('.pub').read_text()
    known = 'test.invalid ' + host_public
    record = root / 'record'
    harness = root / 'test.sh'
    harness.write_text('''#!/usr/bin/env bash
source "$HELPER"
printf '%s\\n%s\\n%s\\n' "$work" "$SSH_AUTH_SOCK" "$SSH_AGENT_PID" > "$RECORD"
[[ ! -f "$work/key" && ! -f "$work/askpass" ]] || exit 1
[[ -z "${SSH_PASSPHRASE+x}" && -z "${SSH_KEY+x}" ]] || exit 1
ssh-add -l >/dev/null
# O OpenSSH resolve as opções sem abrir ligação.
ssh "${opts[@]}" -G protegeo@test.invalid > "$work/config"
grep -q '^batchmode yes$' "$work/config"
grep -q '^identitiesonly yes$' "$work/config"
grep -Eq '^stricthostkeychecking (true|yes)$' "$work/config"
[[ "${TEST_FAIL:-}" != yes ]] || exit 42
if [[ "${TEST_SIGNAL:-}" == yes ]]; then kill -TERM $$; fi
''')
    # Registar recursos assim que criados, também no caso de ssh-add falhar.
    instrumented = root / 'helper.sh'
    instrumented.write_text(helper.read_text().replace('agent_started=true', '''agent_started=true
printf '%s\\n%s\\n%s\\n' "$work" "$SSH_AUTH_SOCK" "$SSH_AGENT_PID" > "$RECORD"'''))
    base_env = dict(os.environ, SSH_HOST='test.invalid', SSH_KEY=key.read_text(),
                    SSH_PASSPHRASE=secret, SSH_KNOWN_HOSTS=known,
                    HELPER=str(instrumented), RECORD=str(record), TMPDIR=str(tempfiles))
    def run(overrides=None, expected=0):
        record.unlink(missing_ok=True)
        env = base_env | (overrides or {})
        result = subprocess.run(['bash', str(harness)], env=env, capture_output=True, text=True, timeout=20)
        assert result.returncode == expected, (result.returncode, result.stdout, result.stderr)
        assert secret not in result.stdout + result.stderr
        assert 'BEGIN OPENSSH PRIVATE KEY' not in result.stdout + result.stderr
        assert not list(tempfiles.iterdir()), 'Temporários permaneceram após saída'
        if record.exists():
            work, sock, pid = record.read_text().splitlines()
            assert not Path(work).exists(), 'Ficheiros temporários não foram limpos'
            probe = subprocess.run(['ssh-add', '-l'], env=dict(os.environ, SSH_AUTH_SOCK=sock), capture_output=True)
            assert probe.returncode != 0, 'Agente continuou acessível'
    run()
    run({'TEST_FAIL': 'yes'}, 42)
    run({'TEST_SIGNAL': 'yes'}, 143)
    run({'SSH_PASSPHRASE': 'errada'}, 1)
    run({'SSH_PASSPHRASE': ''}, 1)
    run({'SSH_KEY': 'chave inválida'}, 1)
    run({'SSH_KNOWN_HOSTS': 'outro.invalid ' + host_public}, 1)
    run({'SSH_KNOWN_HOSTS': 'test.invalid ssh-ed25519 INVALID'}, 1)
    # known_hosts hashed também deve funcionar.
    hashed = root / 'known_hosts'
    hashed.write_text(known)
    subprocess.run(['ssh-keygen', '-H', '-f', str(hashed)], capture_output=True, check=True)
    run({'SSH_KNOWN_HOSTS': hashed.read_text()})
print('SSH local: chave protegida, batch, known_hosts, falhas e limpeza: OK (sem rede)')
