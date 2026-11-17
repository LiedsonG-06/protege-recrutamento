// Valores locais de recurso; quando disponível, a API fornece os limites efectivos.
// Confirmar formatos e limites SMTP com a PROTEGE antes da abertura.
export const uploadRules = { extensions: ['pdf', 'docx'], maxFileBytes: 5 * 1024 * 1024, maxTotalBytes: 15 * 1024 * 1024, maxCertificates: 5 };
export const districtsFor = job => job.id === 'supervisor' ? ['Massangena'] : ['Guijá', 'Mapai', 'Massangena'];
export function validateApplication(data, job, now = new Date(), rules = {}) {
  const errors = {};
  const limits = { ...uploadRules, ...rules };
  const deadlineAt = rules.deadlineAt || job.deadlineAt || '2026-11-21T00:00:00+02:00';
  if (now >= new Date(deadlineAt)) errors.deadline = 'Candidaturas encerradas.';
  if (!data.name?.trim() || data.name.trim().length > 150) errors.name = 'Introduza o nome completo (até 150 caracteres).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) errors.email = 'Introduza um endereço de e-mail válido.';
  if (!/^\+?[\d\s()-]+$/.test(data.phone || '') || !/^\d{8,15}$/.test((data.phone || '').replace(/\D/g, ''))) errors.phone = 'Introduza um telefone válido, com 8 a 15 dígitos.';
  if (!districtsFor(job).includes(data.district)) errors.district = 'Seleccione um distrito permitido para esta vaga.';
  let total = 0;
  for (const key of ['cv', 'letter', 'certificates']) {
    const files = Array.from(data[key] || []);
    if (!files.length) errors[key] = 'Anexe os documentos obrigatórios.';
    if (files.length > (key === 'certificates' ? limits.maxCertificates : 1)) errors[key] = 'Número de ficheiros acima do permitido.';
    for (const file of files) {
      total += file.size;
      if (!limits.extensions.includes(file.name.split('.').at(-1).toLowerCase())) errors[key] = 'Utilize apenas PDF ou DOCX.';
      else if (!file.size || file.size > limits.maxFileBytes) errors[key] = `Cada ficheiro deve ter conteúdo e não exceder ${limits.maxFileBytes / 1024 / 1024} MB.`;
    }
  }
  if (total > limits.maxTotalBytes) errors.files = `O total dos documentos não pode exceder ${limits.maxTotalBytes / 1024 / 1024} MB.`;
  for (let i = 0; i < 3; i++) {
    const reference = data.references?.[i];
    if (!reference?.name?.trim() || !reference?.organization?.trim() || !reference?.contact?.trim()) errors[`reference${i}`] = 'Preencha nome, organização/cargo e contacto desta referência.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reference.contact) && !(/^\+?[\d\s()-]+$/.test(reference.contact) && /^\d{8,15}$/.test(reference.contact.replace(/\D/g, '')))) errors[`reference${i}`] = 'Indique um e-mail ou telefone válido para a referência.';
  }
  if (!data.consent) errors.consent = 'É necessário confirmar o consentimento.';
  return errors;
}
