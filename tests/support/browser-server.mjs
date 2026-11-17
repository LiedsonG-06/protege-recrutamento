// Exclusivamente para Playwright: não lê .env nem cria qualquer transporte SMTP de rede.
import express from 'express';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { createApp } from '../../server/app.js';
import { loadConfig } from '../../server/config/index.js';

const root=await mkdtemp(join(tmpdir(),'protege-browser-'));
let now=new Date('2026-11-17T10:00:00Z');
const messages=[];
const config=loadConfig({APPLICATIONS_ENABLED:'true',PRIVACY_APPROVED:'true',PRIVACY_POLICY_VERSION:'e2e-v1',PRIVACY_POLICY_TEXT:'Política fictícia para testes locais; nenhum envio externo.',APPLICATION_SECRET:'isolated-browser-fixture-secret-'.repeat(3),SMTP_HOST:'never-used.invalid',SMTP_USER:'fake',SMTP_PASS:'fake',SMTP_FROM:'test@example.invalid',UPLOAD_TEMP_DIR:join(root,'uploads'),DEDUP_DIR:join(root,'dedup'),MIN_FORM_SECONDS:'0',RATE_LIMIT_MAX:'1000',ALLOWED_ORIGINS:'http://127.0.0.1:4175'});
const app=express();
app.use('/__test',express.json());
app.get('/__test/state',async(req,res)=>res.json({messages,temporaryFiles:await readdir(config.tempRoot)}));
app.post('/__test/reset',async(req,res)=>{
  now=new Date(req.body.now || '2026-11-17T10:00:00Z');messages.length=0;
  for(const name of await readdir(config.dedupRoot)) await rm(join(config.dedupRoot,name),{force:true});
  // Instância isolada por cenário, incluindo os contadores de frequência de pedidos.
  api=await createApp(apiOptions);
  res.json({ok:true});
});
const apiOptions={config,clock:()=>now,log:()=>{},transport:{verify:async()=>true,sendMail:async message=>{
  if(message.replyTo.address==='smtp-fail@example.org') {const error=new Error('simulated rejection');error.responseCode=550;throw error;}
  messages.push({to:message.to,subject:message.subject,text:message.text,attachments:message.attachments.map(file=>({filename:file.filename,contentType:file.contentType,base64:file.content.toString('base64')}))});
  return {accepted:['recrutamentoprotege1@gmail.com'],rejected:[]};
}}};
let api=await createApp(apiOptions);
app.use((req,res,next)=>api(req,res,next));
const server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
const vite=await createServer({configFile:false,server:{host:'127.0.0.1',port:4175,strictPort:true,proxy:{'/api':`http://127.0.0.1:${server.address().port}`,'/__test':`http://127.0.0.1:${server.address().port}`}}});
await vite.listen();
console.info('Playwright fixture: http://127.0.0.1:4175 (SMTP simulado)');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await vite.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});process.exit(0)}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
