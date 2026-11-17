import React, { useRef, useState } from 'react';
import EmailApplication from './EmailApplication.jsx';
import { usePortalConfig } from '../config/usePortalConfig.js';
import { districtsFor, validateApplication } from '../config/application.js';

export default function ApplicationForm({ job, onBack, onBusyChange }) {
  const { config, error: configError } = usePortalConfig();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverClosed, setServerClosed] = useState(false);
  const busy = useRef(false);
  const idempotencyKey = useRef(null);
  const deadlineAt = config?.jobs.find(item => item.id === job.id)?.deadlineAt || job.deadlineAt || '2026-11-21T00:00:00+02:00';
  const serverNow = config ? Date.parse(config.serverNow) + Date.now() - config.receivedAt : Date.now();
  const closed = serverClosed || (!!deadlineAt && serverNow >= Date.parse(deadlineAt));
  const available = !!config?.available && !closed;
  const districts = districtsFor(job);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('');
  const summary = useRef(null);
  const error = key => errors[key] && <span className="field-error" id={`error-${key}`}>{errors[key]}</span>;
  const attrs = key => ({ 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `error-${key}` : undefined });
  async function review(event) {
    event.preventDefault();
    if (busy.current || submitted) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const data = Object.fromEntries(fields);
    for (const key of ['cv', 'letter', 'certificates']) data[key] = [...form.elements[key].files];
    data.references = Array.from({ length: 3 }, (_, i) => ({ name: fields.get(`ref-name-${i}`), organization: fields.get(`ref-org-${i}`), contact: fields.get(`ref-contact-${i}`) }));
    data.consent = fields.get('consent') === 'on';
    const now = config ? new Date(Date.parse(config.serverNow) + Date.now() - config.receivedAt) : new Date();
    const issues = validateApplication(data, job, now, { ...config?.limits, ...(deadlineAt ? { deadlineAt } : {}) });
    setErrors(issues);
    if (!available || Object.keys(issues).length) {
      setStatus(!available ? 'O envio está indisponível. A candidatura não foi enviada.' : 'Verifique os campos indicados. A candidatura não foi enviada.');
      requestAnimationFrame(() => summary.current?.focus());
      return;
    }
    busy.current = true; setSubmitting(true); onBusyChange?.(true);
    setStatus('A enviar a candidatura. Aguarde a confirmação.');
    const payload = new FormData();
    for (const key of ['name','email','phone','district']) payload.append(key, data[key]);
    payload.append('jobId', job.id);
    payload.append('references', JSON.stringify(data.references));
    payload.append('consent', String(data.consent));
    payload.append('privacyVersion', config.privacyVersion);
    payload.append('formToken', config.formToken);
    payload.append('website', fields.get('website') || '');
    for (const key of ['cv','letter','certificates']) for (const file of data[key]) payload.append(key, file);
    try {
      idempotencyKey.current ||= crypto.randomUUID();
      const response = await fetch('/api/v1/applications', { method:'POST', headers:{ 'Idempotency-Key':idempotencyKey.current }, body:payload });
      // Um proxy pode devolver HTML: manter o estado HTTP sem o confundir com falha de rede.
      const result = await response.json().catch(() => null);
      const accepted = [200,201].includes(response.status) && result?.status === 'accepted' && typeof result.applicationId === 'string' && result.applicationId.length > 0;
      if (!accepted) {
        const messages = {
          400:'Não foi possível validar o formulário. Reveja os dados ou reabra o formulário.',
          403:'O pedido foi bloqueado pela configuração de acesso. Contacte a PROTEGE.',
          409:'Existe uma candidatura enviada ou em processamento. Contacte a PROTEGE antes de repetir.',
          410:'Candidaturas encerradas.',
          502:'Não foi possível confirmar o envio. Contacte a PROTEGE antes de repetir.',
          503:'O serviço de candidaturas está indisponível. Tente novamente mais tarde.',
        };
        const fields = result?.fields && typeof result.fields === 'object' ? Object.fromEntries(Object.entries(result.fields).filter(([,value]) => typeof value === 'string')) : {};
        setErrors(fields);
        setStatus(typeof result?.message === 'string' ? result.message : messages[response.status] || 'O servidor não devolveu uma confirmação válida. Não foi possível confirmar o envio.');
        if (response.status === 410) setServerClosed(true);
        if (response.status === 409 || result?.code === 'EMAIL_UNCERTAIN') setSubmitted(true);
      } else {
        setSubmitted(true); form.reset();
        setStatus(`Candidatura aceite pelo serviço de e-mail da PROTEGE. Referência: ${result.applicationId}.`);
      }
    } catch {
      setStatus('A ligação foi interrompida e não foi possível confirmar o envio. Pode repetir com este formulário; o servidor verificará se a candidatura já foi enviada.');
    } finally {
      busy.current = false; setSubmitting(false); onBusyChange?.(false);
      requestAnimationFrame(() => summary.current?.focus());
    }
  }
  if (!available && !closed && (config || configError)) return <EmailApplication job={job} onBack={onBack}/>;
  return <>
    <span className="section-kicker">CANDIDATURA</span>
    <h2 id="modal-title">{job.title}</h2>
    <p className="notice">{configError || (!config ? 'A verificar a disponibilidade do serviço…' : closed ? 'Candidaturas encerradas.' : available ? 'Preencha os dados e aguarde a confirmação após o envio.' : config.message)}</p>
    <form className="application-form" noValidate onSubmit={review} aria-busy={submitting}>
      {status && <div className="form-status" role="status" tabIndex={-1} ref={summary}>{status}{errors.deadline && <p>{errors.deadline}</p>}{errors.files && <p>{errors.files}</p>}</div>}
      <p className="form-hint">Todos os campos são obrigatórios. Fechar a janela ou voltar aos detalhes elimina o preenchimento.</p>
      <fieldset disabled={submitting || submitted}><legend>Dados pessoais</legend>
        <label htmlFor="name">Nome completo</label><input id="name" name="name" autoComplete="name" maxLength={150} required {...attrs('name')}/>{error('name')}
        <div className="form-grid"><div><label htmlFor="email">Endereço de e-mail</label><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required {...attrs('email')}/>{error('email')}</div>
        <div><label htmlFor="phone">Número de telefone</label><input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="+258 …" maxLength={30} required {...attrs('phone')}/>{error('phone')}</div></div>
      </fieldset>
      <fieldset disabled={submitting || submitted}><legend>Informações da candidatura</legend>
        <label htmlFor="job">Vaga seleccionada</label><input id="job" value={job.title} readOnly/>
        <label htmlFor="district">Distrito pretendido</label><select id="district" name="district" defaultValue={districts.length === 1 ? districts[0] : ''} required {...attrs('district')}>
          {districts.length > 1 && <option value="">Seleccione o distrito</option>}{districts.map(d => <option key={d}>{d}</option>)}
        </select>{error('district')}
      </fieldset>
      <fieldset disabled={submitting || submitted}><legend>Documentos</legend><p className="form-hint" id="file-rules">PDF ou DOCX, até {(config?.limits.maxFileBytes || 5242880) / 1048576} MB por ficheiro e {(config?.limits.maxTotalBytes || 15728640) / 1048576} MB no total.</p>
        {[['cv', 'Curriculum Vitae actualizado'], ['letter', 'Carta de motivação'], ['certificates', `Certificados académicos e profissionais (até ${config?.limits.maxCertificates || 5} ficheiros)`]].map(([key, label]) => <div key={key}><label htmlFor={key}>{label}</label><input id={key} name={key} type="file" accept=".pdf,.docx" multiple={key === 'certificates'} required {...attrs(key)} aria-describedby={`file-rules${errors[key] ? ` error-${key}` : ''}`}/>{error(key)}</div>)}
      </fieldset>
      <fieldset disabled={submitting || submitted}><legend>Referências profissionais</legend><p className="form-hint">Indique três referências com contacto de e-mail ou telefone.</p>
        {[0, 1, 2].map(i => <fieldset className="reference-fields" key={i}><legend>Referência {i + 1}</legend>
          {[['name', 'Nome'], ['org', 'Organização / cargo'], ['contact', 'Contacto']].map(([key, label]) => <div key={key}><label htmlFor={`ref-${key}-${i}`}>{label}</label><input id={`ref-${key}-${i}`} name={`ref-${key}-${i}`} required maxLength={200} {...attrs(`reference${i}`)}/></div>)}{error(`reference${i}`)}
        </fieldset>)}
      </fieldset>
      <fieldset disabled={submitting || submitted}><legend>Privacidade e consentimento</legend>
        <details className="privacy-draft"><summary>{config?.privacyApproved ? 'Consultar política de privacidade' : 'Informação de privacidade — pendente de aprovação'}</summary><p className="privacy-text">{config?.privacyApproved ? config.privacyText : 'A política completa, os responsáveis, destinatários, prazo de conservação e meios de exercício dos direitos aguardam aprovação da PROTEGE. O consentimento e o envio permanecem indisponíveis.'}</p></details>
        <label className="consent"><input type="checkbox" name="consent" disabled={!available} required aria-describedby="consent-pending"/> Confirmo a leitura da política de privacidade e autorizo o tratamento dos dados exclusivamente no âmbito do recrutamento.</label>
        {error('consent')}
        <p className="form-hint" id="consent-pending">{available ? `Política de privacidade: ${config.privacyVersion}.` : 'Consentimento indisponível enquanto as candidaturas estiverem bloqueadas.'}</p>
      </fieldset>
      <div className="form-trap" aria-hidden="true"><label htmlFor="website">Website</label><input id="website" name="website" tabIndex={-1} autoComplete="off"/></div>
      <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={onBack} disabled={submitting}>Voltar aos detalhes</button><button type="submit" className="btn btn-primary" disabled={submitting || submitted || !config || closed}>{closed ? 'Candidaturas encerradas' : submitting ? 'A enviar…' : available ? 'Submeter candidatura' : 'Verificar dados'}</button></div>
      <p className="form-hint">{available ? 'A confirmação só será apresentada após aceitação pelo serviço de e-mail.' : 'A verificação local não confirma uma candidatura. O envio ainda não está disponível.'}</p>
    </form>
  </>;
}
