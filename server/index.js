import { loadConfig } from './config/index.js';
import { createApp } from './app.js';
import { cleanOldFiles } from './services/storage.js';

process.umask(0o077);
try {
  const config = loadConfig();
  const app = await createApp({ config });
  // No Express 5 os erros de listen chegam ao callback; não anunciar arranque se a porta falhar.
  const server = app.listen(config.port, config.host, error => {
    if (error) {
      console.error(error.code === 'EADDRINUSE'
        ? `A porta ${config.port} já está ocupada — provavelmente a API já está a correr noutro terminal. Feche-a (Ctrl+C) ou altere PORT no .env.`
        : `Não foi possível abrir a porta ${config.port} (${error.code || error.message}).`);
      process.exitCode = 1;
      return;
    }
    console.info(`API local em http://${config.host}:${config.port}; candidaturas ${config.enabled ? 'habilitadas por configuração' : 'bloqueadas'}.`);
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  const cleanup = setInterval(() => cleanOldFiles(config).catch(() => console.error('Falha na limpeza periódica.')), 3600000);
  cleanup.unref();
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => { clearInterval(cleanup); server.close(() => process.exit(0)); });
} catch { console.error('Não foi possível iniciar a API. Verifique a configuração e as permissões dos directórios privados.'); process.exitCode = 1; }
