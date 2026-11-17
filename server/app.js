import express from 'express';
import multer from 'multer';
import { relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config/index.js';
import { createUpload } from './middleware/upload.js';
import { createRoutes } from './routes/index.js';
import { createMailService } from './services/mail.js';
import { createDeduplication } from './services/deduplication.js';
import { preparePrivateDirectory, cleanOldFiles } from './services/storage.js';
import { HttpError } from './services/errors.js';

export async function createApp({ config = loadConfig(), transport, clock = () => new Date(), log = (event, requestId) => console.info(JSON.stringify({ event, requestId })) } = {}) {
  for (const [a,b] of [[config.tempRoot,config.dedupRoot],[config.dedupRoot,config.tempRoot]]) {
    const path = relative(a,b);
    if (!path || (!path.startsWith('..') && !path.startsWith('/'))) throw new Error('Temporários e duplicados precisam de directórios separados.');
  }
  await preparePrivateDirectory(config.tempRoot, config.publicRoot);
  await preparePrivateDirectory(config.dedupRoot, config.publicRoot);
  await cleanOldFiles(config);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustedProxies);
  app.use((req,res,next) => {
    req.requestId = randomUUID();
    res.set({ 'X-Request-Id':req.requestId, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'" });
    const origin = req.get('origin');
    if (origin && !config.origins.includes(origin)) return next(new HttpError(403, 'ORIGIN_DENIED', 'Origem não autorizada.'));
    if (origin) { res.set('Access-Control-Allow-Origin', origin); res.vary('Origin'); }
    if (req.method === 'OPTIONS') return res.set({ 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Access-Control-Allow-Headers':'Content-Type, Idempotency-Key' }).status(204).end();
    next();
  });
  app.use('/api/v1', createRoutes({ config, clock, log, upload:createUpload(config), mail:createMailService(config,transport), dedup:createDeduplication(config) }));
  app.use((req,res) => res.status(404).json({ code:'NOT_FOUND', message:'Endpoint não encontrado.' }));
  app.use((error,req,res,next) => {
    if (res.headersSent) return next(error);
    let status = error instanceof HttpError ? error.status : 500;
    let code = error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
    let message = error instanceof HttpError ? error.message : 'Não foi possível concluir o pedido. Tente novamente mais tarde.';
    if (error instanceof multer.MulterError) {
      status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      code = error.code;
      message = error.code === 'LIMIT_FILE_SIZE' ? 'Um ficheiro excede o tamanho permitido.' : 'Número, tamanho ou campos dos documentos inválidos.';
    }
    if (status === 500) log('internal_error', req.requestId);
    res.status(status).json({ code, message, ...(error.fields ? { fields:error.fields } : {}), requestId:req.requestId });
  });
  return app;
}
