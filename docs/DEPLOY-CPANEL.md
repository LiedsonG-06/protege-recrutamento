# Publicação manual no cPanel sem rsync

## Estado e arquitectura

Confirmado pelo administrador: SSH na porta 22, conta `protegeo`, TAR e cliente SFTP disponíveis, rsync indisponível. O **subsistema SFTP do servidor e as permissões reais ainda não foram verificados** neste trabalho: não foi feita nenhuma ligação remota. Cliente SFTP instalado não comprova subsistema activo.

O workflow `.github/workflows/deploy.yml` só aceita `workflow_dispatch`. Node 22 → `npm ci` → `npm test` → build → verificação de dist → artefacto de sete dias. O job deploy depende de todos esses passos e da opção `publish` explicitamente marcada (default false). Usa o environment `cpanel-production`. Não existem triggers push/PR.

O job verifica novamente o artefacto, testa o subsistema com `sftp -b` (`pwd` e `ls` do destino), e só então inicia operações de escrita. Scripts:

- `scripts/check-dist.sh`: recusa ocultos, symlinks, src, tests, node_modules, sourcemaps, PHP, chaves, php.ini e cgi-bin.
- `scripts/deploy-sftp.sh`: autenticação, probe SFTP, arquivo TAR apenas de dist, transferência SFTP para staging privado e execução SSH.
- `scripts/remote-release.sh`: valida caminhos e permissões, cria backup, publica ou reverte.

Destino fixo `/home/protegeo/public_html/recrutamento`. Staging/backup ficam em `/home/protegeo/deploy-recrutamento/RUN_ID-RUN_ATTEMPT/`, com directórios privados. O clone `/home/protegeo/repos/protege-recrutamento` não participa. Não há `.cpanel.yml`, pull no servidor ou Node remoto. Requer Bash, tar, gzip, find, realpath, cp, mv e chmod no servidor; não requer rsync.

## Autenticação sem alterar a chave pessoal

Usar a chave dedicada **`protege_actions_deploy_v2`**, já protegida por passphrase. Não retirar essa protecção nem modificar a chave pessoal. Confirmar que a pública correspondente à v2 está autorizada no cPanel. Guardar a privada completa e a passphrase em Secrets separados do environment de produção; nunca em código, chat ou ficheiros públicos.

`scripts/ssh-auth.sh` inicia um agente isolado por execução, sem reutilizar o agente do utilizador. `ssh-add -t 600` carrega a chave por até dez minutos. Um helper SSH_ASKPASS temporário recebe a passphrase por variável de ambiente exclusivamente no processo de carregamento, com SSH_ASKPASS_REQUIRE=force e stdin fechado. A passphrase nunca é argumento de comando nem conteúdo escrito no helper. O helper só responde uma vez, para impedir ciclos em caso de passphrase errada. Não há prompts interactivos.

Depois do carregamento, remove a privada e o helper temporários e elimina as variáveis de chave/passphrase do shell. SSH/SFTP usam a identidade pública seleccionada e a chave privada no agente: BatchMode, IdentitiesOnly e autenticação exclusivamente publickey. O encaminhamento do agente fica desactivado. O trap EXIT termina o agente e apaga a pasta temporária, também em erro; INT/TERM conduzem à mesma limpeza. SIGKILL ou falha abrupta do runner não permitem traps: usar runners GitHub efémeros, não um host partilhado persistente. Não activar tracing de shell ou imprimir variáveis de ambiente.

A chave da conta `protegeo` pode herdar acesso ao WordPress. Solicitar ao fornecedor uma conta/permissões isoladas para esta pasta quando possível. Restrições da chave devem suportar tanto subsistema SFTP como comandos shell de backup/publicação; um ForceCommand só de SFTP impede este método. Desactivar agent/port/X11 forwarding e PTY se compatível. Caminhos fixos no workflow não substituem isolamento no servidor.

## Configurar no GitHub

1. Rever os ficheiros e autorizar separadamente commit/push. Nenhum foi executado. O workflow deve existir na branch predefinida para aparecer em Actions.
2. Criar Settings → Environments → `cpanel-production`. Restringir às branches aprovadas e activar required reviewers/prevent self-review se disponíveis no plano. Rever as regras antes de introduzir Secrets. Ver [protecção de environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
3. Criar exclusivamente Environment Secrets:

| Secret | Conteúdo |
| --- | --- |
| `CPANEL_SSH_HOST` | Hostname SSH confirmado pelo fornecedor; não presumir o domínio público |
| `CPANEL_SSH_PRIVATE_KEY` | Privada completa de `protege_actions_deploy_v2`, mantendo a passphrase |
| `CPANEL_SSH_PASSPHRASE` | Passphrase exacta da chave v2 |
| `CPANEL_SSH_KNOWN_HOSTS` | Linha(s) known_hosts com chave de host previamente validada |

Porta 22 e utilizador protegeo ficam fixos no script. Os antigos Secrets CPANEL_SSH_PORT/USER deixam de ser usados. O Secret adicional é a passphrase da chave dedicada v2; não usar a chave pessoal.

Comparar a fingerprint SHA256 da chave de host com informação fornecida por canal independente pelo fornecedor. `ssh-keyscan` pode recolher uma chave, mas não a autentica. O script exige uma entrada correspondente ao hostname, valida a chave com ssh-keygen e aceita entradas hashed. SSH/SFTP usam apenas esse known_hosts, StrictHostKeyChecking=yes, GlobalKnownHostsFile=/dev/null, VerifyHostKeyDNS=no e UpdateHostKeys=no. A validação local de formato não autentica a origem da chave: a fingerprint tem de ser previamente confirmada por canal independente. Não executar keyscan no workflow nem aceitar hosts novos automaticamente.

4. Executar Run workflow com `publish` desmarcado e inspeccionar o artefacto. Essa execução não contacta o servidor.
5. Antes de autorizar a publicação: confirmar document root em cPanel Domains, subsistema SFTP, permissões e espaço para backup, staging e build. Uma verificação administrativa autorizada pode usar SFTP batch `pwd`/`ls /home/protegeo/public_html/recrutamento`; isso verifica subsistema/leitura, não escrita. As verificações `test -w` do script são preliminares; apenas uma escrita autorizada confirma ACL/quota/estado real. O workflow pára em qualquer erro de escrita.
6. A execução `publish=true` é uma autorização de publicação, não um teste sem escrita: cria staging/backup e publica após as verificações. Só executar após autorização institucional explícita. Rever também a versão pública e os links de candidatura existentes antes de autorizar; este trabalho não activa candidaturas.

## Backup, preservação e reversão

Antes de transferir, o script recusa symlinks/caminhos redireccionados, ficheiros especiais e entradas sem permissão de escrita. Cria `backup.tar.gz` completo do destino e verifica a leitura da tabela TAR. Falha do backup impede a publicação. O arquivo pode conter configurações sensíveis: fica fora de public_html, sem upload como artefacto GitHub.

Só o TAR de dist vai por SFTP, para staging privado. A extracção ocorre no staging, verifica novamente conteúdo proibido e copia assets antes de substituir index.html por rename no mesmo destino. Não há rm, mirror ou delete. `.htaccess`, `.user.ini`, `php.ini`, `.well-known` e `cgi-bin` não são incluídos no build nem removidos/substituídos. Não são tocados WordPress, DNS, design ou regras de candidatura. Conteúdo antigo já existente (incluindo eventuais ficheiros indevidos) não é limpo automaticamente.

Para reverter, após autorização própria, a partir de uma máquina administrativa com este checkout revisto e known_hosts validado, substituir HOST e RUN_ID-RUN_ATTEMPT pelos valores reais:

```bash
ssh -F /dev/null -p 22 -i ~/.ssh/protege_actions_deploy_v2 \
  -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes \
  -o UserKnownHostsFile=~/.ssh/protege-known_hosts \
  protegeo@HOST 'bash -s -- rollback RUN_ID-RUN_ATTEMPT' < scripts/remote-release.sh
```

Este comando de reversão administrativa pede a passphrase no terminal local; não a colocar em argumentos. A autenticação batch do workflow usa o agente descrito acima. Validar previamente `tar -tzf /home/protegeo/deploy-recrutamento/RUN_ID-RUN_ATTEMPT/backup.tar.gz` numa sessão administrativa autorizada. O rollback repõe o conteúdo anterior, preservando as configurações de alojamento actuais; assets novos sem referências permanecem. Não é restauração exacta com remoção. Se o destino estava vazio, o backup não despublica o frontend: suspender acesso com o administrador e planear remoção específica autorizada. A reversão também pode ser parcial se a rede/disco falharem; validar o site depois. Nenhuma reversão corre automaticamente.

Backups/staging ficam conservados sem limpeza automática. Definir retenção e limpeza administrativa após validar publicação e reversão, para evitar esgotar quota. Não existe troca atómica de todo o site; index é substituído por último e os assets antigos permanecem. Usar janela sem escritas concorrentes no destino. O backup completo exige espaço e não prova sozinho capacidade de restauro.

## Análise das quatro vulnerabilidades

`npm audit --json` identificou **um advisory de ReDoS em picomatch** (GHSA-fc5q-39xc-vjpf), propagado por picomatch, fdir, tinyglobby e Vite: quatro pacotes reportados, não quatro falhas independentes. Padrões glob maliciosos podem consumir CPU. Referência: [advisory GitHub](https://github.com/advisories/GHSA-fc5q-39xc-vjpf).

No projecto são dependências de desenvolvimento/build, não serviços Node em produção: só o frontend estático vai para o servidor. Isto reduz a exposição do site publicado, mas não elimina risco em desenvolvimento/CI com entradas não confiáveis. Não executar código/alterações de build não revistos com Secrets de produção.

O ensaio local `npm audit fix --ignore-scripts` baixou Vite 6.4.6 para 6.2.7 e passou a reportar outros advisories de Vite. Essa alteração foi descartada; package.json e lockfile permanecem intactos. A indicação fixAvailable não foi tratada como garantia de correcção segura. A versão actual mantém os quatro avisos: rever uma actualização suportada com nova auditoria e testes antes da primeira publicação. Não foi usado `--force` nem override sem validação.

## Testes e pendências

Node 22.23.5: npm ci, quatro testes Node, build Vite e check-dist aprovados. Integração local em pastas temporárias (`python3 scripts/test-deploy.py`) verifica backup, publicação, preservação das cinco configurações, rollback e recusa de symlink. Teste local de autenticação (`python3 scripts/test-ssh-auth.py`) com chaves Ed25519 fictícias protegidas: carregamento real no agente, opções batch, known_hosts normal/hashed, passphrase errada/ausente, privada inválida, host ausente/chave inválida e limpeza em sucesso, erro e sinal TERM. Não usa servidor SSH nem rede. Sintaxe Bash/YAML e diff verificados. Não foram executados Playwright, GitHub Actions, SSH/SFTP real, escrita remota ou deploy.

Pendentes: hostname/known_hosts autenticado, autorização da pública v2, quatro Secrets e protecções GitHub, confirmação real de subsistema/permissões/quota, avaliação da actualização de dependências, autorização de push e de primeira publicação. Nenhum teste local confirma o estado real do servidor.

Actualização da autenticação v2: testes de agente e integração local novamente aprovados; quatro testes Node, check-dist, sintaxe Bash/YAML e diff aprovados. Não foi necessário alterar o script remoto de backup/publicação/reversão nesta actualização.
