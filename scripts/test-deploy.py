"""Integração local do script remoto, com destinos substituídos por pastas temporárias."""
import pathlib
import subprocess
import tempfile
import tarfile

source = pathlib.Path('scripts/remote-release.sh').read_text()
with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp).resolve()
    target = root / 'public/recrutamento'
    target.mkdir(parents=True)
    base = root / 'deploy'
    script = root / 'remote.sh'
    script.write_text(source.replace('/home/protegeo/public_html/recrutamento', str(target))
                     .replace('/home/protegeo/deploy-recrutamento', str(base)))
    configs = ['.htaccess', '.user.ini', 'php.ini', '.well-known/token', 'cgi-bin/test']
    for name in configs + ['index.html']:
        p = target / name
        p.parent.mkdir(exist_ok=True)
        p.write_text('original')
    def run(mode, release='123-1', ok=True):
        result = subprocess.run(['bash', str(script), mode, release], capture_output=True, text=True)
        assert (result.returncode == 0) == ok, str((result.returncode, result.stdout, result.stderr))
    run('prepare')
    build = root / 'dist'
    (build / 'assets').mkdir(parents=True)
    (build / 'index.html').write_text('novo')
    (build / 'assets/app.js').write_text('asset')
    with tarfile.open(base / '123-1/frontend.tar.gz', 'w:gz') as archive:
        archive.add(build, arcname='.')
    run('publish')
    assert (target / 'index.html').read_text() == 'novo'
    assert (target / 'assets/app.js').read_text() == 'asset'
    for name in configs:
        assert (target / name).read_text() == 'original'
    (target / '.htaccess').write_text('config actual')
    run('rollback')
    assert (target / 'index.html').read_text() == 'original'
    assert (target / '.htaccess').read_text() == 'config actual'
    assert (target / 'assets/app.js').exists()
    (target / 'link').symlink_to(root)
    run('prepare', '124-1', ok=False)
print('Backup, publicação, preservação de configurações, rollback e recusa de symlink: OK')
