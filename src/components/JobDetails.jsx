import React from 'react';
import { BriefcaseBusiness, CalendarDays, FileText, MapPin, UserRound } from 'lucide-react';
import { project } from '../config/jobs.js';

const List = ({ items }) => <ul>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;

export default function JobDetails({ job, deadline, closed, onApply }) {
  const full = !!job.objective;
  return <>
    <span className="section-kicker">ANÚNCIO DE {job.count === 1 ? 'VAGA' : 'VAGAS'}</span>
    <h2 id="modal-title">{job.title}</h2>
    <p className="modal-subtitle">{job.subtitle}</p>
    <p className="modal-project">No âmbito do {project.name}.</p>
    <dl className="job-facts">
      <div><dt><MapPin size={15}/> Local de trabalho</dt><dd>Província de Gaza — {job.district}</dd></div>
      <div><dt><BriefcaseBusiness size={15}/> Número de vagas</dt><dd>{job.count} {job.count === 1 ? 'posto' : 'postos'}</dd></div>
      {job.contractType && <div><dt><FileText size={15}/> Tipo de contrato</dt><dd>{job.contractType}</dd></div>}
      <div><dt><CalendarDays size={15}/> Duração</dt><dd>{job.duration}</dd></div>
      {job.reportsTo && <div><dt><UserRound size={15}/> Reporta a</dt><dd>{job.reportsTo}</dd></div>}
      <div><dt><CalendarDays size={15}/> Data limite</dt><dd>{closed ? <strong className="deadline-closed">Encerrado</strong> : <>{deadline} <small>(hora de Maputo)</small></>}</dd></div>
    </dl>

    <h3>Objectivo do cargo</h3>
    <p>{job.objective || job.description}</p>

    {full ? <>
      <h3>Principais responsabilidades</h3><List items={job.responsibilities}/>
      <h3>Requisitos mínimos</h3>
      <h4>Formação académica</h4><p>{job.education}</p>
      <h4>Experiência profissional</h4><List items={job.experience}/>
      <h4>Competências técnicas</h4><List items={job.technicalSkills}/>
      <h4>Competências comportamentais</h4><List items={job.behaviouralSkills}/>
    </> : <>
      <h3>Requisitos principais</h3><List items={job.requirements}/>
      <p className="disclaimer">Esta é uma síntese do anúncio. Os requisitos e as condições completos deverão ser conferidos com o anúncio oficial.</p>
    </>}

    <h3>Documentos a submeter</h3>
    <List items={job.applicationDocs}/>
    <p className="form-hint">Envie os documentos por e-mail para <a href={`mailto:${project.email}`}>{project.email}</a> com o assunto «{job.emailSubject}».</p>

    <div className="safeguarding-box">
      <strong>Recrutamento seguro</strong>
      <p>Os/as candidatos/as seleccionados/as estarão sujeitos/as a verificação de referências, validação documental e outras verificações apropriadas. A contratação depende da assinatura do Código de Conduta, da Declaração de Integridade, da Declaração de Conflito de Interesses e dos compromissos de Salvaguarda, PEAAS e Protecção da Criança.</p>
      <p>Apenas os/as candidatos/as pré-seleccionados/as serão contactados/as. A PROTEGE não cobra qualquer pagamento em nenhuma fase do recrutamento.</p>
    </div>

    <button className="btn btn-primary" disabled={closed} onClick={onApply}>{closed ? 'Candidaturas encerradas' : 'Candidatar-me'}</button>
  </>;
}
