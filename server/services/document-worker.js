import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { PDFDocument, PDFDict, PDFArray, PDFName } from 'pdf-lib';
import yauzl from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

function validateDocx(buffer) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(error);
      const names = new Set();
      const xml = new Map();
      let count = 0, total = 0, settled = false;
      const fail = error => { if (!settled) { settled = true; zip.close(); reject(error); } };
      zip.on('error', fail);
      zip.on('entry', entry => {
        if (++count > 1000 || names.has(entry.fileName) || entry.generalPurposeBitFlag & 1 || /(^|\/)(\.\.?)(\/|$)|\\|^\//.test(entry.fileName) || /(?:vbaProject|activeX|embeddings)|\.(?:exe|dll|bin|js|vbs|html)$/i.test(entry.fileName)) return fail(new Error('Unsafe ZIP entry'));
        names.add(entry.fileName);
        total += entry.uncompressedSize;
        if (total > 30 * 1024 * 1024 || entry.uncompressedSize > 10 * 1024 * 1024 || entry.uncompressedSize > Math.max(1, entry.compressedSize) * 100) return fail(new Error('ZIP limits'));
        zip.openReadStream(entry, (error, stream) => {
          if (error) return fail(error);
          const chunks = [];
          let bytes = 0;
          const isXml = /\.(xml|rels)$/.test(entry.fileName);
          stream.on('error', fail);
          stream.on('data', chunk => {
            bytes += chunk.length;
            if (bytes > entry.uncompressedSize || (isXml && bytes > 5 * 1024 * 1024)) { stream.destroy(); return fail(new Error('Entry too big')); }
            if (isXml) chunks.push(chunk);
          });
          stream.on('end', () => {
            if (settled) return;
            if (isXml) {
              const text = Buffer.concat(chunks).toString('utf8');
              if (/<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true || /macroEnabled|vbaProject|oleObject|attachedTemplate|altChunk/i.test(text)) return fail(new Error('Unsafe XML'));
              xml.set(entry.fileName, text);
            }
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => {
        if (settled) return;
        try {
          const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false });
          for (const required of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']) if (!xml.has(required)) throw new Error('Missing DOCX part');
          const types = parser.parse(xml.get('[Content_Types].xml')).Types;
          const overrides = [types?.Override || []].flat();
          if (!overrides.some(o => o['@_PartName'] === '/word/document.xml' && o['@_ContentType'] === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')) throw new Error('Not DOCX');
          const relationships = [parser.parse(xml.get('_rels/.rels')).Relationships?.Relationship || []].flat();
          if (!relationships.some(r => r['@_Type'] === 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' && ['word/document.xml','/word/document.xml'].includes(r['@_Target']) && r['@_TargetMode'] !== 'External')) throw new Error('Invalid main relationship');
          if (!/xmlns(?::[\w.-]+)?=["']http:\/\/schemas\.openxmlformats\.org\/wordprocessingml\/2006\/main["']/.test(xml.get('word/document.xml'))) throw new Error('Invalid Word namespace');
          const document = parser.parse(xml.get('word/document.xml')).document;
          if (!document || !Object.hasOwn(document, 'body')) throw new Error('Invalid document');
          for (const [name, text] of xml) if (name.endsWith('.rels')) {
            const relations = [parser.parse(text).Relationships?.Relationship || []].flat();
            if (relations.some(r => r['@_TargetMode'] === 'External' && (r['@_Type'] !== 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink' || !/^(https?:|mailto:)/i.test(r['@_Target'] || '')))) throw new Error('Unsafe external relation');
          }
          settled = true; resolve();
        } catch (error) { fail(error); }
      });
      zip.readEntry();
    });
  });
}
try {
  const bytes = await readFile(workerData.path);
  if (!bytes.length) throw new Error('Empty file');
  if (workerData.extension === 'pdf') {
    if (!bytes.subarray(0,8).toString('ascii').match(/^%PDF-1\.[0-9]/) || !bytes.subarray(-1024).includes(Buffer.from('%%EOF'))) throw new Error('Invalid PDF signature');
    const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
    if (pdf.isEncrypted || pdf.getPageCount() < 1 || pdf.getPageCount() > 500) throw new Error('Invalid PDF');
    const queue = pdf.context.enumerateIndirectObjects().map(([, object]) => object);
    const seen = new Set();
    let visited = 0;
    while (queue.length) {
      const object = queue.pop();
      if (!object || seen.has(object)) continue;
      seen.add(object);
      if (++visited > 100000) throw new Error('PDF complexity limit');
      if (object instanceof PDFDict) {
        const keys = object.keys();
        if (keys.some(key => ['JS','JavaScript','AA','OpenAction','Launch','EmbeddedFiles','EF','RichMedia','XFA'].includes(key.decodeText()))) throw new Error('Active PDF content');
        const action = object.get(PDFName.of('S'));
        if (action instanceof PDFName && ['JavaScript','Launch','SubmitForm','ImportData','Rendition','GoToE'].includes(action.decodeText())) throw new Error('Active PDF action');
        if (object.get(PDFName.of('Type'))?.toString() === '/EmbeddedFile') throw new Error('Embedded file');
        queue.push(...object.values());
      } else if (object instanceof PDFArray) queue.push(...object.asArray());
      else if (object.dict instanceof PDFDict) queue.push(object.dict);
    }
  } else if (workerData.extension === 'docx') {
    if (bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('Invalid ZIP signature');
    await validateDocx(bytes);
  } else throw new Error('Unsupported');
  parentPort.postMessage(true);
} catch { parentPort.postMessage(false); }
