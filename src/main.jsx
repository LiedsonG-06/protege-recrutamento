import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, BriefcaseBusiness, CalendarDays, ExternalLink, MapPin, Menu, Mail, Phone, X } from 'lucide-react';
import './styles.css';
import Modal from './components/Modal.jsx';
import EmailApplication from './components/EmailApplication.jsx';
import JobDetails from './components/JobDetails.jsx';

import { jobs, project, deadlineFor, isJobClosed, formatDeadline } from './config/jobs.js';

function App(){
 const [selected,setSelected]=useState(null);
 const [menuOpen,setMenuOpen]=useState(false);
 const [applying,setApplying]=useState(false);
 const [now,setNow] = useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer)},[]);
 const isClosed = job => isJobClosed(job, now);
 const closed = jobs.every(isClosed);
 const deadlines = [...new Set(jobs.map(deadlineFor))];
 const deadlineLabel = closed ? 'Candidaturas encerradas' : deadlines.length>1 ? 'Consulte os prazos nos detalhes' : `Prazo: ${formatDeadline(deadlines[0])} (Maputo)`;
 return <>
  <header className="header"><div className="container header-inner"><a href="#inicio" className="brand" aria-label="PROTEGE, início"><img className="brand-logo" src="/brand/protege-logo.jpg" alt="Associação PROTEGE — Todos por Um, Cuidar e Inspirar" width="512" height="276"/><span className="brand-label"><strong>Recrutamento</strong><small>Associação PROTEGE</small></span></a><button className="mobile-toggle" onClick={()=>setMenuOpen(!menuOpen)} aria-label="Abrir ou fechar menu">{menuOpen?<X/>:<Menu/>}</button><nav className={menuOpen?'nav open':'nav'}><a href="#vagas" onClick={()=>setMenuOpen(false)}>Vagas</a><a className="nav-site" href="https://protege.org.mz" target="_blank" rel="noreferrer">Website institucional <ExternalLink size={14}/></a></nav></div></header>
  <main id="inicio">
   <section className="hero"><div className="container hero-content"><div className="eyebrow">OPORTUNIDADES DE CARREIRA · MOÇAMBIQUE</div><h1>Faça parte de uma equipa que <em>transforma comunidades.</em></h1><p>Junte-se à Associação PROTEGE e contribua para a resiliência, protecção, inclusão e desenvolvimento sustentável em Moçambique.</p><div className="hero-actions"><a className="btn btn-white" href="#vagas">Explorar vagas <ArrowRight size={18}/></a></div><div className="hero-stats"><span><strong>17</strong> Postos anunciados</span><span><strong>4</strong> Categorias de vagas</span><span><strong>Gaza</strong> Província de intervenção</span></div></div><div className="hero-decoration" aria-hidden="true"></div></section>
   <section className="section" id="vagas"><div className="container"><span className="section-kicker">JUNTE-SE À NOSSA EQUIPA</span><div className="jobs-heading"><div><h2>Oportunidades disponíveis</h2><p>Vagas no âmbito do {project.name}. Distritos de Guijá, Mapai e Massangena.</p></div><div className="deadline"><CalendarDays size={18}/> {deadlineLabel}</div></div>{closed&&<div className="notice">Actualmente não existem vagas disponíveis. Consulte esta página regularmente para conhecer futuras oportunidades.</div>}<div className="jobs-grid">{jobs.map(job=><article className="job-card" key={job.id}><div className="job-icon"><BriefcaseBusiness size={23}/></div><span className={isClosed(job)?'job-count job-closed':'job-count'}>{isClosed(job)?'Encerrada':`${job.count} ${job.count===1?'posto':'postos'}`}</span><h3>{job.title}</h3><p className="job-subtitle">{job.subtitle}</p><p className="job-location"><MapPin size={16}/>{job.district}</p><button className="details-btn" onClick={()=>setSelected(job)}>Ver detalhes <ArrowRight size={17}/></button></article>)}</div><div className="recruitment-note"><strong>Compromisso com a igualdade de oportunidades</strong><p>A PROTEGE encoraja a candidatura de mulheres, homens, jovens, pessoas com deficiência e candidatos/as de diferentes origens sociais, culturais e geográficas. Todas as decisões de recrutamento são baseadas exclusivamente no mérito, competências, experiência e adequação aos requisitos da função.</p></div><div className="recruitment-note recruitment-note-alert"><strong>Salvaguarda, PEAAS e canais de denúncia</strong><p>A PROTEGE adopta tolerância zero relativamente à fraude, corrupção, exploração, abuso e assédio sexual (PEAAS), violência contra crianças e discriminação. A PROTEGE não solicita qualquer pagamento, taxa ou favor em nenhuma fase do recrutamento — qualquer pedido deste tipo deve ser denunciado.</p><p><Phone size={15} aria-hidden="true"/> Linha de denúncia: <a href="tel:1458">1458</a> / <a href="tel:+258842290600">+258 84 229 0600</a> · Caixa de Reclamações e Denúncias nos escritórios e locais de implementação. Garantimos confidencialidade e protecção contra retaliações para denunciantes de boa-fé.</p></div></div></section>
  </main>
  <footer className="footer"><div className="container footer-inner"><div className="footer-brand"><img src="/brand/protege-logo.jpg" alt="Associação PROTEGE" width="512" height="276" loading="lazy"/><p>Todos por Um, Cuidar e Inspirar.</p></div><address className="footer-contacts"><strong>Nossos Contactos</strong><p><MapPin size={18} aria-hidden="true"/><span>Bairro Polana Cimento &quot;A&quot;, Av Francisco O. Magumbwe, Cidade de Maputo</span></p><a href="tel:+258876460000"><Phone size={18} aria-hidden="true"/> +258 87 646 0000</a><a href="mailto:info@protege.org.mz"><Mail size={18} aria-hidden="true"/> info@protege.org.mz</a></address><div><a href="https://protege.org.mz" target="_blank" rel="noreferrer">Website institucional</a><p>© 2026 Associação PROTEGE</p></div></div></footer>
  {selected&&<Modal titleId="modal-title" onClose={()=>{setSelected(null);setApplying(false)}}>{applying?<EmailApplication job={selected} closed={isClosed(selected)} onBack={()=>setApplying(false)}/>:<JobDetails job={selected} deadline={formatDeadline(deadlineFor(selected))} closed={isClosed(selected)} onApply={()=>setApplying(true)}/>}</Modal>}
 </>
}
createRoot(document.getElementById('root')).render(<App/>);
