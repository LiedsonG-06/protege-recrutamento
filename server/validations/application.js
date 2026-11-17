import { jobs } from '../../src/config/jobs.js';
import { validateApplication } from '../../src/config/application.js';
import { deadlineFor } from '../config/index.js';
import { HttpError } from '../services/errors.js';
import { checkChallenge } from '../services/challenge.js';

export function validateRequest(req, config, now) {
  const body = req.body || {};
  const allowed = ['name', 'email', 'phone', 'jobId', 'district', 'references', 'consent', 'privacyVersion', 'website', 'formToken'];
  if (Object.keys(body).some(key => !allowed.includes(key) || typeof body[key] !== 'string' || /[\u0000-\u001f\u007f]/.test(body[key]))) throw new HttpError(400, 'INVALID_FIELDS', 'Campos inválidos ou repetidos.');
  if ((body.website || '').trim()) throw new HttpError(400, 'INVALID_FORM', 'Não foi possível validar o formulário.');
  checkChallenge(body.formToken, config, now.getTime());
  const job = jobs.find(job => job.id === body.jobId);
  if (!job) throw new HttpError(400, 'INVALID_JOB', 'A vaga seleccionada não existe.');
  const deadlineAt = deadlineFor(config, job);
  if (now >= new Date(deadlineAt)) throw new HttpError(410, 'DEADLINE_PASSED', 'Candidaturas encerradas.');
  let references;
  try { references = JSON.parse(body.references); } catch { throw new HttpError(422, 'INVALID_REFERENCES', 'Indique três referências válidas.'); }
  if (!Array.isArray(references) || references.length !== 3 || references.some(r => !r || typeof r !== 'object' || Array.isArray(r) || ['name','organization','contact'].some(k => typeof r[k] !== 'string' || r[k].length > 200 || /[\u0000-\u001f\u007f]/.test(r[k])) || Object.keys(r).some(k => !['name','organization','contact'].includes(k)))) throw new HttpError(422, 'INVALID_REFERENCES', 'Indique três referências válidas (até 200 caracteres por campo).');
  const data = { ...body, references, consent: body.consent === 'true' };
  for (const key of ['cv','letter','certificates']) data[key] = (req.files?.[key] || []).map(f => ({ name: f.originalname, size: f.size }));
  const errors = validateApplication(data, job, now, { ...config, deadlineAt });
  if ((body.email || '').length > 254) errors.email = 'O e-mail excede o tamanho permitido.';
  if ((body.phone || '').length > 30) errors.phone = 'O telefone excede o tamanho permitido.';
  if (body.privacyVersion !== config.privacyVersion) errors.consent = 'A política foi actualizada. Reabra o formulário e leia a versão actual.';
  if (Object.keys(errors).length) throw new HttpError(422, 'VALIDATION_FAILED', 'Verifique os campos indicados.', errors);
  for (const key of ['name','email','phone','district']) data[key] = data[key].trim();
  data.email = data.email.toLowerCase();
  return { data, job, deadlineAt };
}
