import React, { useState } from 'react';
import { project, districtsFor } from '../config/jobs.js';

export default function EmailApplication({ job, onBack, closed = false }) {
  const districts = districtsFor(job);
  const [district, setDistrict] = useState(districts.length === 1 ? districts[0] : '');
  const subject = job.emailSubject?.replace('[Distrito]', district || '[Distrito]') || `Candidatura – ${job.title} – ${district || '[Distrito]'}`;
  const body = [
    'Exmos. Senhores da Associação PROTEGE,', '',
    `Apresento a minha candidatura à vaga de ${job.title}.`,
    `Distrito pretendido: ${district || '[indicar distrito]'}`, '',
    'Nome completo: ', 'E-mail: ', 'Telefone: ', '',
    'Referências profissionais (nome, organização/cargo e contacto):',
    '1. ', '2. ', '3. ', '',
    'Anexos a incluir antes de enviar: CV actualizado, carta de motivação/apresentação e certificados académicos e profissionais relevantes.', '',
    'Com os melhores cumprimentos,',
  ].join('\r\n');
  const href = `mailto:${project.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return <>
    <span className="section-kicker">CANDIDATURA POR E-MAIL</span>
    <h2 id="modal-title">{job.title}</h2>
    {closed && <p className="notice">O prazo de candidatura terminou.</p>}
    <p>Envie a sua candidatura para <strong>{project.email}</strong>.</p>
    <div className="email-application">
      <label htmlFor="email-district">Distrito da candidatura por e-mail</label>
      <select disabled={closed} id="email-district" value={district} onChange={event => setDistrict(event.target.value)}>
        {districts.length > 1 && <option value="">Seleccione o distrito</option>}
        {districts.map(value => <option key={value}>{value}</option>)}
      </select>
      <h3>Documentos a enviar</h3>
      <ul>{(job.applicationDocs || ['Curriculum Vitae actualizado.', 'Carta de motivação.', 'Certificados académicos e profissionais relevantes.', 'Contactos de três referências profissionais.']).map(item => <li key={item}>{item}</li>)}</ul>
      <p className="form-hint">O botão abre o seu programa de e-mail com o assunto e uma mensagem-modelo. Preencha os seus dados, inclua as três referências e anexe os documentos nesse programa. Os ficheiros não são anexados automaticamente.</p>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onBack}>Voltar aos detalhes</button>
        {closed ? <button className="btn btn-primary" disabled>Candidaturas encerradas</button> : district ? <a className="btn btn-white email-application-button" href={href}>Enviar candidatura por e-mail</a> : <button className="btn btn-primary" disabled>Seleccione o distrito para continuar</button>}
      </div>
      <p className="form-hint">Se não tiver um programa de e-mail configurado, copie o endereço acima para o seu serviço de e-mail e use o assunto: <strong>{subject}</strong>.</p>
      <p className="form-hint">A candidatura só é enviada quando confirmar o envio no seu serviço de e-mail. Esta página não confirma a recepção da mensagem.</p>
    </div>
  </>;
}
