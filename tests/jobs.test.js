import test from 'node:test';
import assert from 'node:assert/strict';
import { jobs, project, districtsFor, deadlineFor, isJobClosed, formatDeadline } from '../src/config/jobs.js';

test('quatro categorias, identificadores únicos, 17 postos e anúncios completos',()=>{
  assert.equal(jobs.length,4);assert.equal(new Set(jobs.map(job=>job.id)).size,4);assert.equal(jobs.reduce((sum,job)=>sum+job.count,0),17);
  for(const job of jobs) {assert.ok(job.objective);assert.ok(job.responsibilities.length);assert.ok(job.applicationDocs.length);assert.ok(job.emailSubject)}
  assert.equal(project.email,'recrutamentoprotege1@gmail.com');
});
test('distritos limitados por função',()=>{
  for(const job of jobs) assert.deepEqual(districtsFor(job),job.id==='supervisor'?['Massangena']:['Guijá','Mapai','Massangena']);
});
test('fronteira do prazo em Maputo e prazo individual para futuras vagas',()=>{
  for(const job of jobs) {assert.equal(isJobClosed(job,Date.parse('2026-11-20T23:59:59+02:00')),false);assert.equal(isJobClosed(job,Date.parse('2026-11-21T00:00:00+02:00')),true)}
  const future={...jobs[0],deadlineAt:'2027-01-01T00:00:00+02:00'};assert.equal(deadlineFor(future),future.deadlineAt);assert.equal(isJobClosed(future,Date.parse(project.deadlineAt)),false);
});
test('prazo apresentado como último minuto válido, independentemente do fuso local',()=>{
  const label=formatDeadline(project.deadlineAt);assert.match(label,/20/);assert.match(label,/Novembro/);assert.match(label,/2026/);assert.match(label,/23:59/);
});
