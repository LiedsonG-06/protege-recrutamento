"""Executa deploy-sftp.sh completo: agente real, transportes locais, sem rede."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

repo = Path(__file__).resolve().parent.parent
workflow = (repo / '.github/workflows/deploy.yml').read_text()
assert 'SSH_PASSPHRASE: ${{ secrets.CPANEL_SSH_PASSPHRASE }}' in workflow
assert 'run: bash deploy-tools/scripts/deploy-sftp.sh' in workflow
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary).resolve()
    binaries = root / 'bin'
    binaries.mkdir()
    temps = root / 'temps'
    temps.mkdir()
    key = root / 'fixture-key'
    hostkey = root / 'fixture-host'
    phrase = 'Ficticia integração $ ` " com espaços'
    for path, password in [(key, phrase), (hostkey, '')]:
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', password, '-f', str(path)], check=True)
    transport = binaries / 'transport'
    transport.write_text('#!' + sys.executable + '\n' + r'''
import json, os, pathlib, shlex, shutil, subprocess, sys
args = sys.argv[1:]
assert 'SSH_KEY' not in os.environ and 'SSH_PASSPHRASE' not in os.environ
for option in ['BatchMode=yes', 'IdentitiesOnly=yes', 'StrictHostKeyChecking=yes',
               'PreferredAuthentications=publickey', 'ForwardAgent=no',
               'GlobalKnownHostsFile=/dev/null', 'VerifyHostKeyDNS=no']:
    assert option in args, option
sock = os.environ['SSH_AUTH_SOCK']
assert 'IdentityAgent=' + sock in args
identity = pathlib.Path(args[args.index('-i') + 1])
assert identity.name == 'identity.pub' and identity.read_text().startswith('ssh-ed25519 ')
assert not (identity.parent / 'key').exists()
assert not (identity.parent / 'askpass').exists()
assert subprocess.run(['ssh-add', '-l'], capture_output=True).returncode == 0
with open(os.environ['TRACE_FILE'], 'a') as log:
    log.write(json.dumps({'tool': pathlib.Path(sys.argv[0]).name, 'args': args,
                          'socket': sock, 'work': str(identity.parent)}) + '\n')
if os.environ.get('FAIL_TOOL') == pathlib.Path(sys.argv[0]).name:
    sys.exit(47)
remote = pathlib.Path(os.environ['SIM_REMOTE'])
if pathlib.Path(sys.argv[0]).name == 'sftp':
    assert args[args.index('-P') + 1] == '22' and '-b' in args
    batch = pathlib.Path(args[args.index('-b') + 1]).read_text()
    if batch.startswith('put '):
        _, local, destination = shlex.split(batch)
        destination = remote / destination.removeprefix('/home/protegeo/')
        shutil.copyfile(local, destination)
    else:
        assert batch == 'pwd\nls /home/protegeo/public_html/recrutamento\n'
else:
    assert args[args.index('-p') + 1] == '22'
    script = sys.stdin.read().replace('/home/protegeo/', str(remote) + '/')
    mode, release = args[-1].split()[-2:]
    subprocess.run(['bash', '-s', '--', mode, release], input=script, text=True, check=True)
''')
    transport.chmod(0o700)
    for name in ['ssh', 'sftp']:
        (binaries / name).symlink_to(transport)
    dist = root / 'dist'
    (dist / 'assets').mkdir(parents=True)
    (dist / 'index.html').write_text('novo')
    (dist / 'assets/app.js').write_text('app')
    private = key.read_text()
    for case, extra, expected, calls in [
        ('success', {}, 0, 4),
        ('sftp-failure', {'FAIL_TOOL': 'sftp'}, 47, 1),
        ('ssh-failure', {'FAIL_TOOL': 'ssh'}, 47, 2),
        ('wrong-passphrase', {'SSH_PASSPHRASE': 'incorrecta'}, 1, 0),
    ]:
        remote = root / case
        target = remote / 'public_html/recrutamento'
        target.mkdir(parents=True)
        protected = ['.htaccess', '.user.ini', 'php.ini', '.well-known/token', 'cgi-bin/test']
        for name in protected + ['index.html']:
            file = target / name
            file.parent.mkdir(exist_ok=True)
            file.write_text('original')
        trace = root / (case + '.jsonl')
        env = dict(os.environ, PATH=str(binaries) + os.pathsep + os.environ['PATH'],
                   TMPDIR=str(temps), SIM_REMOTE=str(remote), TRACE_FILE=str(trace),
                   SSH_HOST='test.invalid', SSH_KEY=private, SSH_PASSPHRASE=phrase,
                   SSH_KNOWN_HOSTS='test.invalid ' + hostkey.with_suffix('.pub').read_text(),
                   GITHUB_RUN_ID='123', GITHUB_RUN_ATTEMPT='1') | extra
        result = subprocess.run(['bash', '-x', str(repo / 'scripts/deploy-sftp.sh')],
                                cwd=root, env=env, capture_output=True, text=True, timeout=30)
        # Não incluir stdout/stderr em falhas de teste: podem conter um segredo se houver regressão.
        assert result.returncode == expected, (case, result.returncode)
        log = result.stdout + result.stderr + (trace.read_text() if trace.exists() else '')
        for secret in [phrase, private, *private.splitlines()[1:-1]]:
            assert secret not in log, 'Credencial exposta nos logs capturados'
        entries = [json.loads(line) for line in trace.read_text().splitlines()] if trace.exists() else []
        assert len(entries) == calls, case
        assert not list(temps.iterdir()), 'Temporários não removidos'
        for entry in entries:
            assert not Path(entry['work']).exists()
            assert subprocess.run(['ssh-add', '-l'], env=dict(os.environ, SSH_AUTH_SOCK=entry['socket']),
                                  capture_output=True).returncode != 0
        for name in protected:
            assert (target / name).read_text() == 'original'
        if case == 'success':
            assert [entry['tool'] for entry in entries] == ['sftp', 'ssh', 'sftp', 'ssh']
            assert (target / 'index.html').read_text() == 'novo'
            backup = remote / 'deploy-recrutamento/123-1/backup.tar.gz'
            assert backup.exists()
            # Reversão usando o mesmo script remoto, exclusivamente no destino temporário.
            script = (repo / 'scripts/remote-release.sh').read_text().replace('/home/protegeo/', str(remote) + '/')
            subprocess.run(['bash', '-s', '--', 'rollback', '123-1'], input=script,
                           text=True, capture_output=True, check=True)
            assert (target / 'index.html').read_text() == 'original'
        else:
            assert (target / 'index.html').read_text() == 'original'
print('Integração deploy + agente: sucesso, falhas, backup/rollback, configurações e logs: OK (sem rede)')
