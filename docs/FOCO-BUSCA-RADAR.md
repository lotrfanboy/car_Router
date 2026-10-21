# Buscar carros, comparar preços e acompanhar

Entrega local sobre `main` em `c275c50`, branch `codex/foco-busca-media-radar`. Sem push, merge, publicação ou alteração de banco de uso. Não reutilizar números de validações anteriores como evidência desta entrega.

## Trabalho aproveitado

Next.js 16, React, TypeScript, Prisma/libSQL/SQLite, cadastro e validação de veículos, rotas antigas, favoritos, comparação de veículos e históricos foram mantidos. Os conectores OLX/Gecko e Webmotors/Reef, verificação de custo Gecko, limite local de 10 créditos/dia por fornecedor e teto de avaliação (20 Gecko/40 Reef), resolução de cidade, histórico de descoberta e proteção de concorrência foram preservados.

O trabalho local descrito no chat “Unificar busca e oportunidades” não estava neste ambiente nem no GitHub. Seu checkout não foi alterado. Reaproveitamos a abordagem de preservar URL/fonte/foto e deduplicar cliques; o novo fluxo salva diretamente `DiscoveredListing`, sem exigir inventar os campos obrigatórios de `Vehicle`. O catálogo manual continua acessível e seus favoritos aparecem também em Salvos. A análise legada por mediana fica nas ferramentas secundárias, identificada como análise do catálogo.

## Uso

1. Abra `/buscar` (também é a página inicial). Informe marca, modelo, cidade/UF, anos e km; versão e orçamento são opcionais. As sugestões de marca/modelo vêm do catálogo existente e aceitam entrada manual. Não existe catálogo externo de versões configurado.
2. Clique em **Buscar agora**. Uma página por fonte; erros e fontes desconectadas são diferentes de sucesso sem candidatos. O orçamento filtra apenas candidatos. Não são feitas duas buscas pagas separadas: a coleta ampliada abastece candidatos e referência.
3. Os anúncios com comparação válida vêm primeiro pelo percentual abaixo da média. Também é possível ordenar por preço ou pela data em que foram observados (a fonte não garante data de publicação).
4. **Conferir semelhantes** abre `/anuncios/[source]/[id]`, com os preços, links, período, critérios e limitações. **Salvar** funciona mesmo com dados incompletos, preservando as informações fornecidas. `/salvos` mantém esses anúncios e os favoritos anteriores.
5. Use **Criar alerta desta busca** para abrir `/radares`, nomear o Radar, definir o percentual e escolher execução diária ou semanal. Pausar, editar e excluir não apaga a busca nem anúncios/preços.

## Referência de preços

Implementação pura: `src/lib/listing-comparison.ts`. Universo: observações reais dos conectores em `DiscoveredListing`, sem depender do catálogo pessoal. São lidas até 5.000 observações mais recentes; a análise nunca representa todo o mercado. A consulta atual e observações de até 7 dias podem ser usadas. A data de consulta é sempre mostrada; favoritar não renova recência. Resultados e detalhes recalculam a referência ao carregar; o Radar usa a mesma rotina.

- Mesmo modelo, marca e versão normalizados. Versão ausente bloqueia a comparação; um sufixo inferido do campo de modelo OLX é identificado como **inferido**, nunca confirmado por catálogo. Webmotors usa o campo explícito de versão quando disponível. Não se inventam atributos não retornados.
- Até um ano de diferença no ano-modelo; km até `max(20.000, km do candidato × 25%)`. Ano e km ausentes bloqueiam comparação. Mesma cidade se ela tem pelo menos cinco pares; caso contrário, amplia para a mesma UF, informando a ampliação.
- Motorização, combustível e câmbio conflitantes são excluídos quando informados em ambos os anúncios. Ausências são limitações explícitas.
- Excluir o próprio anúncio, mesmo ID/fonte e mesma URL sem parâmetros de rastreamento. Conservar a observação mais recente. Possíveis duplicatas entre portais (mesmos atributos completos, preço, km e cidade) são excluídas da referência e contabilizadas; não são fundidas nem apagadas.
- Preços em centavos inteiros entre R$ 5.000 e R$ 20 milhões; rejeitar indícios explícitos de entrada, parcela, peças, sucata, desmonte ou sinistro no título. Esses limites são conservadores para veículos completos e não comprovam condição.
- Com ao menos cinco pares, excluir preços fora de `[Q1 − 1,5 × IQR, Q3 + 1,5 × IQR]`, com quantis interpolados. Contabilizar exclusões. Exigir cinco pares **após** o filtro. Dispersão `IQR / mediana > 0,30` ou candidato abaixo de metade da mediana impedem a conclusão até conferir a oferta.
- Métrica principal: **média aritmética**. Diferença = média − preço; percentual = diferença / média × 100. Manter precisão no cálculo e arredondar só para exibir. “Acima”/“abaixo” evita sinal ambíguo. A mediana é apenas um critério auxiliar de distorção.

Ano-modelo da consulta de referência é ampliado em ±1. Orçamento, km máximo e restrição a particular não cortam os comparáveis; os filtros originais continuam aplicados aos candidatos. URLs OLX antigas são preservadas, removendo apenas filtros de preço conhecidos ao consultar referências. Fontes ainda podem retornar atributos ausentes, páginas limitadas e versões não comparáveis: nesses casos a interface não inventa média.

## Consumo e concorrência

Cliques simultâneos são bloqueados na interface e existe trava compartilhada no SQLite, com prazo de dez minutos e liberação condicionada ao proprietário temporal. Critérios equivalentes reaproveitam buscas existentes, incluindo registros legados sem chave. Uma coleta equivalente pode ser reutilizada por 60 segundos mesmo que o orçamento mude; respostas reutilizadas conservam a data original de observação e não cobram créditos. Não há paginação automática ou retry silencioso de extrações.

## Radar e aviso

`POST /api/radars/tick` executa no servidor com Bearer `RADAR_CRON_SECRET` (mínimo de 32 caracteres), separado do navegador. `scripts/radar-tick.mjs` é o cliente para um cron externo. Use a cada **30 minutos**; cada Radar só consulta quando vence a sua frequência de 24 ou 168 horas. Cada tick processa até três radares. A trava do scheduler dura 30 minutos; o processamento por Radar reserva a próxima execução antes da consulta e registra execução/falha.

O serviço só mostra **Ativo** quando existem fonte configurada, configuração completa do agendador/canal e um heartbeat real do scheduler nos últimos 60 minutos. Sem isso, mostra **Configuração pendente**; pausados não consultam. O mesmo `executeSearch` e o mesmo motor de média são usados na busca manual e no Radar.

Não havia canal de aviso no projeto. Foi preparado um adaptador opcional de **e-mail via Resend**, ainda não conectado nem usado para envio real. WhatsApp não foi integrado. Configuração em `.env.radar.example`; localmente copie para `.env.radar.local`, ignorado pelo Git. Na hospedagem use as variáveis do serviço. Não cria conta, plano ou cobrança automaticamente.

O e-mail contém carro, preço, média, percentual, localização e link do detalhe. Só registra envio aceito após resposta com ID do provedor; isso não comprova entrega na caixa postal. Em timeout/erro, o estado é não confirmado, sem reenvio automático. Chave idempotente por Radar/anúncio/preço e registro antes do envio previnem repetição. Uma queda de ao menos 1% que continue/comece a satisfazer o limite pode gerar novo aviso. Até dez avisos por Radar/execução limitam duração; demais correspondências continuam elegíveis para a próxima execução.

Dependências da hospedagem: processo Next persistente, **SQLite em volume persistente**, cron externo autorizado e conta/canal de e-mail. O `render.yaml` existente é um preview gratuito com SQLite em `/tmp`, sem cron e sem credenciais; foi preservado. Ele não é uma base adequada para monitoramento durável. Não criamos nem publicamos serviços. Proteger o app com o controle de acesso existente no ambiente antes de hospedar; o projeto continua pessoal, sem autenticação multiusuário.

## Dados, recuperação e credenciais

A migração `20261021060000_search_focus` apenas acrescenta campos/tabelas/índices. Não apaga, redefine IDs ou recria tabelas antigas. `savedAt` marca descobertas salvas; `queryKey` é inicialmente nulo para registros antigos. Históricos, favoritos, buscas, locais e gastos permanecem intactos. Migrações foram aplicadas somente em bancos temporários de teste.

Antes de aplicar em um banco de uso:

1. Pare escritas e identifique o `DATABASE_URL` efetivo. Não confunda preview `/tmp` com produção.
2. Para SQLite local: `python scripts/backup-sqlite.py /caminho/banco.db /caminho/backup-novo.db`. O backup consistente inclui dados confirmados no WAL, valida integridade e recusa sobrescrever o destino. Armazene fora do diretório público.
3. Gere o client e aplique `npm run db:migrate` no ambiente correto, depois valide os registros. Nunca use `reset`.
4. Para recuperar: pare aplicação e agendador, preserve o arquivo pós-migração para diagnóstico e restaure o backup junto da versão anterior do código. Evite arquivos WAL antigos ao restaurar; use um novo caminho de banco e atualize `DATABASE_URL` no servidor de forma controlada.

As chaves fornecidas nesta conversa foram guardadas somente em `.env.gecko.local` e `.env.reef.local`, modo 0600, ignoradas pelo Git. Não aparecem nesta documentação, no navegador nem em logs. O carregador prioriza variáveis do processo; arquivos locais são fallback. O opt-in `REEF_FREE_TRIAL` continua falso/ausente até confirmar o saldo promocional, preservando o contrato existente. Não alteramos a configuração de produção.

## Validação desta entrega

Ver `test-results/focus/` para capturas identificadas como TESTE ISOLADO. Fixtures só existem nos testes e bancos temporários, nunca no produto ou em banco do usuário. A suíte cobre cálculos, deduplicação, cache, estados de fontes, Radar, persistência e migração. O roteiro `scripts/browser_focus.py` valida desktop/mobile, salvos, explicação, Radar e falha sem chamadas aos fornecedores. Resultado final dos comandos é informado na entrega.

A consulta real continua dependente da política de rede efetivamente aplicada ao executor. As tentativas de leitura de saldo foram bloqueadas pelo proxy com HTTP 403 antes de autenticar/extrair; não houve consumo de créditos. A configuração publicada indicada pelo usuário ainda não apareceu na lista de domínios adicionais deste runtime. Não contornamos o proxy.

### Resultado verificado em 21/10/2026

- `npm test`: 112 testes em 9 arquivos passaram, com fixtures e bancos temporários.
- `npm run lint`: aprovado sem erros ou avisos de lint.
- TypeScript: aprovado pelo typecheck e pelo build.
- Build otimizado Next.js: aprovado.
- `python scripts/browser_focus.py`: desktop 1440px e mobile 390px, navegação por teclado, explicação dos seis comparáveis de teste, persistência de salvos, Radar criar/pausar/editar/cancelar exclusão, busca indisponível mantendo o histórico e nenhuma exceção JavaScript.
- Backup: validado com banco temporário em WAL, conteúdo preservado, integridade verificada e sobrescrita recusada.
- Credenciais: arquivos locais modo 0600, ignorados; varredura do código preparado e bundle do navegador sem as chaves fornecidas.
- Integrações ao vivo: **não validadas**, proxy HTTP 403. Nenhuma extração, mensagem real, migração em banco de uso ou publicação.

A política retornada pelo serviço para este runtime estava `enforced`, revisão 6, mas `allowed_hosts: []` e nenhum domínio Gecko/Reef em `effective_allowed_hosts`. A versão da configuração vinculada permaneceu `cecfgver_6ad8091d06e0819e88b00f2f06b63d34`, a mesma do início da execução. O arquivo local de política também não tinha os domínios. O usuário informou tê-los publicado; os diagnósticos disponíveis não explicaram por que a publicação não foi aplicada a este chat. Não há ferramenta de alteração desse vínculo disponível nesta sessão.
