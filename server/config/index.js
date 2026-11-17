import { resolve, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

function integer(value, fallback, min, max) {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error('Configuração numérica inválida.');
  return n;
}
function boolean(value) {
  if (value !== undefined && value !== '' && value !== 'true' && value !== 'false') throw new Error('Configuração booleana inválida: utilize true ou false.');
  return value === 'true';
}
function deadline(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+02:00$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('Prazo inválido: utilize ISO 8601 com +02:00 (Africa/Maputo).');
  if (new Date(Date.parse(value) + 2 * 3600000).toISOString().slice(0,19) !== value.slice(0,19)) throw new Error('Data de encerramento impossível.');
  return value;
}
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const enabled = boolean(env.APPLICATIONS_ENABLED);
  const privacyApproved = boolean(env.PRIVACY_APPROVED);
  const privacyText = env.PRIVACY_POLICY_TEXT?.trim() || '';
  const privacyVersion = env.PRIVACY_POLICY_VERSION?.trim() || '';
  if (enabled && (!privacyApproved || !privacyText || !privacyVersion)) throw new Error('A abertura exige política aprovada, texto e versão.');
  if (enabled && (env.APPLICATION_SECRET || '').length < 32) throw new Error('APPLICATION_SECRET deve ter pelo menos 32 caracteres.');
  const smtp = { host: env.SMTP_HOST || '', port: integer(env.SMTP_PORT, 587, 1, 65535), secure: boolean(env.SMTP_SECURE), user: env.SMTP_USER || '', pass: env.SMTP_PASS || '', from: env.SMTP_FROM || '' };
  const smtpConfigured = !!(smtp.host && smtp.user && smtp.pass && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(smtp.from));
  const overrides = JSON.parse(env.JOB_DEADLINES_JSON || '{}');
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('JOB_DEADLINES_JSON deve ser um objecto.');
  for (const value of Object.values(overrides)) deadline(value);
  const origins = (env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(s => s.trim());
  if (origins.some(s => new URL(s).origin !== s || s === '*')) throw new Error('Origens CORS inválidas.');
  const publicRoot = env.PUBLIC_ROOT ? resolve(env.PUBLIC_ROOT) : null;
  if (production) {
    if (!env.ALLOWED_ORIGINS || origins.some(origin => !origin.startsWith('https://') || ['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))) throw new Error('Produção exige origens HTTPS explícitas.');
    for (const name of ['PUBLIC_ROOT','UPLOAD_TEMP_DIR','DEDUP_DIR']) if (!env[name] || !isAbsolute(env[name])) throw new Error('Produção exige PUBLIC_ROOT, UPLOAD_TEMP_DIR e DEDUP_DIR absolutos.');
    if ((env.APPLICATION_SECRET || '').length < 32) throw new Error('Produção exige APPLICATION_SECRET estável com pelo menos 32 caracteres.');
  }
  if ((smtp.port === 465 && !smtp.secure) || (smtp.port === 587 && smtp.secure)) throw new Error('Encriptação incompatível com a porta SMTP padrão.');
  const maxTotalBytes = integer(env.MAX_TOTAL_BYTES, 15 * 1024 * 1024, 1024, 20 * 1024 * 1024);
  const smtpMaxMessageBytes = integer(env.SMTP_MAX_MESSAGE_BYTES, 0, 0, 100 * 1024 * 1024);
  if (production && smtpConfigured && !smtpMaxMessageBytes) throw new Error('Confirmar SMTP_MAX_MESSAGE_BYTES com o fornecedor antes de configurar SMTP em produção.');
  if (smtpMaxMessageBytes && Math.ceil(maxTotalBytes / 57) * 78 + 256 * 1024 > smtpMaxMessageBytes) throw new Error('Os anexos e a codificação MIME excedem o limite SMTP declarado.');
  return {
    production, publicRoot, smtpMaxMessageBytes,
    enabled, privacyApproved, privacyText, privacyVersion, smtp, smtpConfigured, origins,
    secret: env.APPLICATION_SECRET || randomBytes(32).toString('hex'),
    port: integer(env.PORT, 3001, 1, 65535), host: env.HOST || '127.0.0.1',
    // Não confiar em X-Forwarded-For sem configurar os IP/CIDR exactos do proxy.
    trustedProxies: env.TRUSTED_PROXIES ? env.TRUSTED_PROXIES.split(',').map(s => s.trim()) : false,
    deadlineAt: deadline(env.APPLICATION_DEADLINE_AT || '2026-11-21T00:00:00+02:00'), deadlines: overrides,
    maxFileBytes: integer(env.MAX_FILE_BYTES, 5 * 1024 * 1024, 1024, 10 * 1024 * 1024),
    maxTotalBytes,
    maxCertificates: integer(env.MAX_CERTIFICATES, 5, 1, 10),
    tempRoot: resolve(env.UPLOAD_TEMP_DIR || `${tmpdir()}/protege-recruitment`),
    dedupRoot: resolve(env.DEDUP_DIR || './.runtime/dedup'),
    dedupTtlMs: integer(env.DEDUP_TTL_HOURS, 24, 1, 168) * 3600000,
    minFillMs: integer(env.MIN_FORM_SECONDS, 3, 0, 60) * 1000,
    tokenTtlMs: 2 * 3600000,
    rateMax: integer(env.RATE_LIMIT_MAX, 5, 1, 1000),
    rateWindowMs: integer(env.RATE_LIMIT_WINDOW_MINUTES, 15, 1, 60) * 60000,
  };
}
export const deadlineFor = (config, job) => config.deadlines[job.id] || job.deadlineAt || config.deadlineAt;
