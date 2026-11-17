import { Worker } from 'node:worker_threads';
import { extname } from 'node:path';
import { HttpError } from './errors.js';

export async function validateDocuments(files) {
  for (const file of files) {
    const extension = extname(file.originalname).slice(1).toLowerCase();
    const valid = await new Promise(resolve => {
      const worker = new Worker(new URL('./document-worker.js', import.meta.url), {
        workerData: { path: file.path, extension }, resourceLimits: { maxOldGenerationSizeMb: 128 }, stdout: true, stderr: true,
      });
      worker.stdout.resume(); worker.stderr.resume();
      const timer = setTimeout(() => { worker.terminate(); resolve(false); }, 5000);
      const finish = result => { clearTimeout(timer); worker.terminate(); resolve(result); };
      worker.once('message', finish); worker.once('error', () => finish(false)); worker.once('exit', () => finish(false));
    });
    if (!valid) throw new HttpError(422, 'INVALID_DOCUMENT', 'Um documento está danificado, protegido, contém conteúdo activo ou não corresponde a um PDF/DOCX válido.');
    file.extension = extension;
    file.contentType = extension === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
}
