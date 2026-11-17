import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { jobs } from '../../src/config/jobs.js';
import { deadlineFor } from '../config/index.js';
import { issueChallenge } from '../services/challenge.js';
import { applicationsController } from '../controllers/applications.js';

export function createRoutes(services) {
  const { config, clock } = services;
  const router = Router();
  router.get('/config', rateLimit({ windowMs:60000, limit:60, standardHeaders:'draft-8', legacyHeaders:false }), (req,res) => {
    const now = clock();
    const available = config.enabled && config.privacyApproved && config.smtpConfigured;
    res.json({
      available, privacyApproved:config.privacyApproved, privacyText:config.privacyApproved ? config.privacyText : '', privacyVersion:config.privacyVersion,
      message:available ? '' : 'As candidaturas ainda não estão abertas ou o serviço de envio está indisponível.',
      serverNow:now.toISOString(), timeZone:'Africa/Maputo', formToken:issueChallenge(config, now.getTime()),
      limits:{ extensions:['pdf','docx'], maxFileBytes:config.maxFileBytes, maxTotalBytes:config.maxTotalBytes, maxCertificates:config.maxCertificates },
      jobs:jobs.map(job => ({ id:job.id, deadlineAt:deadlineFor(config, job), closed:now >= new Date(deadlineFor(config, job)) })),
    });
  });
  router.post('/applications', rateLimit({ windowMs:config.rateWindowMs, limit:config.rateMax, standardHeaders:'draft-8', legacyHeaders:false,
    handler:(req,res) => res.status(429).json({ code:'RATE_LIMITED', message:'Demasiadas tentativas. Aguarde antes de tentar novamente.' }),
  }), applicationsController(services));
  return router;
}
