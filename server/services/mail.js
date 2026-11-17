import nodemailer from 'nodemailer';
import { readFile } from 'node:fs/promises';

export const recipient = 'recrutamentoprotege1@gmail.com';
const subjects = { campo:'Candidatura – Técnico/a de Campo', infra:'Candidatura – Técnico/a de Infraestruturas', genero:'Candidatura – Ponto Focal de Género, Protecção e PEAAS' };
export function createMailService(config, injectedTransport) {
  const transport = injectedTransport || (config.smtpConfigured ? nodemailer.createTransport({
    host:config.smtp.host, port:config.smtp.port, secure:config.smtp.secure,
    requireTLS:!config.smtp.secure, tls:{ minVersion:'TLSv1.2', rejectUnauthorized:true },
    auth:{ user:config.smtp.user, pass:config.smtp.pass },
    connectionTimeout:10000, greetingTimeout:10000, socketTimeout:30000,
    disableFileAccess:true, disableUrlAccess:true,
  }) : null);
  return {
    async send({ data, job, files, applicationId, now }) {
      let attempted = false;
      try {
        if (!transport) throw new Error('SMTP_UNCONFIGURED');
        await transport.verify();
        const attachments = await Promise.all(files.map(async (file, i) => ({ filename:`${file.fieldname}-${i + 1}.${file.extension}`, content:await readFile(file.path), contentType:file.contentType })));
        const time = new Intl.DateTimeFormat('pt-MZ', { timeZone:'Africa/Maputo', dateStyle:'full', timeStyle:'long' }).format(now);
        const text = [
          `Candidatura: ${applicationId}`, `Nome: ${data.name}`, `E-mail: ${data.email}`, `Telefone: ${data.phone}`,
          `Vaga: ${job.title}`, `Distrito: ${data.district}`, `Data e hora (Africa/Maputo): ${time}`,
          `Consentimento: sim; política ${data.privacyVersion}`, '', 'Referências profissionais:',
          ...data.references.map((r,i) => `${i+1}. ${r.name} | ${r.organization} | ${r.contact}`),
        ].join('\n');
        attempted = true;
        const result = await transport.sendMail({
          from:config.smtp.from, to:recipient, replyTo:{ address:data.email, name:data.name },
          subject:job.id === 'supervisor' ? 'Supervisor(a) Distrital – Massangena' : `${subjects[job.id] || `Candidatura – ${job.title}`} – ${data.district}`,
          text, attachments, disableFileAccess:true, disableUrlAccess:true,
          messageId:`<${applicationId}@${config.smtp.from.split('@')[1]}>`,
        });
        if (!result.accepted?.some(address => (typeof address === 'string' ? address : address.address)?.toLowerCase() === recipient) || result.rejected?.length) throw new Error('RECIPIENT_NOT_ACCEPTED');
      } catch (error) {
        const failure = new Error('SMTP_FAILED');
        // Um timeout depois de DATA pode ocorrer após aceitação: não reenviar automaticamente.
        failure.uncertain = attempted && !(Number(error.responseCode) >= 400 && Number(error.responseCode) <= 599) && error.code !== 'EENVELOPE';
        throw failure;
      }
    },
  };
}
