import { createHmac, createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { HttpError } from './errors.js';

export function createDeduplication(config) {
  const hash = value => createHmac('sha256', config.secret).update(value).digest('hex');
  async function claim(data, files, idempotencyKey, now) {
    const digest = createHash('sha256').update(JSON.stringify({ name:data.name, email:data.email, phone:data.phone, jobId:data.jobId, district:data.district, references:data.references, privacyVersion:data.privacyVersion }));
    for (const file of files) digest.update(file.fieldname).update(await readFile(file.path));
    const payloadHash = hash(digest.digest('hex'));
    const keyHash = hash(idempotencyKey);
    // Mesmo candidato, vaga e distrito: impedir novos envios durante a janela configurada.
    const path = join(config.dedupRoot, `${hash(`${data.email}\0${data.jobId}\0${data.district}`)}.json`);
    const entry = { keyHash, payloadHash, state:'pending', applicationId:randomUUID(), createdAt:now };
    try { await writeFile(path, JSON.stringify(entry), { flag:'wx', mode:0o600 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let existing;
      try { existing = JSON.parse(await readFile(path, 'utf8')); } catch { throw new HttpError(409, 'DUPLICATE_PENDING', 'Existe uma candidatura em processamento. Não volte a enviar.'); }
      if (existing.state === 'accepted' && existing.keyHash === keyHash && existing.payloadHash === payloadHash) return { replay:true, ...existing };
      throw new HttpError(409, 'DUPLICATE_APPLICATION', 'Já existe uma candidatura enviada ou em processamento para esta vaga e distrito. Se houve uma falha de ligação, contacte a PROTEGE antes de repetir.');
    }
    return { ...entry, path };
  }
  async function mark(entry, state) {
    const temporary = `${entry.path}.${randomUUID()}.tmp`;
    const { path, ...record } = entry;
    try { await writeFile(temporary, JSON.stringify({ ...record, state }), { flag:'wx', mode:0o600 }); await rename(temporary, path); }
    finally { await rm(temporary, { force:true }); }
  }
  return { claim, mark, release: entry => rm(entry.path, { force:true }) };
}
