# Portal de Recrutamento — Associação PROTEGE

Portal estático React/Vite para consultar vagas e preparar candidaturas por e-mail para **recrutamentoprotege1@gmail.com**.

## Funcionamento

1. Consultar as vagas e abrir os detalhes.
2. Clicar em «Candidatar-me» e seleccionar o distrito. Supervisor/a Distrital permite apenas Massangena; as outras vagas permitem Guijá, Mapai e Massangena.
3. «Enviar candidatura por e-mail» abre o programa de e-mail do candidato com destinatário, assunto e mensagem-modelo.
4. O candidato preenche os seus dados, inclui três referências, anexa os documentos exigidos e confirma o envio no seu serviço de e-mail.

O portal não recebe dados pessoais ou ficheiros, não envia mensagens automaticamente e não confirma recepção. Para quem usa webmail ou não tem um programa configurado, o endereço e o assunto ficam disponíveis para cópia.

## Desenvolvimento

Requisitos de desenvolvimento/build: Node.js 22+ e npm.

```bash
npm ci
npm run dev
```

Não é necessário `.env`, backend, SMTP ou base de dados. As dependências de execução são React, React DOM e Lucide React.

## Build e alojamento

```bash
npm run build
npm run preview
```

Publicar apenas o conteúdo de `dist/` num alojamento estático. Na Vercel: framework **Vite**, comando de build **npm run build** e pasta de saída **dist**. Não configurar um servidor Express, funções API, proxy ou variáveis SMTP. No cPanel, esta versão precisa apenas de alojamento estático/HTTPS; Node é usado para gerar o build, não para servir a página.

Destino institucional previsto: `https://recrutamento.protege.org.mz`. Este repositório não executa publicação ou alterações de DNS automaticamente por scripts próprios.

## Vagas e prazos

Editar `src/config/jobs.js` para actualizar anúncios, distritos, documentos, assuntos e destinatário. `project.deadlineAt` define o prazo comum; uma vaga pode indicar `deadlineAt` próprio.

O limite actual é `2026-11-21T00:00:00+02:00` (exclusivo): último minuto válido em Maputo, **20 de Novembro de 2026 às 23:59**. A interface fecha automaticamente os botões e mantém os anúncios consultáveis. O horário exacto continua sujeito à decisão institucional.

A indicação usa o relógio do navegador e não impede o envio manual de e-mails após o prazo. A equipa de recrutamento deve verificar a hora de recepção na caixa de correio e a documentação recebida.

## Estrutura

- `src/main.jsx`: página, navegação, vagas e janelas.
- `src/components/JobDetails.jsx`: anúncio completo.
- `src/components/EmailApplication.jsx`: selecção de distrito e ligação de e-mail.
- `src/components/Modal.jsx`: janela com gestão de foco e Escape.
- `src/config/jobs.js`: anúncios, prazos e regras de distrito.
- `src/styles.css`: identidade visual e responsividade.
- `public/brand/protege-logo.jpg`: logótipo institucional; origem em [docs/LOGOTIPO.md](docs/LOGOTIPO.md).

Foram removidos o formulário de submissão online, Express, Multer, Nodemailer, upload/armazenamento de documentos, API de configuração, variáveis de ambiente, verificadores de servidor e documentação/testes desses fluxos. O histórico Git mantém as versões anteriores.

## Testes

```bash
npm test
npx playwright install chromium --only-shell
npm run test:e2e
```

Se já existir um Chromium compatível, definir `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` com o caminho do executável. O Playwright inicia e termina um servidor Vite estático em loopback na porta 4175. Os testes verificam vagas/distritos, assuntos e conteúdo dos links `mailto:`, ausência de API/formulário online, prazo, teclado, menu móvel e quatro resoluções. Não abrem o serviço de e-mail nem enviam mensagens reais.

Resultados e capturas ficam em `test-results/`, excluído do Git. A confirmação institucional dos anúncios e os procedimentos de acesso/conservação das candidaturas recebidas por e-mail continuam a cargo da PROTEGE.

Validação da simplificação: quatro testes Node e 13 testes Playwright aprovados; build de produção concluído. Os testes antigos de API/SMTP foram removidos juntamente com essas funcionalidades.

## GitHub Actions → cPanel

Workflow manual em `.github/workflows/deploy.yml`: valida com Node 22 e, apenas com a opção explícita de publicação, transfere apenas `dist/` por SFTP com backup por SSH/TAR. Subsistema SFTP e permissões ainda por validar. Consultar [configuração, Secrets e primeira publicação](docs/DEPLOY-CPANEL.md). Sem execução automática por push.
