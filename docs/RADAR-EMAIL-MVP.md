# Radar: agendamento e e-mail do MVP

Implementação sobre a main `64c17a5` de 23/10/2026. MVP com destinatário fixo no servidor; não há cadastro nem suporte multiusuário.

## Comportamento

- O único cron é `radar-automotivo-tick` no Supabase CarRouter (`eudfrgjygikirkbaxmcl`): `*/30 * * * *`, POST autenticado em `/api/radars/tick`. O token continua no Vault/servidor. A migração existente de agendamento não foi reaplicada.
- Cada radar continua com intervalo de **24 ou 168 horas**, exibido na interface junto da próxima data a partir da qual pode executar, no horário de Brasília. Pode aguardar até o próximo tick de 30 minutos.
- O worker mantém o limite de três radares por tick e os orçamentos diários/promocionais existentes. Não há compra, recarga nem aumento de créditos.
- O MVP exige `runsRemaining` finito antes de ativar. Radares antigos com limite em branco permanecem sem coleta até definir um limite. Radares pausados não são reativados. Ao esgotar o limite, o radar pausa.
- A reserva do radar, o desconto de uma execução e a criação do `RadarRun` são atômicos e precedem qualquer consulta paga. Repetir o tick ou reiniciar não repete aquela execução. Editar o nome não antecipa a próxima coleta. Uma tentativa de coleta com falha também consome o limite reservado.
- Fontes bem-sucedidas estabelecem suas bases independentemente; falhas não criam uma base vazia. A primeira coleta não envia e-mail, inclusive no modo de desconto.
- Depois da base, um único resumo por radar/execução contém somente IDs ainda não observados pelo radar, compatíveis e confirmados. Anúncios repetidos, quedas de preço de anúncios conhecidos e correspondências incertas não entram no e-mail. Os alertas internos de queda/incerteza continuam separados.
- “Novo para este radar” não confirma a data de publicação. A cobertura continua limitada às páginas consultadas; não se infere exclusão de um anúncio ausente.
- O resumo contém carro, ano, preço anunciado, cidade/UF, fonte, URL original e link para o radar. Foto somente quando o anúncio fornece `imageUrl` HTTPS; não existe imagem substituta inventada.

## Configuração no servidor

No [Render → radar-automotivo-preview → Environment](https://dashboard.render.com/web/srv-dbch2ud9fdbs73cqdsug/env):

| Variável | Valor/origem |
| --- | --- |
| `RADAR_EMAIL_TO` | Gmail solicitado pelo usuário, já configurado no serviço; somente um destinatário |
| `RESEND_API_KEY` | Chave da conta Resend, colocada exclusivamente no painel de segredos do serviço |
| `RADAR_EMAIL_FROM` | Remetente autorizado pelo Resend, por exemplo o endereço de um domínio já verificado; nunca o Gmail destinatário |
| `RADAR_EMAIL_ENABLED` | `false` durante a validação; `true` somente ao decidir ativar os resumos automáticos |
| `RADAR_APP_URL` | `https://radar-automotivo-preview.onrender.com` |
| `RADAR_SCHEDULER_ENABLED` | `true`, preservando o agendador existente |
| `RADAR_CRON_SECRET` | Segredo existente de ao menos 32 caracteres; precisa coincidir com o Vault do cron |

Não colocar chave no chat, em `NEXT_PUBLIC_*` ou no Git. O exemplo `.env.radar.example` mantém valores vazios para os segredos. Localmente, usar `.env.radar.local`, ignorado pelo Git.

`resolveRadarRecipient()` em `src/lib/radar-email.ts` centraliza a resolução do destinatário. Hoje lê a configuração do MVP; futuramente esse único ponto poderá usar o e-mail verificado do dono do radar. Os payloads persistidos congelam destinatário/remetente/conteúdo para que um retry não mude a solicitação.

A prontidão aparece na API `/api/radars` e no retorno autenticado do tick (`email.configured`, `email.enabled`, `email.missing`), sem revelar a chave. A inicialização registra somente nomes de variáveis ausentes. A existência da chave/remetente não comprova autorização ou entrega pelo Resend.

## Entrega persistida e recuperação

`RadarNotice` preserva o alerta interno e sua ligação com a execução. `RadarEmailDelivery` guarda um resumo único por `runId`, payload congelado, chave `radar-run/<runId>`, tentativas, ID do Resend e estados:

| Estado | Significado |
| --- | --- |
| `pending` | Persistido, ainda não solicitado ao provedor |
| `sending` | Tentativa reservada atomicamente |
| `retry` | HTTP 429: solicitação recusada, pode repetir somente a entrega |
| `unknown` | Timeout, 409, 5xx, resposta sem ID ou processo interrompido; conferir no Resend, sem novo POST automático |
| `accepted` | Resend retornou ID; entrega ainda não confirmada |
| `delivered` | Consulta ao Resend confirmou `last_event=delivered` |
| `failed` | Recusa definitiva, bounce, limite de tentativas ou janela encerrada; revisar |

- Máximo de **três tentativas**, sem repetir depois de **23 horas** da primeira tentativa. O Resend retém a idempotência por 24 horas; expirar nunca cria uma nova chave.
- HTTP 429 aguarda pelo menos 30 minutos. Erros e respostas do provedor não são reproduzidos indiscriminadamente em logs ou na interface.
- `sending` abandonado por mais de cinco minutos vira `unknown`. `unknown` e `failed` não são reativados automaticamente.
- Execuções interrompidas após 30 minutos são marcadas para revisão; os avisos já persistidos permitem reconstruir o resumo sem chamar anúncios novamente. O agendamento avançado continua preservado.
- Cada tick consulta no máximo dez IDs aceitos recentemente para verificar entrega, durante as primeiras 24 horas; falha nessa leitura conserva `accepted`. O horário `deliveredAt` indica quando a confirmação foi observada. Uma chave Resend restrita a envio pode não permitir essa leitura: nesse caso a interface continuará mostrando apenas aceitação, e a entrega deve ser conferida no painel Resend.
- Pausar impede novas coletas e novas tentativas automáticas. Uma entrega já iniciada pode concluir. Se o limite da última coleta pausou o radar e deixou um e-mail pendente, pode-se repetir **somente essa entrega** explicitamente, sem reativar o radar.
- A tabela de entregas tem RLS e não permite acesso por `anon`/`authenticated`; o acesso continua exclusivamente pelo servidor do MVP.

## Teste de e-mail com confirmação

Executar a partir de um ambiente de operador com as variáveis de servidor configuradas:

```sh
node scripts/radar-email-test.mjs
```

Esse comando somente cria/retorna uma **prévia persistida**, sem e-mail nem coleta. Mostrar remetente, destinatário, assunto e texto ao usuário. **Aguardar confirmação explícita antes de executar:**

```sh
node scripts/radar-email-test.mjs --send ID_DA_PREVIA
```

A prévia expira após uma hora. Confirmar novamente a mesma prévia não duplica o envio. O endpoint privado usa o bearer já existente do cron e exige `confirmed: true`; não há nova autenticação de usuários. O cron nunca envia prévias de teste sozinho.

Prévia de conteúdo do teste:

> **[TESTE MVP] Radar automotivo — validação de e-mail**
>
> Este é um teste de e-mail do MVP do Radar automotivo. Nenhuma coleta foi executada e nenhum crédito de anúncios foi consumido. Este teste não representa uma oportunidade real.

Repetir uma entrega de resumo pendente (endpoint autenticado `/api/radars/deliver`, sem coleta):

```sh
node scripts/radar-email-test.mjs --retry ID_DA_ENTREGA
```

O retry respeita os estados, três tentativas e a janela; não desbloqueia `unknown`/`failed`. Para resultado incerto, conferir a solicitação/chave no Resend antes de qualquer correção manual. Não apagar a linha nem inventar outra chave.

## Ativar e pausar

Em **Radares → Editar**, definir execuções restantes (use `1` para um teste limitado), intervalo e canal; salvar e usar **Ativar/Pausar**. O botão não repõe saldo. Configuração de e-mail não substitui o limite de consultas. Ativar o envio automático não autoriza coleta ilimitada.

Para o radar existente **MECA SP** (Mercedes-Benz C 180, SP inteiro, OLX + Webmotors), o plano atual usa uma consulta OLX/Gecko (**1 crédito**) e uma Webmotors/Reef (**2 créditos**), sem consulta de localização por cidade. Uma coleta real requer confirmação do número máximo de execuções e saldo permitido. Em 23/10, o próprio cron às 16h30 de Brasília registrou bloqueio por orçamento local nas duas fontes; nenhum limite foi aumentado nesta tarefa.

## Validação e resultados observados

- `npm test`: **321 testes passaram**, incluindo base inicial, novo/repetido, resumo único, incerteza, concorrência, pausado, limite finito, falha/timeout/429, retry estável, três tentativas, expiração, retomada sem coleta e prévia/confirmação de teste sem consumo.
- `npm run typecheck`, `npm run lint` e `npm run build`: passaram.
- Migração Postgres aplicada em `20261023194405_radar_email_delivery`; RLS e revogação de acesso público verificadas no banco. Probe transacional de envio controlado executado com `ROLLBACK`, sem chamada ao Resend. A migração SQLite equivalente é usada pelos testes.
- O cron existente foi auditado: ativo, POST autenticado, `*/30 * * * *`. Respostas históricas HTTP 200 com `processed: 0` confirmam alcance do endpoint; não são prova de envio ou coleta bem-sucedida.
- `npm run db:migrate` agora faz **somente verificação do banco**. Não chama mais `run-approved-provider-operations`. As cinco operações do lote anterior já estavam concluídas; não foram criadas operações pagas novas.
- Nenhum envio real de teste foi autorizado ou executado por esta tarefa. Nenhuma coleta real foi disparada manualmente. Não se declara o teste ponta a ponta concluído antes de confirmar o envio e observar o resultado do provedor.
