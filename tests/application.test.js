import test from 'node:test';
import assert from 'node:assert/strict';
import { validateApplication, districtsFor } from '../src/config/application.js';
import { jobs } from '../src/config/jobs.js';
const now = new Date('2026-11-17T12:00:00+02:00');
const pdf = { name: 'documento.pdf', size: 1000 };
function valid() { return { name: 'Candidato Exemplo', email: 'teste@example.org', phone: '+258 841234567', district: 'Massangena', cv: [pdf], letter: [pdf], certificates: [pdf, pdf], references: Array.from({length:3}, () => ({ name:'Referência', organization:'Organização', contact:'ref@example.org' })), consent:true }; }
test('quatro categorias e 17 postos; distritos permitidos', () => {
  assert.equal(jobs.length, 4); assert.equal(jobs.reduce((n,j) => n+j.count, 0),17);
  assert.deepEqual(districtsFor(jobs[3]), ['Massangena']); assert.equal(districtsFor(jobs[0]).length,3);
});
test('dados válidos e múltiplos certificados', () => assert.deepEqual(validateApplication(valid(), jobs[0], now), {}));
test('campos obrigatórios, referências e consentimento', () => {
  const errors = validateApplication({}, jobs[0], now);
  for (const key of ['name','email','phone','district','cv','letter','certificates','reference0','reference1','reference2','consent']) assert.ok(errors[key], key);
});
test('supervisor rejeita outro distrito; contacto inválido', () => {
  const data = valid(); data.district = 'Mapai'; data.phone='abcdefgh';
  const errors=validateApplication(data,jobs[3],now); assert.ok(errors.district); assert.ok(errors.phone);
});
test('extensão, ficheiro vazio, tamanho, total e número de certificados', () => {
  for (const file of [{name:'virus.exe',size:1},{name:'vazio.pdf',size:0},{name:'grande.pdf',size:6*1024*1024}]) {
    const data=valid(); data.cv=[file]; assert.ok(validateApplication(data,jobs[0],now).cv);
  }
  const data=valid(); data.certificates=Array(6).fill(pdf); assert.ok(validateApplication(data,jobs[0],now).certificates);
  data.certificates=Array(3).fill({name:'doc.pdf',size:5*1024*1024}); assert.ok(validateApplication(data,jobs[0],now).files);
});
test('limite actual à meia-noite de Maputo', () => {
  assert.deepEqual(validateApplication(valid(),jobs[0],new Date('2026-11-20T23:59:59+02:00')),{});
  assert.ok(validateApplication(valid(),jobs[0],new Date('2026-11-21T00:00:00+02:00')).deadline);
});
