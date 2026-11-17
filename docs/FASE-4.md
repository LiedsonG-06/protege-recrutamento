# Fase 4 — Validação da integração

Data: 17/11/2026. Projecto existente preservado; sem deploy, alterações de DNS ou do website institucional.

## Diagnóstico

O React consulta `GET /api/v1/config` ao abrir o portal e novamente ao abrir o formulário. Recebe disponibilidade, política, limites, token, hora de referência e prazos. O formulário utiliza `POST /api/v1/applications` com `FormData` e `Idempotency-Key` estável por janela. Os nomes dos campos e ficheiros coincidem com o contrato Express/Multer.

Confirmado no navegador o fluxo React → proxy Vite → Express → validação real dos documentos → transporte de e-mail simulado. As quatro vagas enviam os identificadores correctos e o distrito escolhido. O/a Supervisor/a só apresenta Massangena; as outras vagas apresentam Guijá, Mapai e Massangena. CV, carta e dois certificados chegaram como quatro anexos com conteúdo binário correspondente aos PDFs sintéticos. As três referências apareceram no corpo do e-mail.

O backend existente já validava dados, prazo e documentos, limitava pedidos, removia temporários e controlava duplicados. Não foi necessário recriar nem alterar essas regras.

## Problemas e correcções

| Problema identificado | Correcção |
| --- | --- |
| Uma resposta `410` deixava o botão activo se o prazo local ainda parecesse aberto | O formulário conserva o encerramento indicado pelo servidor e desactiva a submissão |
| Uma resposta HTML do proxy era apresentada como falha de ligação devido à tentativa de parsing JSON | Tratamento do estado HTTP mesmo sem JSON; mensagens específicas e nenhuma confirmação falsa |
| A confirmação aceitava uma resposta de sucesso sem verificar rigorosamente o contrato | Só `200`/`201`, `status: accepted` e referência textual não vazia confirmam aceitação |
| Configuração parcialmente validada podia fornecer datas/limites inválidos ao formulário | Validação dos campos do contrato antes de habilitar a integração; falha mantém o envio bloqueado |
| A contenção de foco incluía o honeypot e omitia o elemento `summary` da política | Filtragem de elementos ocultos/desactivados e inclusão dos elementos efectivamente navegáveis |

O frontend também mantém uma resposta `409` como bloqueio de novas tentativas nessa janela, mesmo que falte o código JSON. Os dados preenchidos permanecem após erros. A regra de reserva de duplicados no backend não foi alterada.

## Testes executados

- `npm test`: 37 testes aprovados, zero falhas.
- `npm run test:e2e`: 27 testes Playwright aprovados, zero falhas, usando Chromium já instalado através de `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
- `npm run build`: concluído.
- Navegador utilizado: Google Chrome for Testing 158.0.8127.18, headless, com Playwright.

Os testes de navegador verificam:

1. As quatro vagas e os distritos, com pedidos reais à API local e anexos reais em memória.
2. Obrigatoriedade, progresso, bloqueio de duplo clique e fecho da janela durante o envio.
3. Mensagens para `400`, `403`, `409`, `410`, `502` e `503`, injectados no limite HTTP para verificar a interface; os testes de backend cobrem as respectivas condições do servidor.
4. Falha SMTP simulada atravessando o backend real, sem mensagem de sucesso.
5. Resposta perdida depois de o servidor aceitar a candidatura: repetição com a mesma chave devolve a confirmação anterior e mantém apenas um e-mail simulado.
6. Nova janela com a mesma candidatura: `409` real e apenas um e-mail simulado.
7. Encerramento automático com formulário aberto e encerramento real no servidor prevalecendo sobre configuração antiga.
8. Configuração indisponível, malformada ou com candidaturas desactivadas; resposta `503` HTML; resposta `200` sem confirmação válida.
9. Navegação por teclado, exclusão do honeypot e acesso à política.
10. Página e formulário a 360×800, 390×844, 768×1024 e 1440×900: ausência de transbordo horizontal, janela dentro do ecrã e botão de envio acessível por deslocação vertical.

Foram geradas capturas da página e do início/fim do formulário em `test-results/`. Capturas de 360 px e 1440 px foram também inspeccionadas visualmente. As capturas usam apenas dados fictícios e ficam excluídas do controlo de versões.

Durante a preparação, a versão de navegador esperada pelo Playwright não estava instalada. Foi usado o Chromium existente por caminho explícito; não se considera o arranque inicial sem navegador um teste funcional do portal. Um cenário inicial avançava quatro dias e expirava primeiro o token: o teste foi corrigido para atravessar o minuto de encerramento com token ainda válido, sem modificar a regra do servidor.

## Reproduzir

```bash
npm install
npx playwright install chromium --only-shell
npm test
npm run test:e2e
npm run build
```

Se já existir um Chromium compatível, pode ser indicado explicitamente:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/caminho/para/chromium npm run test:e2e
```

O Playwright inicia e termina a sua própria instância de teste em `127.0.0.1:4175`, sem reutilizar servidores existentes. `tests/support/browser-server.mjs` cria uma API em porta efémera, usa apenas configuração sintética e injecta um transporte de e-mail em memória. Não lê `.env`, não cria transporte SMTP externo e não envia mensagens ao Gmail. As rotas `__test` pertencem apenas ao suporte de testes e não existem no backend de produção. As candidaturas públicas continuam bloqueadas na configuração padrão.

## Ficheiros da Fase 4

Alterados: `src/components/ApplicationForm.jsx`, `src/components/Modal.jsx`, `src/config/usePortalConfig.js`, `package.json`, `package-lock.json`, `.gitignore` e `README.md`.

Criados: `playwright.config.js`, `tests/e2e/application.spec.js`, `tests/support/browser-server.mjs` e este relatório. A dependência `@playwright/test` é exclusivamente de desenvolvimento. Nenhum ficheiro em `node_modules` foi editado manualmente.

## Limites e recomendações para a Fase 5

- Os testes executados usam Chromium headless e resoluções simuladas. Faltam dispositivos físicos, Safari/Firefox, leitor de ecrã e ligações móveis reais.
- Aprovar a política e retenção dos dados, conferir os anúncios oficiais e confirmar o horário de encerramento e os formatos/limites autorizados.
- Confirmar Node.js, directórios privados, HTTPS, proxy `/api`, origens e IPs dos proxies no cPanel, sem efectuar publicação nesta fase.
- Preparar um ensaio SMTP institucional controlado, com autorização explícita e dados fictícios. O SMTP real, as credenciais, a entrega final à caixa de entrada e os limites efectivos do serviço continuam por validar.
- Manter candidaturas públicas bloqueadas até concluir essas aprovações e verificações. Não há recomendação de alterar as regras de recrutamento nesta fase.
