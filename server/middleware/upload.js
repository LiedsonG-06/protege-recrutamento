import multer from 'multer';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { HttpError } from '../services/errors.js';

export function createUpload(config) {
  const storage = {
    _handleFile(req, file, cb) {
      const path = join(req.uploadDirectory, randomUUID());
      let size = 0;
      const counter = new Transform({ transform(chunk, encoding, done) {
        size += chunk.length;
        req.uploadBytes += chunk.length;
        if (req.uploadBytes > config.maxTotalBytes) return done(new HttpError(413, 'UPLOAD_TOO_LARGE', 'Os documentos excedem o tamanho total permitido.'));
        done(null, chunk);
      } });
      pipeline(file.stream, counter, createWriteStream(path, { flags: 'wx', mode: 0o600 }))
        .then(() => cb(null, { path, size, filename: path.split('/').at(-1) }))
        .catch(error => { rm(path, { force: true }).then(() => cb(error), () => cb(error)); });
    },
    _removeFile(req, file, cb) { rm(file.path, { force: true }).then(() => cb(null), cb); },
  };
  return multer({ storage, limits: {
    fileSize: config.maxFileBytes, files: config.maxCertificates + 2,
    fields: 11, fieldSize: 8192, fieldNameSize: 50, parts: config.maxCertificates + 13,
  }, fileFilter(req, file, cb) {
    if (!/\.(pdf|docx)$/i.test(file.originalname)) return cb(new HttpError(422, 'INVALID_DOCUMENT', 'Utilize apenas documentos PDF ou DOCX.'));
    cb(null, true);
  } }).fields([{ name: 'cv', maxCount: 1 }, { name: 'letter', maxCount: 1 }, { name: 'certificates', maxCount: config.maxCertificates }]);
}
