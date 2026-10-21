# Arquitetura de integrações do CarRouter

Base: commit `64e360c`, analisado em 21/10/2026. Esta proposta parte do código real e distingue o que foi implementado do que depende da primeira fonte aprovada.

## Estado existente

Next.js App Router 16, React 19, TypeScript, Zod 4, Tailwind 4, Prisma 6.19 com adaptador libSQL e SQLite local. `package-lock.json` foi preservado. Sem autenticação; execução vinculada ao loopback. O produto se apresenta como Radar Automotivo na interface.

| Componente                               | Comportamento existente                                          | Limite para integrações                                                      |
| ---------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `prisma/schema.prisma`                   | Vehicle com preço em centavos, dados do veículo e origem textual | Sem ID externo, disponibilidade, fonte de publicação ou cursor               |
| `src/lib/vehicle.ts`                     | Validação, cálculo de referência manual, filtros e ordenação     | Fabricação/ano/km/preço obrigatórios; várias fontes podem omitir esses dados |
| `src/lib/repository.ts`                  | CRUD e favorito com Prisma                                       | Antes desta branch não havia histórico                                       |
| `src/app/api/vehicles`                   | GET/POST e operações por ID; Zod e erros HTTP                    | GET carrega catálogo inteiro; não é endpoint seguro de ingestão pública      |
| `src/components/workspace.tsx`           | Busca toda a coleção e mantém estado no navegador                | Não validado para 10 mil/100 mil registros                                   |
| `src/components/catalog.tsx`             | Busca e filtros em memória                                       | Paginação de servidor precisa de projeto antes da escala                     |
| `src/app/veiculos`, favoritos e comparar | Cadastro/edição, detalhes, favoritos e comparação                | Não existe sincronização ou comunicação com fonte                            |
| `tests`                                  | Validação e API SQLite real em banco isolado                     | Fixtures não comprovam integração externa                                    |

Os fluxos existentes são implementações reais, não protótipo substituído. A documentação anterior registra 25 testes e validação de navegador em Linux. A evidência desta branch fica em `docs/evidencias-integracoes.md`; não se reutiliza execução anterior como prova de fonte externa.

## Melhoria independente implementada

Foi acrescentado `VehiclePrice` (id sequencial, veículo, centavos, instante observado e motivo) e uma relação de histórico. A migração `20261021010000_price_history` cria tabela e índice sem recriar Vehicle, apagar registros ou alterar campos existentes.

- Criação grava Vehicle e o preço inicial em escrita aninhada atômica.
- Edição lê o preço anterior e atualiza dentro de transação. Só grava evento se o preço mudar. Repetir o mesmo preço, alterar marca/modelo ou favoritar não gera evento.
- O favorito e as observações do cadastro continuam preservados pelas operações existentes.
- Registros anteriores recebem uma observação `baseline` no instante da migração. Não se inventa histórico entre cadastro e migração; não se apresenta essa data como publicação da fonte.
- Consulta disponível em `GET /api/vehicles/:id/prices`, ordenada pelo ID sequencial. Retorna 404 se o veículo não existe. Não inclui o histórico no GET da coleção, evitando aumentar o payload de todo o catálogo.
- Ao excluir um veículo, seu histórico é excluído pela chave estrangeira, acompanhando a exclusão já confirmada na interface.
- Motivos atuais: `baseline`, `created`, `edited`. São observações locais; não significam captura de preço externo ou data de alteração no portal.

A funcionalidade está na persistência/API; não foi acrescentada tela de integração ou demonstrativo. Ela já é exercitada pelos fluxos reais de cadastro/edição e pode ser consultada pela rota. Histórico de preço não equivale a monitoramento automático.

O teste de migração constrói um banco no schema anterior, inclui anúncio favorito e verifica que o conteúdo permanece igual após executar o SQL novo. O teste HTTP verifica persistência após desconectar, ausência de eventos repetidos, rejeição de preço inválido e exclusão em cascata.

## Primeiro conector: desenho proposto, não implementado

Evitar criar uma framework genérica sem conhecer o contrato de dados. A primeira fonte deve definir um adaptador pequeno, apenas no servidor, consumindo API/SDK autorizado. Fluxo: agendamento controlado → leitura de página/cursor → validação do envelope → normalização → transação de persistência → checkpoint após sucesso → métricas sem segredos.

Não chamar a própria API HTTP de cadastro para cada anúncio. Extrair a persistência necessária na biblioteca do servidor mantendo o CRUD manual. Não colocar credenciais no cliente React. Nenhum token deve aparecer em URL, log, exceção persistida, screenshot ou Git.

### Modelo proposto depois da aprovação

1. Identidade externa: chave única `(source, externalId)` em entidade de anúncio de origem, ligada a Vehicle quando houver correspondência validada. O mesmo carro em portais diferentes não deve ser fundido apenas por marca, modelo, ano e preço.
2. Proveniência: `listingUrl`, `sourcePublishedAt` quando informado, `firstSeenAt`, `lastSeenAt`, disponibilidade e versão do normalizador. Instantes de coleta/publicação são conceitos diferentes.
3. Execução: fonte, início/fim, status, totais, páginas, checkpoint, último código de falha e próxima execução. Guardar dados mínimos, sem payload bruto indiscriminado.
4. Histórico: reutilizar mecanismo transacional de preços, mas acrescentar proveniência do evento e política de conflito antes de escrever dados externos em registros manuais.

Não há essas entidades na implementação atual. O schema definitivo depende da fonte e de como o usuário quer conciliar cadastro manual e atualização automática. Em particular, preço remoto não deve sobrescrever preço editado pelo usuário sem política explícita.

### Normalização e dados ausentes

Guardar preço BRL em centavos inteiros; confirmar unidade e moeda em cada contrato. Não converter USD para BRL como se fosse o valor anunciado. Não usar zero para km ou ano desconhecido. Não duplicar ano-modelo como fabricação por conveniência: hoje ambos são obrigatórios e o modelo precisará admitir desconhecido ou manter o registro em revisão antes de criar Vehicle. Isso precisa preservar formulários, cálculos, filtros e comparação.

Mapear combustível, transmissão e UF por regras explícitas. Um campo desconhecido não deve causar perda de toda a página: isolar item inválido, registrar código de validação e manter checkpoint conforme política de reprocessamento. Remoção exige status explícito ou reconciliação de inventário completo; ausência em busca paginada não é comprovação de venda.

### Falhas e limites

Timeout por requisição e cancelamento de execução; backoff com jitter para falhas transitórias, tentativas limitadas; respeitar `Retry-After`, quota por chave e eventualmente IP. 401/403 suspendem a fonte para revisão, não disparam rotação de conta/IP ou tentativas de contorno. Erro contratual ou mudança de schema deve ser visível e impedir corrupção silenciosa.

Uma página só avança o cursor após persistir os itens aceitos e registrar os rejeitados. Checkpoint é por fonte/consulta, nunca um offset global reutilizado em filtros distintos. Necessário testar replay, falha no meio da página e queda após commit. Agendador precisa impedir execuções simultâneas da mesma consulta.

### Escala e implantação

MVP: um worker por fonte com concorrência pequena e SQLite persistente pode ser suficiente; isso é hipótese, não benchmark. Antes de 10 mil, medir consulta, memória e duração do ciclo. Para catálogo grande, adicionar paginação/filtros no servidor e atualizar o Workspace sem remover capacidades existentes. Para múltiplos workers/clientes, avaliar PostgreSQL e fila conforme carga medida.

SaaS requer autenticação, autorização por usuário/organização, isolamento de dados, HTTPS, controles de origem e proteção de credenciais. O estado atual não deve ser exposto como serviço público. Nenhuma mudança de banco produtivo ou deploy faz parte desta entrega.

## Contrato de validação de integração

Testes de normalização com fixtures identificadas como teste, integração de persistência em banco temporário e testes de falha/replay. Separadamente, prova externa autorizada com fonte/versão, status, contagens e comparação manual de amostra. Nunca reportar mocks como conectividade real.

Antes de aplicar a migração em um banco de uso: parar o processo, copiar o SQLite e seus arquivos auxiliares conforme README e usar `npm run setup`. A migração é aditiva; foi aplicada apenas em bancos temporários nesta investigação. Não executar reset. Como preservação de dados importa, o teste de upgrade permanece versionado.
