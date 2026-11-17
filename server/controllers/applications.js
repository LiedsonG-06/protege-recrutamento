import { mkdtemp, rm } from 'node:fs/promises';
import multer from 'multer';
import { join } from 'node:path';
import { validateRequest } from '../validations/application.js';
import { validateDocuments } from '../services/documents.js';
import { HttpError } from '../services/errors.js';

// Erros do parser multipart (boundary em falta, partes malformadas, fim inesperado) não têm `code`
// e resultam do pedido do cliente: devolver 400 em vez de 500. Erros de sistema (ENOSPC, EACCES…)
// têm `code` e continuam a ser tratados como erro interno.
function classifyUploadError(error) {
  if (error instanceof HttpError || error instanceof multer.MulterError || typeof error?.code === 'string') return error;
  return new HttpError(400, 'INVALID_MULTIPART', 'O pedido de envio está incompleto ou malformado. Reabra o formulário e tente novamente.');
}

export function applicationsController({ config, upload, mail, dedup, clock, log }) {
  return async function submit(req, res, next) {
    let reservation;
    let directory;
    try {
      if (!config.enabled || !config.privacyApproved) throw new HttpError(503, 'APPLICATIONS_DISABLED', 'As candidaturas ainda não estão abertas.');
      if (!config.smtpConfigured) throw new HttpError(503, 'EMAIL_UNAVAILABLE', 'O serviço de envio está indisponível. A candidatura não foi enviada.');
      if (!req.is('multipart/form-data')) throw new HttpError(415, 'MULTIPART_REQUIRED', 'Utilize multipart/form-data.');
      const key = req.get('Idempotency-Key');
      if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(key || '')) throw new HttpError(400, 'INVALID_IDEMPOTENCY_KEY', 'Identificador de submissão inválido. Reabra o formulário.');
      const length = Number(req.get('content-length'));
      if (Number.isFinite(length) && length > config.maxTotalBytes + 128 * 1024) throw new HttpError(413, 'UPLOAD_TOO_LARGE', 'A candidatura excede o tamanho permitido.');
      directory = await mkdtemp(join(config.tempRoot, 'upload-'));
      req.uploadDirectory = directory; req.uploadBytes = 0;
      await new Promise((resolve, reject) => upload(req, res, error => error ? reject(classifyUploadError(error)) : resolve()));
      if (req.aborted) throw new HttpError(400, 'REQUEST_ABORTED', 'O envio foi interrompido.');
      const { data, job, deadlineAt } = validateRequest(req, config, clock());
      const files = ['cv','letter','certificates'].flatMap(key => req.files?.[key] || []);
      await validateDocuments(files);
      if (clock() >= new Date(deadlineAt)) throw new HttpError(410, 'DEADLINE_PASSED', 'Candidaturas encerradas.');
      reservation = await dedup.claim(data, files, key, clock().getTime());
      if (reservation.replay) return res.status(200).json({ status:'accepted', applicationId:reservation.applicationId, message:'Candidatura já aceite pelo serviço de e-mail.' });
      try { await mail.send({ data, job, files, applicationId:reservation.applicationId, now:clock() }); }
      catch (error) {
        if (error.uncertain) await dedup.mark(reservation, 'uncertain');
        else await dedup.release(reservation);
        log('smtp_failed', req.requestId);
        throw new HttpError(502, error.uncertain ? 'EMAIL_UNCERTAIN' : 'EMAIL_FAILED', error.uncertain ? 'Não foi possível confirmar o envio. Contacte a PROTEGE antes de repetir a candidatura.' : 'Não foi possível enviar a candidatura. Tente novamente mais tarde.');
      }
      // Se esta gravação falhar, a reserva pendente continua a impedir um segundo e-mail.
      await dedup.mark(reservation, 'accepted');
      log('application_accepted', req.requestId);
      res.status(201).json({ status:'accepted', applicationId:reservation.applicationId, message:'Candidatura aceite pelo serviço de e-mail da PROTEGE.' });
    } catch (error) { next(error); }
    finally {
      if (directory) await rm(directory, { recursive:true, force:true }).catch(() => log('temporary_cleanup_failed', req.requestId));
    }
  };
}
