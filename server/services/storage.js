import { mkdir, lstat, chmod, readdir, stat, rm, realpath } from 'node:fs/promises';
import { resolve, sep, join, parse } from 'node:path';

export async function preparePrivateDirectory(path, publicRoot = null) {
  if (path === parse(path).root || path === resolve('.')) throw new Error('Seleccione um subdirectório privado dedicado.');
  const protectedPaths = ['dist', 'public', 'src', 'node_modules', ...(publicRoot ? [publicRoot, await realpath(publicRoot)] : [])];
  for (const publicPath of protectedPaths) {
    const root = resolve(publicPath);
    if (path === root || path.startsWith(root + sep)) throw new Error('O armazenamento privado não pode ficar numa pasta pública ou de código.');
  }
  await mkdir(path, { recursive: true, mode: 0o700 });
  if (!(await lstat(path)).isDirectory() || (await lstat(path)).isSymbolicLink()) throw new Error('Directório privado inválido.');
  const canonical = await realpath(path);
  for (const publicPath of protectedPaths) {
    const root = resolve(publicPath);
    if (canonical === root || canonical.startsWith(root + sep)) throw new Error('Caminho privado aponta para directório público.');
  }
  await chmod(path, 0o700);
}
export async function cleanOldFiles(config, now = Date.now()) {
  for (const [root, age] of [[config.tempRoot, 24 * 3600000], [config.dedupRoot, config.dedupTtlMs]]) {
    for (const name of await readdir(root)) {
      if (!(root === config.tempRoot ? /^upload-[\w-]+$/.test(name) : /^[a-f0-9]{64}\.json(?:\.[\w-]+\.tmp)?$/.test(name))) continue;
      const path = join(root, name);
      const info = await stat(path).catch(() => null);
      if (info && now - info.mtimeMs > age) await rm(path, { recursive: true, force: true });
    }
  }
}
