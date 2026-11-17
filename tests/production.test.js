import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, stat, utimes, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../server/config/index.js';
import { preparePrivateDirectory, cleanOldFiles } from '../server/services/storage.js';
import { inspectProduction } from '../scripts/check-production.mjs';
import { inspectBundle } from '../scripts/check-bundle.mjs';
import { createApp } from '../server/app.js';

const prod = changes=>({NODE_ENV:'production',ALLOWED_ORIGINS:'https://recrutamento.protege.org.mz',PUBLIC_ROOT:'/tmp/protege-public',UPLOAD_TEMP_DIR:'/tmp/protege-private/uploads',DEDUP_DIR:'/tmp/protege-private/dedup',APPLICATION_SECRET:'synthetic-test-secret-'.repeat(3),APPLICATIONS_ENABLED:'false',PRIVACY_APPROVED:'false',...changes});
async function temporary(t){const root=await mkdtemp(join(tmpdir(),'protege-production-test-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}

test('produção rejeita configuração omissa, CORS inseguro e armazenamento relativo',()=>{
  assert.throws(()=>loadConfig({NODE_ENV:'production'}));
  for(const changes of [{ALLOWED_ORIGINS:'http://recrutamento.protege.org.mz'},{ALLOWED_ORIGINS:'https://localhost'},{APPLICATION_SECRET:''},{UPLOAD_TEMP_DIR:'./tmp'},{DEDUP_DIR:''},{PUBLIC_ROOT:''}]) assert.throws(()=>loadConfig(prod(changes)));
  assert.equal(loadConfig(prod()).enabled,false);
});
test('valores booleanos inválidos, datas impossíveis e JSON de prazos inválido falham fechados',()=>{
  for(const changes of [{APPLICATIONS_ENABLED:'yes'},{PRIVACY_APPROVED:'1'},{SMTP_SECURE:'invalid'},{APPLICATION_DEADLINE_AT:'2026-02-31T00:00:00+02:00'},{JOB_DEADLINES_JSON:'[]'},{JOB_DEADLINES_JSON:'null'}]) assert.throws(()=>loadConfig(changes));
});
test('portas e encriptação SMTP e orçamento MIME são verificados sem envio',()=>{
  for(const changes of [{SMTP_PORT:'465',SMTP_SECURE:'false'},{SMTP_PORT:'587',SMTP_SECURE:'true'},{SMTP_MAX_MESSAGE_BYTES:'1000000'}]) assert.throws(()=>loadConfig(changes));
  const smtp={SMTP_HOST:'smtp.invalid',SMTP_PORT:'587',SMTP_USER:'fake',SMTP_PASS:'synthetic-only',SMTP_FROM:'portal@example.org'};
  assert.throws(()=>loadConfig(prod(smtp)));
  assert.equal(loadConfig(prod({...smtp,SMTP_MAX_MESSAGE_BYTES:String(25*1024*1024)})).smtpConfigured,true);
});
test('pastas privadas: permissões, raiz pública e symlinks',async t=>{
  const root=await temporary(t),pub=join(root,'public'),dir=join(root,'private');await mkdir(pub);await preparePrivateDirectory(dir,pub);
  assert.equal((await stat(dir)).mode & 0o777,0o700);
  await assert.rejects(preparePrivateDirectory(join(pub,'uploads'),pub));
  await symlink(dir,join(root,'alias'));await assert.rejects(preparePrivateDirectory(join(root,'alias'),pub));
});
test('limpeza elimina órfãos antigos e preserva temporários recentes e ficheiros alheios',async t=>{
  const root=await temporary(t),tempRoot=join(root,'uploads'),dedupRoot=join(root,'dedup');await preparePrivateDirectory(tempRoot);await preparePrivateDirectory(dedupRoot);
  const old=join(tempRoot,'upload-old'),fresh=join(tempRoot,'upload-fresh'),other=join(tempRoot,'do-not-remove');await mkdir(old);await mkdir(fresh);await writeFile(other,'unrelated');
  const hash=join(dedupRoot,'a'.repeat(64)+'.json');await writeFile(hash,'{}');const past=new Date(Date.now()-49*3600000);await utimes(old,past,past);await utimes(hash,past,past);
  await cleanOldFiles({tempRoot,dedupRoot,dedupTtlMs:24*3600000});assert.deepEqual((await readdir(tempRoot)).sort(),['do-not-remove','upload-fresh']);assert.deepEqual(await readdir(dedupRoot),[]);
});
test('preflight identifica pendências sem SMTP, sem aprovar política e sem criar pastas',async t=>{
  const root=await temporary(t);const pub=join(root,'public'),uploads=join(root,'uploads'),dedup=join(root,'dedup');await mkdir(pub);await preparePrivateDirectory(uploads);await preparePrivateDirectory(dedup);
  const checks=await inspectProduction(prod({PUBLIC_ROOT:pub,UPLOAD_TEMP_DIR:uploads,DEDUP_DIR:dedup}));
  assert.ok(checks.find(c=>c.name.startsWith('SMTP')).ok===false);assert.ok(checks.find(c=>c.name.startsWith('Política')).ok===false);assert.ok(checks.find(c=>c.name.startsWith('Temporários')).ok);
  const missing=join(root,'missing');await inspectProduction(prod({UPLOAD_TEMP_DIR:missing}));await assert.rejects(stat(missing));
});
test('scanner detecta segredos sintéticos e ficheiros privados sem os imprimir',async t=>{
  const root=await temporary(t);await writeFile(join(root,'index.html'),'<html>portal</html>');assert.deepEqual(await inspectBundle(root,{}),[]);
  await writeFile(join(root,'bundle.js'),'const value="synthetic-secret-value"');assert.ok((await inspectBundle(root,{SMTP_PASS:'synthetic-secret-value'})).length);
  await writeFile(join(root,'.env'),'never real credentials');assert.ok((await inspectBundle(root,{})).length);
});
test('rotas privadas inexistentes e candidaturas fechadas continuam inacessíveis em produção',async t=>{
  const root=await temporary(t),pub=join(root,'public');await mkdir(pub);
  const config=loadConfig(prod({PUBLIC_ROOT:pub,UPLOAD_TEMP_DIR:join(root,'uploads'),DEDUP_DIR:join(root,'dedup')}));
  const app=await createApp({config,log:()=>{}}),server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))});
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const path of ['/.env','/server/index.js','/uploads/document.pdf','/__test/state']) assert.equal((await fetch(base+path)).status,404);
  const response=await fetch(base+'/api/v1/config');const text=await response.text();assert.ok(!text.includes(config.secret));assert.equal(JSON.parse(text).available,false);
  assert.equal((await fetch(base+'/api/v1/applications',{method:'POST'})).status,503);
  assert.equal((await fetch(base+'/api/v1/config',{headers:{origin:'http://recrutamento.protege.org.mz'}})).status,403);
});
