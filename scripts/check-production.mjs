// Verificação local: não envia SMTP, não abre portas e não altera o alojamento.
import { access, realpath, stat, lstat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../server/config/index.js';

const inside = (parent, child) => { const path=relative(parent,child); return !path || (!path.startsWith('..') && !isAbsolute(path)); };
export async function inspectProduction(env = process.env) {
  const checks=[];
  const add=(name,ok)=>checks.push({name,ok:!!ok});
  add('Node.js 22 ou superior',Number(process.versions.node.split('.')[0])>=22);
  let config;
  try { config=loadConfig(env);add('Estrutura das variáveis',true); }
  catch {add('Estrutura das variáveis: rever origens, segredo, caminhos, SMTP e prazo',false);return checks;}
  add('NODE_ENV=production',config.production);
  add('Candidaturas bloqueadas para preparação',!config.enabled);
  add('Origem exclusiva do portal HTTPS',config.origins.length===1 && config.origins[0]==='https://recrutamento.protege.org.mz');
  let publicRoot;
  try {publicRoot=await realpath(config.publicRoot);add('Raiz pública existente', (await stat(publicRoot)).isDirectory());}catch{add('Raiz pública existente',false)}
  const privateRoots=[];
  for(const [name,path] of [['Temporários',config.tempRoot],['Duplicados',config.dedupRoot]]) {
    try {
      const canonical=await realpath(path);privateRoots.push(canonical);
      const info=await stat(canonical);
      await access(path,constants.R_OK | constants.W_OK | constants.X_OK);
      add(`${name}: directório privado, acessível e fora da raiz pública`,info.isDirectory() && (info.mode & 0o777)===0o700 && publicRoot && !inside(publicRoot,canonical) && !(await lstat(path)).isSymbolicLink());
    } catch {add(`${name}: directório privado, acessível e fora da raiz pública`,false)}
  }
  add('Directórios privados separados',privateRoots.length===2 && !inside(privateRoots[0],privateRoots[1]) && !inside(privateRoots[1],privateRoots[0]));
  add('SMTP completo e limite MIME declarado (sem ligar ao serviço)',config.smtpConfigured && config.smtpMaxMessageBytes>0);
  add('Política aprovada, texto e versão registados',config.privacyApproved && config.privacyText && config.privacyVersion);
  return checks;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const checks=await inspectProduction();
  for(const check of checks) console.info(`${check.ok ? 'OK' : 'PENDENTE'}: ${check.name}`);
  console.info('A verificação local não confirma cPanel, HTTPS público, DNS, entrega SMTP ou aprovação institucional.');
  process.exitCode=checks.every(check=>check.ok)?0:1;
}
