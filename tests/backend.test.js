import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import nodemailer from 'nodemailer';
import { createServer } from 'node:net';
import { request } from 'node:http';
import { createApp } from '../server/app.js';
import { loadConfig } from '../server/config/index.js';
import { recipient } from '../server/services/mail.js';

const baseTime = new Date('2026-11-17T12:00:00+02:00');
const pdfDoc = await PDFDocument.create(); pdfDoc.addPage();
const pdf = Buffer.from(await pdfDoc.save());
const references = Array.from({length:3}, (_,i) => ({name:`Referência ${i+1}`, organization:'Organização / cargo', contact:'ref@example.org'}));

// ZIP independente, com CRC real, para construir um DOCX mínimo nos testes.
function zip(files) {
  const locals=[], centrals=[]; let offset=0;
  const crc32 = bytes => { let crc=0xffffffff; for (const byte of bytes) { crc ^= byte; for(let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; };
  for (const [name,content] of Object.entries(files)) {
    const n=Buffer.from(name), b=Buffer.from(content), crc=crc32(b);
    const local=Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4); local.writeUInt32LE(crc,14); local.writeUInt32LE(b.length,18); local.writeUInt32LE(b.length,22); local.writeUInt16LE(n.length,26);
    locals.push(local,n,b);
    const central=Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt32LE(crc,16); central.writeUInt32LE(b.length,20); central.writeUInt32LE(b.length,24); central.writeUInt16LE(n.length,28); central.writeUInt32LE(offset,42);
    centrals.push(central,n); offset += local.length+n.length+b.length;
  }
  const directory=Buffer.concat(centrals), end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length,8); end.writeUInt16LE(Object.keys(files).length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
const docxParts = {
  '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml':'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Exemplo</w:t></w:r></w:p></w:body></w:document>',
};

async function setup(t, overrides={}, customTransport) {
  const root = await mkdtemp(join(tmpdir(),'protege-test-'));
  const config = loadConfig({ APPLICATIONS_ENABLED:'true', PRIVACY_APPROVED:'true', PRIVACY_POLICY_VERSION:'teste-v1', PRIVACY_POLICY_TEXT:'Política fictícia apenas para testes.', APPLICATION_SECRET:'s'.repeat(64), SMTP_HOST:'smtp.invalid', SMTP_USER:'mock', SMTP_PASS:'mock', SMTP_FROM:'portal@example.org', UPLOAD_TEMP_DIR:join(root,'uploads'), DEDUP_DIR:join(root,'dedup'), MIN_FORM_SECONDS:'0', RATE_LIMIT_MAX:'100', ...overrides });
  const messages=[];
  const mime = nodemailer.createTransport({ streamTransport:true, buffer:true, newline:'unix' });
  const transport = customTransport || { verify:async()=>true, sendMail:async message => {
    const compiled=await mime.sendMail(message); messages.push({ message, raw:compiled.message.toString() }); return { accepted:[recipient], rejected:[] };
  } };
  let now=new Date(baseTime);
  const events=[];
  const app=await createApp({config, transport, clock:()=>now, log:(...args)=>events.push(args)});
  const server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  const url=`http://127.0.0.1:${server.address().port}/api/v1`;
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true})});
  const getConfig=async()=> (await fetch(`${url}/config`)).json();
  async function submit(changes={}, options={}) {
    const publicConfig=await getConfig();
    const data={name:'Candidato Exemplo',email:'teste@example.org',phone:'+258 841234567',jobId:'campo',district:'Massangena',references:JSON.stringify(references),consent:'true',privacyVersion:'teste-v1',website:'',formToken:publicConfig.formToken,...changes};
    const form=new FormData();
    for(const [key,value] of Object.entries(data)) if(value !== undefined) form.append(key,value);
    for(const field of options.appendFields || []) form.append(...field);
    for(const field of ['cv','letter','certificates']) {
      if(options.omit === field) continue;
      const docs=options[field] || [{bytes:pdf,name:'documento.pdf'}];
      for(const doc of docs) form.append(field,new Blob([doc.bytes],{type:doc.type || 'application/pdf'}),doc.name);
    }
    const response=await fetch(`${url}/applications`,{method:'POST',headers:{'Idempotency-Key':options.key || randomUUID(),...options.headers},body:form});
    return {status:response.status,body:await response.json()};
  }
  async function assertClean() {
    // A resposta pode chegar antes do finally assíncrono terminar.
    for(let i=0;i<50;i++) { if(!(await readdir(config.tempRoot)).length) return; await new Promise(r=>setTimeout(r,10)); }
    assert.deepEqual(await readdir(config.tempRoot),[]);
  }
  return {root,config,messages,events,url,getConfig,submit,assertClean,setTime:value=>{now=new Date(value)}};
}

test('candidatura válida gera MIME com todos os anexos reais e limpa temporários',async t=>{
  const ctx=await setup(t);
  const result=await ctx.submit({}, {certificates:[{bytes:pdf,name:'certificado1.pdf'},{bytes:pdf,name:'certificado2.pdf'}]});
  assert.equal(result.status,201,JSON.stringify(result.body)); assert.equal(result.body.status,'accepted');
  assert.equal(ctx.messages.length,1); const {message,raw}=ctx.messages[0];
  assert.equal(message.to,recipient); assert.equal(message.attachments.length,4);
  assert.equal(message.subject,'Candidatura – Técnico/a de Campo – Massangena');
  assert.match(message.text,/Referência 3/); assert.match(message.text,/Africa\/Maputo/);
  assert.equal((raw.match(/Content-Disposition: attachment/g)||[]).length,4);
  assert.ok(raw.includes(pdf.toString('base64').slice(0,60)));
  for(const attachment of message.attachments) assert.deepEqual(attachment.content,pdf);
  await ctx.assertClean();
  assert.equal((await stat(ctx.config.tempRoot)).mode & 0o777,0o700);
  assert.ok(!JSON.stringify(ctx.events).includes('teste@example.org'));
});

test('campos e documentos obrigatórios ausentes',async t=>{
  const ctx=await setup(t); const result=await ctx.submit({name:undefined,email:undefined,phone:undefined,consent:undefined},{omit:'cv'});
  assert.equal(result.status,422); for(const key of ['name','email','phone','consent','cv']) assert.ok(result.body.fields[key]);
  assert.equal(ctx.messages.length,0); await ctx.assertClean();
});
test('distrito inválido para supervisor',async t=>{const c=await setup(t);const r=await c.submit({jobId:'supervisor',district:'Mapai'});assert.equal(r.status,422);assert.ok(r.body.fields.district)});
test('vaga inexistente',async t=>{const c=await setup(t);const r=await c.submit({jobId:'inexistente'});assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_JOB')});
test('referências malformadas e campo repetido não causam erro interno',async t=>{const c=await setup(t);for(const references of ['{}','null','[{}, {}, {}]','invalido']) assert.equal((await c.submit({references})).status,422);assert.equal((await c.submit({}, {appendFields:[['name','Outro nome']]})).status,400)});
test('extensão não autorizada',async t=>{const c=await setup(t);const r=await c.submit({}, {cv:[{bytes:pdf,name:'cv.exe'}]});assert.equal(r.status,422);await c.assertClean()});
test('PDF forjado, vazio e corrompido',async t=>{const c=await setup(t);for(const bytes of [Buffer.from('texto'),Buffer.alloc(0),Buffer.from('%PDF-1.7\nmalformed\n%%EOF')]) {const r=await c.submit({}, {cv:[{bytes,name:'cv.pdf'}]});assert.equal(r.status,422)}assert.equal(c.messages.length,0);await c.assertClean()});
test('PDF com JavaScript é rejeitado',async t=>{
  const document=await PDFDocument.create();document.addPage();
  document.catalog.set(PDFName.of('OpenAction'),document.context.obj({ S:PDFName.of('JavaScript'),JS:PDFString.of('app.alert(1)') }));
  const c=await setup(t);const r=await c.submit({}, {cv:[{bytes:await document.save(),name:'activo.pdf'}]});assert.equal(r.status,422);await c.assertClean();
});
test('DOCX estruturalmente válido é aceite; MIME declarado é ignorado',async t=>{const c=await setup(t);const r=await c.submit({}, {cv:[{bytes:zip(docxParts),name:'cv.docx',type:'text/plain'}]});assert.equal(r.status,201,JSON.stringify(r.body));assert.match(c.messages[0].message.attachments[0].contentType,/wordprocessingml/)});
test('ZIP genérico e DOCX com macros são rejeitados',async t=>{const c=await setup(t);for(const bytes of [zip({'file.txt':'text'}),zip({...docxParts,'word/vbaProject.bin':'payload'})]) assert.equal((await c.submit({}, {cv:[{bytes,name:'cv.docx'}]})).status,422);await c.assertClean()});
test('ficheiro demasiado grande é rejeitado e eliminado',async t=>{const c=await setup(t,{MAX_FILE_BYTES:'1024'});const r=await c.submit({}, {cv:[{bytes:Buffer.alloc(2048),name:'grande.pdf'}]});assert.equal(r.status,413);await c.assertClean();assert.equal(c.messages.length,0)});
test('limite total também é imposto durante o carregamento',async t=>{const c=await setup(t,{MAX_TOTAL_BYTES:'1024'});const r=await c.submit();assert.equal(r.status,413);await c.assertClean()});
test('falha SMTP antes do envio permite repetir sem sucesso falso',async t=>{
  let failed=true;const transport={verify:async()=>{if(failed)throw new Error('senha e dados sensíveis');return true},sendMail:async()=>({accepted:[recipient]})};
  const c=await setup(t,{},transport);const r=await c.submit();assert.equal(r.status,502);assert.equal(r.body.code,'EMAIL_FAILED');assert.ok(!JSON.stringify(r.body).includes('sensíveis'));await c.assertClean();failed=false;assert.equal((await c.submit()).status,201);
});
test('timeout SMTP após tentativa é ambíguo e impede reenvio',async t=>{
  let sends=0;const c=await setup(t,{}, {verify:async()=>true,sendMail:async()=>{sends++;throw new Error('timeout')}});
  const r=await c.submit();assert.equal(r.status,502);assert.equal(r.body.code,'EMAIL_UNCERTAIN');assert.equal((await c.submit()).status,409);assert.equal(sends,1);await c.assertClean();
});
test('destinatário rejeitado não gera confirmação',async t=>{const c=await setup(t,{}, {verify:async()=>true,sendMail:async()=>({accepted:[],rejected:[recipient]})});const r=await c.submit();assert.equal(r.status,502)});
test('submissão fora do prazo bloqueada na fronteira de Maputo',async t=>{const c=await setup(t);c.setTime('2026-11-21T00:00:00+02:00');const r=await c.submit();assert.equal(r.status,410);assert.equal(c.messages.length,0);await c.assertClean()});
test('prazo por vaga é configurável',async t=>{const c=await setup(t,{JOB_DEADLINES_JSON:'{"campo":"2026-11-17T11:59:00+02:00"}'});assert.equal((await c.submit()).status,410);const config=await c.getConfig();assert.equal(config.jobs.find(j=>j.id==='campo').closed,true);assert.equal(config.jobs.find(j=>j.id==='infra').closed,false)});
test('mesma chave devolve confirmação anterior; outra chave não duplica SMTP',async t=>{const c=await setup(t);const key=randomUUID();const first=await c.submit({}, {key});const repeat=await c.submit({}, {key});assert.equal(first.status,201);assert.equal(repeat.status,200);assert.equal(first.body.applicationId,repeat.body.applicationId);assert.equal((await c.submit()).status,409);assert.equal(c.messages.length,1)});
test('submissões simultâneas só originam um e-mail',async t=>{const c=await setup(t);const results=await Promise.all([c.submit(),c.submit()]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(c.messages.length,1);await c.assertClean()});
test('registo de duplicados persiste e não contém dados pessoais',async t=>{const c=await setup(t);await c.submit();const names=await readdir(c.config.dedupRoot);assert.equal(names.length,1);const text=await readFile(join(c.config.dedupRoot,names[0]),'utf8');assert.ok(!text.includes('teste@example.org'));assert.ok(!text.includes('Candidato'));assert.equal(JSON.parse(text).state,'accepted')});
test('candidaturas fechadas por defeito e SMTP não configurado',async t=>{
  const c=await setup(t,{APPLICATIONS_ENABLED:'false',PRIVACY_APPROVED:'false'});assert.equal((await c.getConfig()).available,false);assert.equal((await c.submit()).status,503);
  const other=await setup(t,{SMTP_HOST:''});assert.equal((await other.getConfig()).available,false);assert.equal((await other.submit()).status,503);
});
test('aprovação e segredo são obrigatórios para habilitar candidaturas',()=>{assert.throws(()=>loadConfig({APPLICATIONS_ENABLED:'true'}));assert.throws(()=>loadConfig({APPLICATIONS_ENABLED:'true',PRIVACY_APPROVED:'true',PRIVACY_POLICY_TEXT:'x',PRIVACY_POLICY_VERSION:'v1'}));assert.throws(()=>loadConfig({APPLICATION_DEADLINE_AT:'2026-11-20T23:59:00Z'}))});
test('origem não autorizada bloqueada e preflight restrito',async t=>{const c=await setup(t);const r=await c.submit({}, {headers:{Origin:'https://evil.invalid'}});assert.equal(r.status,403);const preflight=await fetch(`${c.url}/applications`,{method:'OPTIONS',headers:{Origin:'http://localhost:5173','Access-Control-Request-Method':'POST'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:5173')});
test('honeypot, token inválido e consentimento desactualizado',async t=>{const c=await setup(t);assert.equal((await c.submit({website:'bot'})).status,400);assert.equal((await c.submit({formToken:'falso'})).status,400);const r=await c.submit({privacyVersion:'antiga'});assert.equal(r.status,422);assert.ok(r.body.fields.consent)});
test('tempo mínimo e expiração do formulário',async t=>{const c=await setup(t,{MIN_FORM_SECONDS:'3'});const config=await c.getConfig();assert.equal((await c.submit({formToken:config.formToken})).status,400);c.setTime(new Date(baseTime.getTime()+4000));assert.equal((await c.submit({formToken:config.formToken})).status,201);c.setTime(new Date(baseTime.getTime()+3*3600000));assert.equal((await c.submit({email:'outro@example.org',formToken:config.formToken})).status,400)});
test('limitação de pedidos por IP',async t=>{const c=await setup(t,{RATE_LIMIT_MAX:'1'});assert.equal((await c.submit({jobId:'inexistente'})).status,400);assert.equal((await c.submit()).status,429)});

test('protocolo SMTP simulado em loopback recebe MIME completo e confirma aceitação',async t=>{
  const messages=[];
  const sockets=new Set();
  const smtp=createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    socket.write('220 mock.local ESMTP\r\n');
    let buffer='',data=false,lines=[];
    socket.on('data',chunk=>{
      buffer+=chunk.toString();
      let end;
      while((end=buffer.indexOf('\r\n'))>=0) {
        const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
        if(data) {
          if(line==='.') {messages.push(lines.join('\r\n'));lines=[];data=false;socket.write('250 2.0.0 accepted\r\n');}
          else lines.push(line.replace(/^\.\./,'.'));
        } else if(/^EHLO|^HELO/i.test(line)) socket.write('250 mock.local\r\n');
        else if(/^MAIL FROM:|^RCPT TO:|^RSET/i.test(line)) socket.write('250 2.1.0 OK\r\n');
        else if(/^DATA$/i.test(line)) {data=true;socket.write('354 Send data\r\n');}
        else if(/^QUIT/i.test(line)) socket.end('221 Bye\r\n');
        else socket.write('500 Unknown command\r\n');
      }
    });
  });
  smtp.listen(0,'127.0.0.1');await new Promise(resolve=>smtp.once('listening',resolve));
  t.after(async()=>{for(const socket of sockets) socket.destroy();await new Promise(resolve=>smtp.close(resolve))});
  const transport=nodemailer.createTransport({host:'127.0.0.1',port:smtp.address().port,secure:false,ignoreTLS:true,connectionTimeout:2000,greetingTimeout:2000,socketTimeout:2000});
  const c=await setup(t,{},transport);const r=await c.submit();assert.equal(r.status,201,JSON.stringify(r.body));assert.equal(messages.length,1);
  assert.match(messages[0],/To: recrutamentoprotege1@gmail.com/);assert.equal((messages[0].match(/Content-Disposition: attachment/g)||[]).length,3);assert.ok(messages[0].includes(pdf.toString('base64').slice(0,60)));
  await c.assertClean();
});

test('rejeição SMTP explícita permite tentar novamente sem bloquear como incerto',async t=>{
  let reject=true,sends=0;
  const c=await setup(t,{}, {verify:async()=>true,sendMail:async()=>{sends++;if(reject){const error=new Error('rejected');error.responseCode=550;throw error}return {accepted:[recipient]}}});
  const r=await c.submit();assert.equal(r.status,502);assert.equal(r.body.code,'EMAIL_FAILED');reject=false;assert.equal((await c.submit()).status,201);assert.equal(sends,2);
});

test('ficheiros de campo inesperado e certificados em excesso são rejeitados',async t=>{
  const c=await setup(t,{MAX_CERTIFICATES:'1'});
  const r=await c.submit({}, {certificates:[{bytes:pdf,name:'a.pdf'},{bytes:pdf,name:'b.pdf'}]});assert.equal(r.status,400);
  const unknown=await c.submit({}, {appendFields:[['unexpected',new Blob([pdf]),'outro.pdf']]});assert.equal(unknown.status,400);await c.assertClean();assert.equal(c.messages.length,0);
});

test('interrupção do upload elimina o ficheiro parcial privado',async t=>{
  const c=await setup(t);
  const boundary='test-boundary';
  const upload=request(`${c.url}/applications`,{method:'POST',headers:{'Content-Type':`multipart/form-data; boundary=${boundary}`,'Idempotency-Key':randomUUID()}});
  upload.on('error',()=>{});
  upload.write(`--${boundary}\r\nContent-Disposition: form-data; name="cv"; filename="cv.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
  upload.write(pdf);
  let found=false;
  for(let i=0;i<50;i++) {
    const directories=await readdir(c.config.tempRoot);
    if(directories.length) {
      const files=await readdir(join(c.config.tempRoot,directories[0]));
      if(files.length) {assert.equal((await stat(join(c.config.tempRoot,directories[0],files[0]))).mode & 0o777,0o600);found=true;break;}
    }
    await new Promise(r=>setTimeout(r,10));
  }
  assert.ok(found,'o upload deve criar um ficheiro temporário privado');
  upload.destroy();await c.assertClean();assert.equal(c.messages.length,0);
});
test('multipart malformado devolve 400 sem erro interno nem resíduos',async t=>{
  const c=await setup(t);
  for(const [body,type] of [
    ['abc','multipart/form-data'],
    ['--XX\r\nGarbage\r\n\r\nv\r\n--XX--\r\n','multipart/form-data; boundary=XX'],
    ['--XX\r\nContent-Disposition: form-data; name="name"\r\n\r\nabc','multipart/form-data; boundary=XX'],
  ]) {
    const response=await fetch(`${c.url}/applications`,{method:'POST',headers:{'Content-Type':type,'Idempotency-Key':randomUUID()},body});
    assert.equal(response.status,400);
    assert.equal((await response.json()).code,'INVALID_MULTIPART');
  }
  assert.ok(!c.events.some(([event])=>event==='internal_error'));
  await c.assertClean();assert.equal(c.messages.length,0);
});
