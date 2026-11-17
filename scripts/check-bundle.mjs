// Inspecciona artefactos locais; nunca imprime valores de segredos.
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function inspectBundle(root=resolve('dist'),env=process.env) {
  const problems=[];
  async function walk(directory) {
    for(const entry of await readdir(directory,{withFileTypes:true})) {
      const path=join(directory,entry.name);
      if (/^\.env|^(?:server|node_modules|\.runtime)$/.test(entry.name)) problems.push('Artefacto privado incluído no frontend.');
      if(entry.isDirectory()) await walk(path);
      else if(/\.(?:html|js|css|json|map|txt)$/i.test(entry.name)) {
        const text=await readFile(path,'utf8');
        if(/SMTP_PASS|APPLICATION_SECRET|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/.test(text)) problems.push('Identificador sensível ou chave privada no frontend.');
        if(['SMTP_PASS','APPLICATION_SECRET'].some(key=>typeof env[key]==='string' && env[key].length>=12 && text.includes(env[key]))) problems.push('Valor sensível encontrado no frontend.');
      }
    }
  }
  await walk(root);
  return problems;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const problems=await inspectBundle();
    console.info(problems.length ? `Falhou: ${problems.length} indício(s) de material privado no frontend.` : 'OK: sem ficheiros privados, identificadores de segredos ou valores sensíveis conhecidos no bundle.');
    process.exitCode=problems.length?1:0;
  } catch {console.error('Não foi possível inspeccionar dist/. Execute primeiro npm run build.');process.exitCode=1;}
}
