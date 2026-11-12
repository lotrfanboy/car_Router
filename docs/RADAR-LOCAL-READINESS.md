# Radar local: diagnóstico e ativação limitada

Verificado em 03/11/2026. Este documento descreve uma proposta; nenhuma rotina foi ativada.

## Por que os três radares estão pausados

Cada radar tinha uma única tentativa autorizada. As três consultas foram concluídas com sucesso e a cota chegou a zero; o código pausou os radares, removendo a próxima execução. `RADAR_SCHEDULER_ENABLED=false` e `RADAR_EMAIL_ENABLED=false` foram preservados. O último heartbeat expirou e não foi encontrada tarefa Windows relacionada ao CarRouter. O cron definido nas migrações Supabase não agenda o SQLite do computador nem torna `127.0.0.1` acessível pela nuvem.

As credenciais estão presentes. Leituras autenticadas, sem coleta ou envio, retornaram HTTP200: Gecko, plano `free`, saldo44, página OLX1 crédito; Resend, última mensagem já registrada com evento `delivered`. Há duas entregas de teste confirmadas e nenhum resumo de radar pendente. Esses testes de envio não são apresentados como alertas automáticos de novos anúncios.

## Correções e validação

- `scripts/radar-tick.mjs` agora lê o `.env` comum e complementa com `.env.radar.local`, sem copiar credenciais. Valida endereço e segredo antes de solicitar um ciclo; não repete automaticamente uma chamada incerta.
- `node scripts/radar-tick.mjs --check` apenas lê configuração: zero HTTP, coleta ou envio. Retorna código1 se o agendamento estiver desligado; isso é o diagnóstico esperado neste ambiente. Executar o comando sem `--check` é uma ação diferente e pode coletar/enviar.
- O diagnóstico distingue flag desligada de segredo ausente. O segredo existente passou na validação de comprimento; não precisa ser trocado para resolver a pausa atual.
- Novos resumos apontam para `/radares/[id]`. Os cartões conservam âncoras para links antigos.
- O backend aceita tetos cumulativos opcionais de créditos agendados por fornecedor e data UTC de encerramento. Uma reserva acima do teto é recusada dentro da transação, antes da chamada paga; manual e agendado compartilham a contagem histórica de forma conservadora.

O teste ponta a ponta usa o comando real → HTTP local autenticado → três radares → consultas simuladas → SQLite descartável → eventos → fila → resumos simulados → confirmação simulada → pausa ao fim da cota. Verifica ausência de e-mail na base inicial, exclusão de incertos/incompatíveis do resumo, quedas somente no aplicativo, idempotência e ausência de coleta após a pausa. Nenhuma mensagem real ou extração paga foi usada nesse ensaio.

Resultado:412 testes em36 arquivos passaram com dois workers; build/TypeScript passaram. A execução ampla inicial em paralelo com build atingiu timeout na preparação de bancos; o ensaio separado passou. O código foi validado em cópia sem credenciais reais e com rede externa bloqueada.

## Proposta concreta para autorização

Piloto dos três radares existentes, somente OLX e abrangência estadual atual:

- Uma consulta por radar a cada24h; a plataforma verifica tarefas vencidas a cada30min. Não há detecção instantânea.
- Três tentativas por radar, ao longo de até72h, começando somente após aprovação: até9 páginas/créditos Gecko adicionais. Falhas também consomem tentativa; não há repetição automática da coleta incerta.
- Somente o Gmail de Carlos já verificado em `RADAR_EMAIL_TO`; sem CC/BCC ou terceiros. Até um resumo por radar/consulta quando houver novos anúncios confirmados, no máximo9 resumos distintos. A primeira base já existe; ausência de novidades gera zero e-mail. Quedas permanecem no aplicativo.
- Sem compra, recarga, contratação ou upgrade. Usar apenas créditos gratuitos existentes. Antes da ativação, conferir novamente saldo/custo e a cota/plano Resend disponível; a leitura de e-mail não comprova o plano nem o uso mensal da conta. A [tabela pública Resend](https://resend.com/pricing) oferece cota Free, mas não foi consultado o faturamento privado da conta.

Na verificação havia4 créditos Gecko e2 Reef reservados no ledger local, que não representa todo o uso histórico da conta. Para o piloto, calcular os tetos novamente no instante da ativação:

```text
RADAR_SCHEDULED_GECKO_TOTAL_CREDIT_CAP = total Gecko local naquele instante + 9
RADAR_SCHEDULED_REEF_TOTAL_CREDIT_CAP = total Reef local naquele instante
RADAR_SCHEDULED_UNTIL = instante de aprovação +72h, ISO UTC
```

Com os totais observados, os exemplos seriam13 e2. Não copiar esses números sem reconferir. O teto Reef impede gasto adicional nessa fonte se os critérios forem alterados. Consultas manuais podem encerrar o saldo agendado antes; não ampliam sua autorização. Os limites diários/globais anteriores continuam valendo. Nenhuma dessas variáveis foi configurada nesta manutenção.

Após aprovação explícita: configurar somente flags/limites não secretos no `.env` existente, atribuir três tentativas aos três radares, ativá-los e registrar uma tarefa Windows com início/fim limitados e diretório de trabalho correto. A tarefa lê os segredos existentes em tempo de execução; não os copia para argumentos ou outro armazenamento. O prazo e os tetos devem ser verificados antes da primeira chamada. Não criar tarefa permanente.

O aplicativo precisa estar rodando e o computador disponível. Links `127.0.0.1` do resumo abrem o detalhe nesse computador; links originais dos anúncios são públicos. Não foi implantado acesso remoto.

## Limites restantes

O motor está validado para os anúncios com identidade confirmada. Descrições OLX sem crosswalk verificável continuam incertas e não entram nos e-mails; cobertura universal não está concluída. A amostra por página é parcial. Ausência numa página não prova remoção. Anúncios semelhantes entre fontes não foram fundidos.

Se um resumo terminar com falha/resultado incerto, seus dados permanecem registrados. Há reenvio operacional separado da coleta; envio incerto requer conferência no provedor, sem POST cego. Uma pausa não deve ser mascarada como atividade. Não foi prometida entrega de novidades que ainda não apareceram numa consulta real.

O passo pendente é a aprovação explícita do piloto (cadência, nove créditos adicionais, destinatário único e prazo) e a confirmação da cota gratuita de e-mail. O limite anterior de três créditos já foi consumido e não autoriza a ativação acima.
