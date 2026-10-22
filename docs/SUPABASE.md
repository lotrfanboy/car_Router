# Banco do Radar no Supabase

O PostgreSQL do Supabase é a persistência de produção para veículos, buscas salvas, resultados descobertos, histórico de preços e execução do Radar. O Next.js acessa o banco somente no servidor por meio do Prisma. As tabelas da aplicação não são uma API pública de navegador.

## Conexões

- `DATABASE_URL`: conexão usada pela aplicação. Em hospedagem com IPv4, use a URL do Supavisor indicada pelo painel do Supabase. Transaction mode é adequado para o runtime; Session mode também funciona.
- `DIRECT_URL`: conexão direta ou Supavisor Session mode para inspeção e tarefas administrativas.
- Nunca versione as URLs reais: elas contêm a senha do banco.

O schema Prisma de produção está em `prisma/schema.prisma`. O schema SQLite em `prisma/sqlite` existe apenas para a suíte isolada e para validar migrações antigas.

## Migrações

As mudanças do banco ficam em `supabase/migrations`. Para um projeto novo ou para aplicar uma migração pendente:

```sh
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npm run db:migrate:apply
```

O deploy da aplicação não executa migrações automaticamente. `npm run db:migrate` é uma verificação somente leitura, mantida para compatibilidade com comandos antigos de inicialização; a aplicação falha cedo se a conexão ou as tabelas obrigatórias estiverem ausentes. Isso evita duas instâncias tentando alterar o schema ao mesmo tempo e impede que um reinício comum faça mudanças administrativas.

## Segurança

Todas as tabelas da aplicação têm RLS habilitado e não possuem policies para `anon` ou `authenticated`. Também não há grants para `anon`, `authenticated` ou `service_role`. O backend usa a conexão PostgreSQL, portanto não depende da Data API nem de uma chave Supabase no navegador.

Se o produto ganhar contas de usuário e acesso direto via `supabase-js`, o modelo precisa receber uma coluna de proprietário, policies específicas e testes de isolamento antes de qualquer grant. Não abra as tabelas atuais com uma policy genérica.

## Operação do Radar

O banco já representa:

- critérios em `SavedSearch`;
- agenda e estado em `Radar`;
- tentativas em `RadarRun`;
- deduplicação e entrega em `RadarNotice`;
- descobertas e preços em `DiscoveredListing` e `ListingPrice`;
- orçamento e exclusão mútua em `ProviderSpend` e `SearchLock`.

O próximo componente operacional é um cron autenticado que chama o executor do Radar. O envio de e-mail deve acontecer nesse executor e registrar cada tentativa em `RadarNotice`, para que reexecuções não enviem o mesmo evento duas vezes.

## Verificação antes de publicar

```sh
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
```

Depois de qualquer DDL, confira as tabelas, RLS, grants e os advisors de segurança e desempenho no Supabase. Para mudanças com dados existentes, faça backup e teste a migração em um ambiente separado antes de aplicar em produção.
