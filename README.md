# Portal de Recrutamento — Associação PROTEGE

Projecto existente React/Vite, com backend Node.js/Express e integração de candidaturas multipart. Destino institucional previsto: `recrutamento.protege.org.mz`. Não foi publicado nem foram alterados DNS, website institucional ou credenciais reais.

## Diagnóstico e implementação da Fase 3

A Fase 2 tinha formulário em `src/components/ApplicationForm.jsx`, janela acessível em `Modal.jsx`, vagas em `src/config/jobs.js` e regras locais em `src/config/application.js`. Não existia backend nem transmissão HTTP. O consentimento estava bloqueado e «Verificar dados» só executava validação local.

A Fase 3 acrescenta o backend e o envio por `FormData`, mantendo a estrutura visual, as quatro vagas, os distritos, as referências e os componentes existentes. A API fornece disponibilidade, política, prazo e limites efectivos. O frontend bloqueia duplo clique e fecho da janela durante o pedido, apresenta progresso e só confirma após uma resposta de aceitação do servidor.

**As candidaturas permanecem bloqueadas por defeito.** A abertura exige política aprovada, texto integral, versão, segredo de aplicação e SMTP configurados no servidor. Não basta activar uma opção no frontend. As credenciais nunca são entregues ao React.

## Executar localmente

Requisitos: Node.js **22+** e npm. Verificado com Node.js 24.21.0. Confirmar a disponibilidade da versão no cPanel antes de preparar a publicação.

```bash
npm install
cp .env.example .env
npm run server
```

A API escuta por defeito apenas em `http://127.0.0.1:3001`. O `.env` criado mantém as candidaturas fechadas e não contém credenciais. Não activar as candidaturas com política fictícia ou sem autorização institucional.

Noutro terminal:

```bash
npm run dev -- --host 127.0.0.1
```

Abrir `http://localhost:5173`. O proxy Vite encaminha `/api` para a API. Se usar outra origem ou porta, ajustar `ALLOWED_ORIGINS` no backend; por defeito só é autorizada `http://localhost:5173`.

```bash
npm test
npm run build
```

Os testes criam portas HTTP/SMTP temporárias em loopback e directórios temporários. Não lêem o `.env` real, não requerem credenciais, não utilizam serviços externos e não enviam candidaturas reais. `dist/` contém apenas o frontend; o backend é um processo separado. O proxy de desenvolvimento não existe no build de produção.

## Organização e ficheiros

Criados na Fase 3:

| Ficheiros | Finalidade |
| --- | --- |
| `server/index.js`, `server/app.js` | Arranque, aplicação Express, segurança HTTP, CORS e erros |
| `server/config/index.js` | Variáveis de ambiente, limites e prazos |
| `server/routes/index.js` | Endpoints e limitação de pedidos |
| `server/controllers/applications.js` | Recepção, processamento, envio e limpeza |
| `server/middleware/upload.js` | Multer, nomes aleatórios, armazenamento privado e limites durante o upload |
| `server/validations/application.js` | Validação do pedido no servidor |
| `server/services/documents.js`, `document-worker.js` | Validação estrutural dos documentos com limites de tempo/memória |
| `server/services/mail.js` | SMTP e composição dos e-mails com anexos reais |
| `server/services/challenge.js` | Token assinado, expiração e tempo mínimo do formulário |
| `server/services/deduplication.js` | Reserva persistente e idempotência |
| `server/services/storage.js`, `errors.js` | Directórios privados, limpeza e erros públicos controlados |
| `src/config/usePortalConfig.js` | Consulta de configuração pública |
| `vite.config.js` | Proxy de desenvolvimento |
| `.env.example`, `.gitignore` | Modelo de configuração sem credenciais e exclusões |
| `tests/backend.test.js` | Testes de integração HTTP, documentos, MIME, multipart malformado e SMTP simulado |

Alterados: `src/components/ApplicationForm.jsx`, `src/components/Modal.jsx`, `src/config/application.js`, `src/main.jsx`, `src/styles.css`, `package.json`, `package-lock.json` e este `README.md`. O build actualiza `dist/`, que está excluído do controlo de versões. As vagas em `src/config/jobs.js` e os seis testes locais preexistentes foram preservados.

Dependências novas: Express, Multer, Nodemailer, express-rate-limit, pdf-lib, yauzl e fast-xml-parser. As últimas três permitem verificar estruturas PDF, ZIP/DOCX e XML; não basta verificar extensão ou MIME declarado.

## Endpoints

### `GET /api/v1/config`

Devolve disponibilidade, política aprovada e versão, limites, hora do servidor, prazos por vaga e `formToken`. Nunca devolve segredos, credenciais ou documentos. As respostas não são colocadas em cache.

### `POST /api/v1/applications`

Aceita exclusivamente `multipart/form-data`. Cabeçalho obrigatório: `Idempotency-Key`, um UUID v4 estável para tentativas da mesma submissão.

Campos de texto:

- `name`, `email`, `phone`, `jobId`, `district`.
- `references`: JSON com exactamente três objectos `{ "name": "…", "organization": "…", "contact": "…" }`.
- `consent`: string `true`; `privacyVersion`: versão devolvida pela configuração.
- `formToken`: token devolvido por `/config`.
- `website`: campo armadilha, obrigatoriamente vazio.

Ficheiros obrigatórios: `cv` (um), `letter` (um) e `certificates` (um ou mais, até ao limite configurado). O frontend não define manualmente o cabeçalho `Content-Type`, permitindo ao navegador gerar o boundary multipart.

Respostas principais:

| Estado HTTP | Significado |
| --- | --- |
| `201` | SMTP aceitou o destinatário; inclui `status: accepted` e `applicationId` |
| `200` | Repetição com a mesma chave e conteúdo de uma candidatura já aceite; não envia novo e-mail |
| `400` / `422` | Campos, token, referências, ficheiros ou quantidade inválidos; multipart malformado (`INVALID_MULTIPART`) |
| `403` | Origem não autorizada |
| `409` | Candidatura duplicada, pendente ou com resultado incerto |
| `410` | Prazo encerrado |
| `413` / `415` | Tamanho excedido ou formato do pedido incorrecto |
| `429` | Limite de tentativas por IP excedido |
| `502` | Falha SMTP, sem confirmação falsa |
| `503` | Candidaturas fechadas ou SMTP não configurado |

A aceitação SMTP confirma a entrega ao serviço de e-mail, não garante a chegada à caixa de entrada. O destinatário está fixado em `recrutamentoprotege1@gmail.com`. O remetente é institucional e configurado por `SMTP_FROM`; o candidato entra em `Reply-To`. Os assuntos são gerados a partir da vaga e distrito, incluindo o assunto específico do/a Supervisor/a.

## Configuração e segurança

Consultar todas as opções em `.env.example`. Nunca usar prefixo `VITE_` para credenciais.

- `APPLICATIONS_ENABLED=false` e `PRIVACY_APPROVED=false` mantêm o endpoint bloqueado. Para uma abertura autorizada, também são obrigatórios `PRIVACY_POLICY_TEXT`, `PRIVACY_POLICY_VERSION` e `APPLICATION_SECRET` com pelo menos 32 caracteres. O texto aprovado é apresentado no formulário antes do consentimento.
- SMTP exige host, porta, utilizador, palavra-passe e remetente autorizado. A produção exige TLS (implícito ou STARTTLS), certificado válido e tempos de espera limitados. Os anexos são buffers locais; o Nodemailer não pode obter ficheiros nem URLs arbitrários.
- `APPLICATION_DEADLINE_AT` exige ISO 8601 com `+02:00`, fuso de Maputo. A hipótese actual é **21/11/2026 às 00:00**, encerrando o dia 20. O horário continua pendente de confirmação. `JOB_DEADLINES_JSON` permite substituir prazos individualmente; futuras vagas podem definir `deadlineAt` em `jobs.js`. O servidor bloqueia a submissão mesmo que o navegador tenha uma página antiga.
- Limites provisórios: 5 MB por ficheiro, 15 MB de documentos no total e cinco certificados, configuráveis no backend e comunicados ao frontend. O máximo total configurável é 20 MB, mas o valor autorizado deverá respeitar o limite SMTP, incluindo a expansão base64 e o restante e-mail.
- PDF: assinatura, parsing estrutural, EOF, páginas e rejeição de encriptação/conteúdo activo. DOCX: assinatura ZIP, partes obrigatórias, XML e relações, limites de descompressão, rejeição de macros, objectos incorporados e relações externas perigosas. Os parsers correm em workers com prazo de cinco segundos e limite de heap. A política é conservadora e pode rejeitar documentos complexos; não constitui um antivírus.
- Temporários em subdirectórios aleatórios com permissões `0700`; ficheiros com nomes UUID e permissões `0600`. Não há rota pública de documentos. Sucesso, erros e interrupções accionam limpeza. Resíduos de uma queda do processo são removidos no arranque e na limpeza horária após 24 horas.
- `UPLOAD_TEMP_DIR` e `DEDUP_DIR` devem ser directórios privados separados, **fora da raiz pública real do alojamento**. O backend recusa caminhos conhecidos de código/frontend e ligações simbólicas no directório final; a implantação deverá assegurar que os caminhos completos e os seus pais são privados. Não publicar a raiz do repositório.
- A reserva de duplicados usa criação exclusiva em disco e hashes HMAC de e-mail/vaga/distrito. O registo não guarda esses campos nem documentos em claro; contém hashes, estado, hora e referência. É persistente entre reinícios, desde que se preservem o directório e o segredo.
- Mesma candidatura/vaga/distrito fica bloqueada por 24 horas por defeito (`DEDUP_TTL_HOURS`), com remoção no arranque ou na limpeza horária após esse prazo. Alterar esse prazo exige decisão institucional; não eliminar reservas pendentes/incertas para forçar reenvios sem reconciliação.
- Uma falha antes do envio ou uma rejeição SMTP explícita liberta a reserva. Um timeout após tentativa pode significar que o SMTP já aceitou a mensagem: mantém-se estado incerto e pede-se contacto com a PROTEGE. Não existe promessa de entrega «exactamente uma vez» entre sistemas SMTP e disco.
- Limite de cinco POST por IP a cada 15 minutos, mais limitação da configuração; token assinado válido por duas horas, espera mínima de três segundos e honeypot. Estas medidas mitigam abuso e não substituem uma solução CAPTCHA caso surja abuso real.
- CORS permite apenas origens exactas. Clientes sem `Origin` continuam sujeitos às restantes validações; CORS não autentica pedidos. `TRUSTED_PROXIES` fica vazio até serem conhecidos os IP/CIDR dos proxies autorizados. Não configurar confiança indiscriminada em cabeçalhos de IP.
- A limitação por IP é em memória. Esta implementação destina-se inicialmente a **um processo Node num único servidor**, com disco privado persistente. Várias instâncias exigem um armazenamento partilhado com operações atómicas e um limitador distribuído.
- Os registos da aplicação contêm eventos e identificadores técnicos, sem campos do candidato, documentos, credenciais ou erros SMTP completos. Rever também logs do proxy/alojamento antes da publicação.

## Testes executados

Em 17/11/2026:

- `npm test`: **37 testes aprovados, zero falhas** — seis testes de validação local e 31 de backend.
- Verificação adicional: arranque real da API com `.env.example` (candidaturas bloqueadas, `503` no POST, `403` para origem não autorizada, sem rota pública de documentos).
- Correcção nesta revisão: pedidos multipart malformados (boundary em falta, parte inválida, fim inesperado) devolviam `500` e eram registados como erro interno; passam a devolver `400 INVALID_MULTIPART`, com teste dedicado.
- `npm run build`: compilação de produção concluída.

Cobertura: candidatura válida, campos/documentos obrigatórios, distritos e vagas inválidos, referências malformadas, campos repetidos, múltiplos certificados, campos de ficheiro inesperados, PDF forjado/corrompido/activo, DOCX válido, ZIP genérico/macros, tamanho individual/total, limpeza e permissões, upload interrompido, SMTP não configurado, falhas/rejeições/timeouts simulados, MIME com anexos reais, diálogo SMTP num servidor fictício de loopback, prazo global/individual, fronteira de Maputo, repetição idempotente e simultânea, persistência de reserva, consentimento, CORS, honeypot, token e limitação por IP.

A execução inicial de testes HTTP foi impedida pelo sandbox ao abrir portas locais; a execução com a permissão necessária passou. O SMTP real de produção **não foi configurado nem testado**. Na Fase 3 não foram realizados testes visuais em navegador, dispositivos móveis ou cPanel. A Fase 4 acrescenta testes Chromium em quatro resoluções, descritos abaixo; dispositivos físicos e cPanel continuam pendentes.

## Configurações e validações pendentes

1. Aprovação e texto integral da política de privacidade: responsável, destinatários, contactos, direitos e prazo de conservação, incluindo a caixa de e-mail, cópias de segurança e registos pseudonimizados.
2. Anúncios oficiais para conferir os resumos de requisitos e condições, sem inventar critérios.
3. Horário exacto de encerramento por vaga, formatos autorizados e limites efectivos do serviço de e-mail.
4. SMTP institucional: remetente autorizado, autenticação, TLS e posterior teste controlado com anexos, mediante autorização explícita.
5. Segredo aleatório estável e directórios privados, com permissões apropriadas.
6. Node.js 22+, suporte de aplicações persistentes, configuração de proxy `/api`, origens HTTPS, IPs de proxy, limites e tempos de upload no cPanel.
7. Verificação adicional em dispositivos físicos, Safari/Firefox e leitor de ecrã; o Chromium já foi verificado na Fase 4.

A publicação requer uma fase própria e autorização explícita. Nenhuma candidatura pública foi activada nesta fase.


## Fase 4 — validação da integração

Relatório completo: [docs/FASE-4.md](docs/FASE-4.md).

Foram corrigidos o bloqueio após `410`, o tratamento de respostas HTTP sem JSON, a validação do contrato de configuração/confirmação e a navegação por teclado da janela. O design e as regras do backend foram preservados.

Validação: **37 testes Node e 27 testes Playwright aprovados**, além do build de produção. O navegador verificou as quatro vagas, distritos, anexos, referências, progresso, erros HTTP, duplicados, resposta perdida, encerramento e resoluções de 360, 390, 768 e 1440 px. Todos os dados e o transporte SMTP são fictícios e locais.

Para executar os testes de navegador:

```bash
npx playwright install chromium --only-shell
npm run test:e2e
```

Opcionalmente, definir `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` para usar um Chromium já instalado. O servidor de testes é iniciado automaticamente apenas em loopback e não lê o `.env` real. Os resultados e capturas ficam em `test-results/`, excluído do controlo de versões.

Continuam pendentes as aprovações institucionais, o ensaio autorizado do SMTP real e a validação de cPanel/dispositivos físicos. Não houve deploy nem activação de candidaturas públicas.


## Fase 5 — preparação para produção

Relatório e checklist: [docs/FASE-5.md](docs/FASE-5.md). Proposta **não aprovada**: [docs/POLITICA-PRIVACIDADE-PROPOSTA.md](docs/POLITICA-PRIVACIDADE-PROPOSTA.md).

Foi criado `.env.production.example`, sem credenciais e com candidaturas fechadas. `NODE_ENV=production` exige origens HTTPS explícitas, `PUBLIC_ROOT`, temporários e duplicados absolutos, segredo estável e limite MIME confirmado quando SMTP está configurado. O backend protege também a raiz pública declarada. Booleanos, datas, JSON e modos SMTP inválidos são rejeitados.

Novos comandos:

```bash
npm start                  # ambiente já injectado pelo gestor; não carrega .env
npm run check:production   # somente leitura; não liga a SMTP nem publica
npm run check:bundle       # inspeccionar dist/ após o build
```

Para um ficheiro privado de produção: `node --env-file=/caminho/privado/.env.production scripts/check-production.mjs`. O modelo com campos vazios deve falhar o preflight; preencher placeholders não equivale a verificar o alojamento. Os comandos locais `npm run dev` e `npm run server` mantêm-se.

A marca foi actualizada conforme o logótipo fornecido, com ficheiro institucional servido localmente, cores correspondentes e os contactos: `info@protege.org.mz`, `+258 87 646 0000`, Bairro Polana Cimento "A", Av Francisco O. Magumbwe, Cidade de Maputo. Estrutura e funcionalidades preservadas; proveniência em [docs/LOGOTIPO.md](docs/LOGOTIPO.md).

Validação da Fase 5: **45 testes Node e 27 Playwright**, build e scanner do bundle com canários sintéticos. Permissões, limpeza, falhas de configuração, rotas privadas e candidaturas fechadas foram exercitados. Não há credenciais reais, teste SMTP externo, deploy ou alteração de WordPress/DNS. A produção permanece por validar no cPanel e as candidaturas não foram abertas.

Ficheiros novos: `.env.production.example`, `scripts/check-production.mjs`, `scripts/check-bundle.mjs`, `tests/production.test.js`, `public/brand/protege-logo.jpg` e documentação da Fase 5. Actualizados a configuração e protecção de armazenamento do backend, os modelos de ambiente, scripts npm e apresentação institucional. A proposta de retenção não altera regras de recrutamento nem configura automaticamente a política.

## Candidatura directa por e-mail

Por indicação do responsável pelo projecto, quando a submissão online não está disponível, «Candidatar-me» apresenta a opção **Enviar candidatura por e-mail** para `recrutamentoprotege1@gmail.com`. A mesma opção funciona se a configuração da API estiver indisponível. Mantém-se a indicação de encerramento quando o prazo conhecido tiver terminado.

O candidato selecciona um distrito permitido e o botão `mailto:` abre o programa de e-mail com assunto e mensagem-modelo. Os dados pessoais, as três referências e os documentos devem ser preenchidos/anexados no serviço de e-mail do candidato. Não há envio automático, anexação automática, confirmação de recepção ou necessidade de credenciais SMTP do portal nesse percurso. Se não existir cliente configurado, o endereço e o assunto ficam visíveis para cópia para o webmail.

O backend e o formulário online existentes foram preservados. Esta alteração não assinala aprovação da proposta de privacidade nem altera as flags do servidor. O prazo no backend continua a regular a API; mensagens enviadas directamente à caixa são avaliadas pela equipa de recrutamento, que deve verificar a data de recepção e os documentos.
# protege-recrutamento
