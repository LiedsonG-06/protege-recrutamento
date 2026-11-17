import { useEffect, useState } from 'react';
import { jobs } from './jobs.js';

function validConfig(data) {
  const positive = value => Number.isSafeInteger(value) && value > 0;
  return data && typeof data.available === 'boolean' && typeof data.privacyApproved === 'boolean'
    && typeof data.privacyText === 'string' && typeof data.privacyVersion === 'string'
    && typeof data.message === 'string' && Number.isFinite(Date.parse(data.serverNow))
    && typeof data.formToken === 'string' && data.formToken.length > 0
    && Array.isArray(data.jobs) && jobs.every(job => data.jobs.some(item => item?.id === job.id && Number.isFinite(Date.parse(item.deadlineAt))))
    && data.limits && ['maxFileBytes','maxTotalBytes','maxCertificates'].every(key => positive(data.limits[key]))
    && Array.isArray(data.limits.extensions) && data.limits.extensions.length > 0 && data.limits.extensions.every(value => ['pdf','docx'].includes(value))
    && (!data.available || (data.privacyApproved && data.privacyText.trim() && data.privacyVersion.trim()));
}

export function usePortalConfig() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/config', { signal:controller.signal, cache:'no-store' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => {
        if (!validConfig(data)) throw new Error();
        setConfig({ ...data, receivedAt:Date.now() });
      })
      .catch(error => { if (error.name !== 'AbortError') setError('Não foi possível contactar o serviço de candidaturas. Tente novamente mais tarde.'); });
    return () => controller.abort();
  }, []);
  return { config, error };
}
