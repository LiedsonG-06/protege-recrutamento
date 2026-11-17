import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpError } from './errors.js';
const mac = (secret, payload) => createHmac('sha256', secret).update(payload).digest('hex');
export function issueChallenge(config, now) {
  const payload = `${now}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${mac(config.secret, payload)}`;
}
export function checkChallenge(token, config, now) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) throw new HttpError(400, 'FORM_EXPIRED', 'Reabra o formulário para obter uma sessão válida.');
  const age = now - Number(parts[0]);
  if (!timingSafeEqual(Buffer.from(parts[2], 'hex'), Buffer.from(mac(config.secret, `${parts[0]}.${parts[1]}`), 'hex')) || age < config.minFillMs || age > config.tokenTtlMs) throw new HttpError(400, 'FORM_EXPIRED', 'Aguarde alguns segundos ou reabra o formulário e tente novamente.');
}
