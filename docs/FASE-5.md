# Fase 5 — preparação para produção

Data: 17/11/2026. Destino previsto: **https://recrutamento.protege.org.mz**.

**Estado: código e preparação local concluídos; publicação bloqueada por confirmações do alojamento e aprovações institucionais. Não houve deploy, alteração de DNS, WordPress ou credenciais reais. O ambiente de produção não foi validado porque não houve acesso ao servidor.**

## 1. Diagnóstico técnico

Foram revistos README, relatório da Fase 4, React/Vite, Express, configuração, SMTP, upload, limpeza e persistência de duplicados.

- React usa caminhos relativos `/api/v1/config` e `/api/v1/applications`. O proxy de `vite.config.js` só funciona em desenvolvimento. O build é estático; não executa Express nem contém credenciais SMTP.
- Express valida os pedidos e ficheiros no servidor e envia CV, carta, certificados e referências por SMTP. Não serve documentos nem a raiz do repositório. Não tem neste momento serviço de ficheiros estáticos do frontend.
- O backend aplica o prazo em `Africa/Maputo` por instante ISO com `+02:00`. O valor herdado encerra às 00:00 de 21/11/2026, terminando o dia 20; o horário institucional ainda não está confirmado.
- O consentimento só é habilitado quando a configuração permite candidaturas. Política aprovada, texto e versão são requisitos de abertura. Uma proposta documental não constitui aprovação.
- Temporários são privados e removidos após processamento. Duplicados usam reservas em disco; o directório e o segredo devem sobreviver a reinícios e novas versões.
- O alvo inicial é um processo Node num servidor, com disco persistente. Várias instâncias exigem rever armazenamento atómico e limitação distribuída de pedidos.

### Alterações desta fase

- Criado `.env.production.example`, mantendo as candidaturas fechadas e sem credenciais.
- Em produção, a configuração exige origens HTTPS explícitas, segredo estável e caminhos absolutos de raiz pública/temporários/duplicados.
- Verificada também a raiz pública declarada ao proteger directórios privados, incluindo o caminho canónico.
- Valores booleanos inválidos, datas impossíveis e JSON de prazos inválido são rejeitados. Portas SMTP padrão são verificadas contra o modo de encriptação.
- Acrescentado `SMTP_MAX_MESSAGE_BYTES`: o limite declarado deve comportar os anexos com base64, quebras de linha e margem de cabeçalhos/texto. É obrigatório quando há SMTP configurado em produção.
- Criados verificadores locais de produção e de bundle. Não ligam a SMTP nem publicam o sistema.
- Inseridos logótipo institucional e contactos fornecidos; as cores seguem a marca, preservando as secções/componentes. O logótipo é servido localmente e não foi redesenhado. Proveniência em [LOGOTIPO.md](LOGOTIPO.md).

## 2. Requisitos do servidor — confirmar com o alojamento

| Requisito | Evidência necessária antes de publicar |
| --- | --- |
| Node.js 22+ e npm | Saída de `node --version` e `npm --version` do processo real, não apenas de outro terminal |
| Aplicação persistente | Application Manager/Passenger ou serviço equivalente, arranque/reinício e política de suspensão confirmados |
| Entrada ESM | Suporte ao ficheiro `server/index.js` e às dependências; eventual adaptador Passenger só após conhecer o ambiente |
| `worker_threads` e limites de recursos | Ensaio dos parsers PDF/DOCX no runtime real; a memória dos workers faz parte do orçamento do serviço |
| Frontend estático | Raiz pública do subdomínio identificada, contendo apenas o conteúdo autorizado de `dist/` |
| Encaminhamento da API | Mesmo domínio, preservando `/api/v1/...` e respostas JSON, sem encaminhar a API para `index.html` |
| HTTPS | Certificado válido, cadeia, renovação e redireccionamento HTTP→HTTPS confirmados no servidor |
| Armazenamento privado | Directórios absolutos fora da raiz pública, proprietário do processo, permissões `0700` e ficheiros `0600` |
| Persistência | `DEDUP_DIR` e segredo estáveis entre versões/reinícios; sem limpeza indiscriminada do disco privado |
| Upload | Limites do proxy/WAF superiores ao multipart autorizado, respeitando o total da aplicação mais os campos/boundary |
| SMTP de saída | Host, DNS de resolução, porta, TLS e acesso de rede autorizados pelo alojamento |
| Operação | Logs sem conteúdo de candidaturas; orçamento de disco/memória, backups privados e procedimento de incidentes |

Não assumir que um plano cPanel inclui Node.js ou permissões para configurar proxies. Pedir ao fornecedor a modalidade exacta e as limitações do plano. A documentação oficial descreve [Application Manager](https://docs.cpanel.net/cpanel/software/application-manager/112/) e [aplicações Passenger](https://docs.cpanel.net/knowledge-base/web-services/using-passenger-applications/), mas não comprova os recursos desta conta.

## 3. Configuração de produção

Arquitectura preferencial, sujeita a confirmação:

| Pedido | Destino |
| --- | --- |
| `/`, `/assets/*`, `/brand/*` | Ficheiros de `dist/` servidos pelo servidor web |
| `/api/v1/*` | Express num processo gerido, normalmente em loopback, conservando o prefixo `/api/v1` |
| `.env`, `/server/*`, `/node_modules/*`, documentos e disco privado | Nunca publicados |

Não usar `vite dev` ou `vite preview` como servidor de produção. Não expor uma porta Node directamente à Internet. O proxy deve remover cabeçalhos de encaminhamento fornecidos pelo cliente e definir os seus próprios. Só depois configurar `TRUSTED_PROXIES` com os IP/CIDR exactos confirmados; não usar confiança global.

Passenger pode gerir portas e o ficheiro de arranque de forma própria. Confirmar no suporte se o URL da aplicação conserva ou remove `/api`, se permite ESM e se serve estáticos antes do encaminhamento. Se isso não for possível, a arquitectura precisa de adaptação e novos testes antes da Fase 6; não publicar apenas o frontend com a API desligada.

O processo usa `npm start` quando recebe variáveis do gestor. Este comando não lê `.env` automaticamente. Para execução manual autorizada, usar `node --env-file=/caminho/privado/.env.production server/index.js`. O comando `npm run server` continua reservado ao desenvolvimento com `.env` local.

Configurar redireccionamento HTTPS e cabeçalhos no virtual host do subdomínio, sem afectar o WordPress. Considerar HSTS apenas após validar o certificado e o âmbito; não aplicar `includeSubDomains` ao domínio institucional sem autorização própria. Frontend e API devem usar a mesma origem HTTPS. CORS não é autenticação e não substitui os restantes controlos.

## 4. Variáveis necessárias

O inventário completo e os comentários estão em `.env.production.example`. Os caminhos `CPANEL_USER` são placeholders; não devem ser executados sem substituição e confirmação.

| Variável/grupo | Configuração/revisão |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST`, `PORT` | Loopback/porta do serviço; confirmar o contrato do gestor de aplicações |
| `ALLOWED_ORIGINS` | Exclusivamente `https://recrutamento.protege.org.mz` para este portal |
| `PUBLIC_ROOT` | Raiz pública absoluta real, existente |
| `UPLOAD_TEMP_DIR`, `DEDUP_DIR` | Absolutos, separados e fora da raiz pública |
| `APPLICATION_SECRET` | Aleatório, pelo menos 32 caracteres, estável e privado; rotação exige plano para os tokens/reservas existentes |
| `APPLICATIONS_ENABLED` | **false nesta preparação** |
| `PRIVACY_APPROVED` | **false até aprovação expressa** |
| `PRIVACY_POLICY_TEXT`, `PRIVACY_POLICY_VERSION` | Texto integral final e versão aprovados; não copiar a proposta como se já estivesse aprovada |
| `APPLICATION_DEADLINE_AT` | Confirmar o horário; actualmente `2026-11-21T00:00:00+02:00` |
| `JOB_DEADLINES_JSON` | Objecto de substituições por identificador de vaga, se necessário |
| `MAX_FILE_BYTES`, `MAX_TOTAL_BYTES`, `MAX_CERTIFICATES` | Provisoriamente 5 MiB/ficheiro, 15 MiB no total e cinco certificados; confirmar formatos e limites |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Dados reais apenas numa fase autorizada; normalmente 587/STARTTLS ou 465/TLS implícito |
| `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Credenciais backend e remetente autorizado pelo fornecedor; não presumir que `info@` já está autorizado a enviar |
| `SMTP_MAX_MESSAGE_BYTES` | Limite da mensagem completa declarado pelo fornecedor; não inferir apenas do endereço Gmail de destino |
| `TRUSTED_PROXIES` | Vazio até confirmação de IPs/CIDR legítimos |
| `DEDUP_TTL_HOURS` | 24 horas por defeito, com limpeza seguinte; confirmar institucionalmente |
| `MIN_FORM_SECONDS`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MINUTES` | Valores existentes: 3 segundos, cinco tentativas por IP a cada 15 minutos |

Gerar o segredo apenas no ambiente privado autorizado, sem o copiar para este relatório. Usar as variáveis do gestor cPanel ou um ficheiro fora da raiz pública com permissões `0600`. Não colocar segredos em `VITE_*`, scripts de build, URLs, logs ou ficheiros do frontend.

### Verificadores

```bash
# Com variáveis já injectadas pelo gestor:
npm run check:production

# Ou, depois de criar/configurar o ficheiro privado:
node --env-file=/caminho/privado/.env.production scripts/check-production.mjs

# Sobre um build já gerado:
npm run check:bundle
```

O preflight é somente leitura e não cria directórios, não envia mensagens e não aprova políticas. Nesta fase pode/deve terminar com código 1 por faltarem aprovações, segredo ou dados do alojamento. Só pode apresentar todos os itens OK depois de essas pendências terem sido resolvidas por quem tem autoridade. Mesmo assim não verifica certificado público, DNS, conectividade SMTP, entrega ou validade jurídica da política.

## 5. Procedimento de publicação no cPanel — reservado à Fase 6

**Procedimento documentado, não executado. Não modificar DNS ou WordPress nesta fase.**

1. Receber autorização de publicação, confirmação dos recursos da conta e definição do responsável por reversão. Separar autorização para publicar fechado da autorização posterior para abrir candidaturas.
2. Registar caminhos, domínio, runtime, gestor, processo e configuração actual. Preparar uma cópia privada da versão anterior e das configurações, sem colocar segredos no pacote.
3. Num ambiente de build controlado, executar `npm ci`, testes e `npm run build`; verificar `dist/`. O ambiente usado não deve fornecer credenciais SMTP ao build.
4. Preparar a raiz da aplicação Node fora da raiz pública com `package.json`, lockfile, `server/`, os módulos partilhados necessários em `src/config/` e dependências de produção por `npm ci --omit=dev`. É permitido manter o restante código privado; não usar `npm ci --omit=dev` antes do build React.
5. Criar os directórios privados reais com proprietário correcto e `0700`. Manter `DEDUP_DIR` fora de pastas de releases. Definir `PUBLIC_ROOT` para a raiz pública existente e colocar somente os ficheiros de `dist/` nessa raiz.
6. Configurar o gestor Node com o ficheiro de arranque e modo confirmados pelo alojamento. Injectar variáveis privadas e manter `APPLICATIONS_ENABLED=false`. Não assumir que o gestor executa automaticamente o script npm local ou carrega `.env`.
7. Solicitar ao administrador o encaminhamento de `/api/v1/*`, sem retirar esse prefixo, e os limites/timeouts adequados ao upload. Validar a URL real de `/api/v1/config`; não basta uma página HTML com estado 200.
8. Validar HTTPS, CORS, redireccionamentos, bloqueio de ficheiros privados, permissões, relógio e reinício com persistência. Configurar o mecanismo de limpeza também para períodos de suspensão do processo (serviço contínuo ou tarefa privada agendada confirmada pelo alojamento).
9. Executar o preflight e os testes de aceitação autorizados no ambiente real, ainda fechado. Não confundir uma falha por configuração pendente com autorização para activar flags.
10. Só realizar o ensaio SMTP e a eventual abertura com autorizações separadas, política aprovada, anúncios conferidos e horário confirmado. Se o prazo já tiver terminado, não o prolongar sem decisão institucional.

O processo Node tem `requestTimeout=120s`; a análise de cada ficheiro tem limite de cinco segundos e o SMTP tem timeouts próprios. O proxy precisa de acomodar upload, parsing e SMTP, sem tempos ilimitados. Confirmar os valores com o fornecedor em vez de publicar uma regra `.htaccess` genérica incompatível com o plano.

## 6. Plano de testes SMTP — sem execução real nesta fase

O código fixa o destinatário em `recrutamentoprotege1@gmail.com` e usa `SMTP_FROM` como remetente; o candidato entra em `Reply-To`. `info@protege.org.mz` é o contacto institucional da interface e não foi automaticamente configurado como identidade SMTP.

A configuração utiliza TLS obrigatório, certificados válidos e buffers de anexos locais. O [Nodemailer documenta](https://nodemailer.com/smtp) TLS implícito em 465 e STARTTLS em ligações como 587. Confirmar junto do fornecedor o host, porta, mecanismo de autenticação disponível, remetentes permitidos, quotas/hora/dia, mensagens por ligação, limite MIME e regras de bloqueio/quarentena. O código actual usa autenticação por utilizador/palavra-passe; um serviço exclusivamente OAuth exigirá adaptação autorizada.

Validar com o administrador do domínio SPF, assinatura DKIM e alinhamento DMARC do remetente/serviço efectivo, bem como relatórios e política existente. Não criar nem alterar registos nesta fase. As [orientações oficiais do Gmail](https://support.google.com/mail/answer/81126) recomendam autenticação do domínio; isso não garante entrega e não confirma a configuração actual da PROTEGE.

Após autorização explícita:

1. Escolher janela, operador, dados fictícios, identificação clara de teste e quem confirmará a recepção. O destinatário de produção está fixo; qualquer ensaio que o utilize precisa de autorização específica. Para usar outra caixa de testes, preparar alteração isolada e autorizada, sem abrir candidaturas públicas.
2. Verificar resolução, acesso de rede, TLS e autenticação. Mesmo `verify()` liga ao serviço real e não deverá ser executado nesta fase.
3. Enviar uma única mensagem controlada por cada cenário acordado, com CV/carta e vários certificados sintéticos. Confirmar nomes, tipos, abertura e conteúdo de todos os anexos, assunto, distrito, três referências, data de Maputo e `Reply-To`.
4. Medir o tamanho MIME real, verificar limites, cabeçalhos de autenticação, pasta de spam e eventual quarentena, sem desactivar TLS ou controlos do destinatário.
5. Verificar rejeições, indisponibilidade e timeout de forma controlada; usar mocks para cenários perigosos. Aceitação SMTP não garante entrega final. Não repetir automaticamente um resultado incerto.
6. Registar apenas identificadores e resultados técnicos; eliminar mensagens/anexos de teste segundo o procedimento acordado e manter o portal fechado até à autorização de abertura.

## 7. Plano de reversão

1. Ao detectar falha, manter/colocar `APPLICATIONS_ENABLED=false` mediante intervenção do operador autorizado e reiniciar pelo gestor; aguardar pedidos em curso antes de terminar processos sempre que possível.
2. Guardar referências técnicas e estado das reservas aceites/pendentes/incertas. Não reenviar mensagens para «recuperar» um erro ambíguo sem reconciliação.
3. Repor em conjunto o frontend e backend da versão anterior validada, com o seu lockfile e dependências compatíveis; não alterar WordPress/DNS para contornar a falha.
4. Preservar o **estado actual** de `DEDUP_DIR`, o segredo, configurações aprovadas e relógio/prazos. Não restaurar um snapshot antigo de reservas que possa permitir duplicar e-mails já aceites.
5. Revalidar configuração, API fechada, HTTPS, acesso a estáticos e bloqueio de ficheiros privados. Não abrir candidaturas como consequência automática da reversão.
6. Se não existir versão anterior, deixar a página informativa e o serviço de submissão indisponível/fechado até corrigir. Documentar incidente e obter nova autorização para avançar.

## 8. Checklist de segurança e resultados locais

- [x] Validação no servidor, formatos/conteúdo/tamanhos e referências preservados.
- [x] Prazo bloqueado no backend e configurável sem editar código-fonte; exige reinício/reload da configuração pelo gestor.
- [x] Candidaturas e política continuam desactivadas no `.env` local e nos modelos; nenhuma credencial real introduzida.
- [x] CORS restrito, rotas privadas inexistentes e POST fechado exercitados com configuração de produção sintética.
- [x] Testes de permissões, symlinks, limpeza de órfãos, temporários recentes e upload interrompido.
- [x] Falhas de configuração testadas: origens HTTP/local, caminhos relativos/ausentes, segredo, flags inválidas, calendário, JSON, porta/TLS e orçamento MIME.
- [x] Build com canários sintéticos de segredo; scanner sem indícios desses valores, identificadores sensíveis ou ficheiros privados em `dist/`. Esta verificação não é uma prova universal de ausência de segredos.
- [x] Logótipo e contactos revistos visualmente nas capturas de 360 e 1440 px; testes de largura também a 390 e 768 px.
- [ ] Recursos, permissões efectivas, limpeza durante suspensão e persistência no cPanel.
- [ ] Certificado HTTPS, proxy real, IPs confiáveis, WAF e limites/timeouts reais.
- [ ] SMTP real, remetente, SPF/DKIM/DMARC, quotas, limite e entrega final.
- [ ] Dispositivos físicos, Safari/Firefox e avaliação adicional com tecnologias de apoio.

Testes nesta fase:

| Verificação | Resultado |
| --- | --- |
| `npm test` | 45 aprovados, zero falhas: 37 existentes e oito novos testes de preparação |
| Playwright/Chromium | 27 aprovados, zero falhas; SMTP exclusivamente simulado |
| `npm run build` | Concluído com canários sintéticos, sem credenciais reais |
| `npm run check:bundle` com os mesmos canários | Sem indícios encontrados |
| Inspecção selectiva do `.env` local | Candidaturas fechadas, política não aprovada, SMTP não configurado; nenhum valor sensível impresso |
| Preflight sobre `.env.production.example` | Código 1 esperado: faltam dados reais/segredo; não constitui aprovação de produção |

Ambiente local: Node.js 24.21.0 (dentro do requisito 22+), Chromium for Testing 158.0.8127.18 indicado por `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Não foi executado um binário Node 22 separado, não houve teste em dispositivo físico nem acesso efectivo ao cPanel. O primeiro teste do preflight foi corrigido para aceitar o alias legítimo de directório temporário do macOS, continuando a rejeitar symlinks no directório privado final e caminhos dentro da raiz pública.

## 9. Aprovações e riscos pendentes

A proposta de política está em [POLITICA-PRIVACIDADE-PROPOSTA.md](POLITICA-PRIVACIDADE-PROPOSTA.md). Não foi injectada no consentimento nem aprovada. Faltam identificação jurídica completa, responsável operacional, condições dos fornecedores/Gmail, política de acessos, eliminação de e-mails/downloads/backups, prazo de conservação e versão formal.

Riscos principais: alojamento sem runtime/proxy compatível; publicação acidental da raiz do projecto; perda de reservas ou troca do segredo; orçamento de anexos incompatível com SMTP; suspensão do processo impedindo limpeza periódica; resultados SMTP ambíguos; exposição por caixas/contas partilhadas; data de encerramento ainda sem hora aprovada. Os controlos de código reduzem riscos, mas não substituem configuração e operação verificadas.

**Recomendação:** avançar para confirmação do alojamento e revisão institucional, mantendo todas as submissões fechadas. O modelo de 180 dias na proposta é apenas uma opção para decisão, não uma regra aplicada ao sistema.

## 10. Critérios para autorizar a Fase 6

- [ ] PROTEGE aprova anúncios/requisitos, logótipo/contactos e horário exacto de encerramento.
- [ ] Política final aprovada com versão, retenção, responsáveis e procedimentos de atendimento/eliminação.
- [ ] Fornecedor confirma por evidência Node.js 22+, ESM/workers, arranque, proxy/API, HTTPS e armazenamento privado persistente.
- [ ] Operador define caminhos reais, segredo estável, origem HTTPS e plano de backups/reversão; preflight revisto no servidor.
- [ ] Serviço SMTP e remetente autorizados, limite MIME compatível e plano de teste real aprovado.
- [ ] Testes locais mantêm-se verdes; testes de aceitação no ambiente real são planeados e atribuídos.
- [ ] Autorização explícita para publicar a versão **fechada**, com responsável pela reversão.
- [ ] Autorização separada para teste SMTP real e, depois, abertura pública dentro do prazo aprovado.

A Fase 5 entrega os ficheiros, verificadores e procedimentos. Não declara o servidor validado nem substitui estas decisões por aprovação automática.
