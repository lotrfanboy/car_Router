# Radar Automotivo

**Busca — 22/10/2026:** ano independente, cidades opcionais e critérios/descartes explícitos. Marca, modelo e versão são lidos da revisão ativa do catálogo persistido no Supabase; versão continua opcional e modelos sem versão aceita permanecem pesquisáveis. Veja o [levantamento Reef/Carpedia, custos e restrições de adoção](docs/search-catalog-review.md) e a [validação desta etapa](docs/VALIDACAO-BUSCA-GENERICA-2026-10-22.md).

O fluxo principal agora é **Buscar carros → conferir a média dos semelhantes → salvar ou criar Radar**. Veja [uso, metodologia, preservação dos dados e configuração do Radar](docs/FOCO-BUSCA-RADAR.md). O monitoramento usa o agendador persistido no Supabase; sem um canal de e-mail configurado, a interface indica configuração pendente. A aplicação publicada está em [radar-automotivo-preview.onrender.com](https://radar-automotivo-preview.onrender.com).

Aplicação pessoal para buscar carros em OLX/Gecko e Webmotors/Reef, comparar preços com anúncios semelhantes e salvar candidatos. O catálogo manual e seus históricos continuam disponíveis. As fontes precisam ser configuradas no servidor. A persistência de produção usa PostgreSQL no Supabase, sem consultas externas ou dados de demonstração na inicialização. [Guia do MVP integrado](docs/mvp-buscas-integradas.md).

## Executar no Windows

Instale **Node.js 24 LTS** e Git. Se recebeu um ZIP, extraia-o, abra o PowerShell na pasta extraída e comece em `Copy-Item` abaixo. As buscas integradas foram incorporadas à `main`. A evolução visual e analítica descrita abaixo preserva os conectores existentes.

No PowerShell:

```powershell
git clone https://github.com/lotrfanboy/car_Router.git
cd car_Router
git switch main
Copy-Item .env.example .env
# Preencha DATABASE_URL e DIRECT_URL no .env com as conexões do Supabase
npm ci
npm run setup
npm run build
npm start
```

Abra **http://127.0.0.1:3000**. Para parar, pressione Ctrl+C. Se o PowerShell bloquear o script `npm.ps1`, execute os mesmos comandos com `npm.cmd`.

Depois da primeira instalação, basta executar `npm start`. Anúncios, buscas salvas, históricos e configuração do Radar ficam no projeto Supabase. Nenhuma credencial ou dado de usuário é versionado.

Para desenvolvimento:

```powershell
npm run dev
```

Em Linux/macOS, substitua `Copy-Item .env.example .env` por `cp .env.example .env`. O restante é igual. Os comandos de desenvolvimento e produção escutam apenas em **127.0.0.1**, sem publicação na rede.

## Funcionalidades

- Visão geral com quantidade de anúncios, mediana, oportunidades auditáveis, reduções registradas e contexto da amostra.
- Cadastro, edição, exclusão com confirmação e página própria de detalhes.
- Marca, modelo, versão, fabricação/modelo, quilometragem, preço, referência, cidade/UF, combustível, câmbio, origem, links, imagem por URL e observações.
- Radar em cards, lista compacta e tabela configurável; busca sem distinção de acentos e maiúsculas.
- Filtros combináveis: marca, modelo, intervalo de ano/preço, quilometragem máxima, cidade, estado, origem e favoritos.
- Ordenação por preço crescente/decrescente, menor quilometragem, maior ano e cadastro recente.
- Favoritos persistentes; seleção de até quatro veículos para comparação, com destaque das diferenças.
- Comparação de preço com referência manual, em reais e percentual. Sem consulta à FIPE ou nota arbitrária.
- Área de trabalho clara com navegação grafite, navegação responsiva, estados vazios, skeletons, foco acessível em azul, retorno visual das ações e fallback para imagens ausentes ou quebradas.

Valores monetários são armazenados em **centavos inteiros**. A diferença é `preço - referência`; o percentual é `diferença / referência × 100`. A referência deve ser maior que zero, quando preenchida.

## Arquitetura

- Next.js 16 (App Router), React 19, TypeScript e Tailwind CSS 4.
- Prisma 6.19 com `@prisma/adapter-pg` e PostgreSQL 17 no Supabase. SQLite/libSQL permanece somente nos testes isolados e nos roteiros locais legados.
- Validação compartilhada com Zod; ícones Lucide; Vitest.
- `src/lib/vehicle.ts`: validação, filtros, ordenações e cálculo.
- `src/lib/repository.ts`: persistência com Prisma.
- `src/app/api/vehicles`: API JSON e tratamento de erros.
- `src/components`: componentes, formulário e estado da interface.
- `prisma/schema.prisma`: modelo PostgreSQL usado pela aplicação.
- `supabase/migrations`: migrações de produção, com RLS e permissões versionadas.
- `prisma/sqlite`: modelo e migrações preservados para testes isolados.

Vehicle reúne os dados do anúncio neste MVP; VehiclePrice mantém as observações locais de preço. IDs, campos obrigatórios e índices estão no banco; limites, URLs HTTP/HTTPS, enumerações e coerência de anos são validados no servidor. Futuras integrações poderão chamar a camada de persistência/validação sem depender da interface.

O cliente de produção usa o adaptador PostgreSQL do Prisma. As migrações são executadas pelo Supabase CLI e não durante a inicialização do servidor. Webpack é usado explicitamente para evitar a dependência de sockets internos do Turbopack neste ambiente.

Use no `.env` a conexão de runtime indicada pelo Supabase para o ambiente hospedado e uma conexão direta ou em Session mode para tarefas administrativas:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/postgres"
```

`npm run setup` gera os clientes Prisma. `npm run db:migrate` apenas verifica a conexão e o schema, sem executar DDL, portanto pode permanecer em comandos antigos de inicialização. Para aplicar migrações, vincule o Supabase CLI ao projeto correto e execute `npm run db:migrate:apply` em uma etapa administrativa controlada. Não execute comandos de reset em um banco com dados importantes. O Supabase mantém backups conforme o plano do projeto; exportações adicionais podem ser feitas com `pg_dump` usando a conexão administrativa.

O catálogo veicular fica no PostgreSQL em revisões imutáveis. Informe a pasta
descompactada do pacote por `CATALOG_PACKAGE_DIR` e valide antes de carregar:

```sh
CATALOG_PACKAGE_DIR=/caminho/catalogo npm run catalog:dry-run
CATALOG_PACKAGE_DIR=/caminho/catalogo npm run catalog:rollback-probe
CATALOG_PACKAGE_DIR=/caminho/catalogo npm run catalog:import
```

A importação valida a cadeia marca–modelo–versão, evidências, IDs anteriores e
correspondências por origem. A revisão ativa só muda no fim da transação; uma
falha conserva a revisão válida anterior. Reexecutar o comando valida a revisão
já ativa sem duplicar registros. O suplemento do fabricante e as filas de
revisão não são promovidos automaticamente.

## Testar

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Os testes Vitest usam um SQLite temporário e removem-no ao concluir. Não modificam o banco de uso diário.

O roteiro opcional de navegador `scripts/browser_check.py` usa Python, Playwright e Chromium instalado. Ele inicia o build de produção em uma porta livre de `127.0.0.1` com **outro banco temporário**, testa os fluxos e salva screenshots em `test-results/screenshots` (ou `RADAR_SCREENSHOT_DIR`). Execute após o build:

```sh
python scripts/browser_check.py
```

O caminho padrão do Chromium nesse script é `/usr/bin/chromium`; em outro sistema, informe a variável `CHROMIUM_PATH`. Python/Playwright não são necessários para usar o produto ou rodar os testes Vitest.

Veja os [resultados desta transformação](docs/VALIDACAO-TRANSFORMACAO.md), a [validação original](docs/VALIDACAO.md) e os [screenshots](docs/screenshots). Os registros que aparecem nas imagens são **fixtures exclusivas dos testes**, nunca um seed do produto.

## Roteiro de aceitação manual

1. Abra o painel vazio e cadastre um veículo com preço de R$ 90.000 e referência de R$ 100.000.
2. Confira a indicação de 10% abaixo (R$ 10.000) nos detalhes.
3. Favorite, recarregue a página, pare e reinicie a aplicação; confira a persistência.
4. Cadastre outros veículos, combine filtros e alterne entre cards e tabela.
5. Selecione até quatro anúncios e abra o comparador.
6. Edite um anúncio, salve e confira os valores atualizados.
7. Cancele uma exclusão; depois confirme-a e confira a remoção do catálogo e da seleção.

## Limitações reais e segurança local

- **Não exponha publicamente sem autenticação, autorização, HTTPS e medidas de segurança adicionais.** Não há autenticação; a checagem de origem nas mutações não substitui controle de acesso.
- O catálogo é carregado integralmente e filtrado no navegador; o radar pagina 12 anúncios por vez. Filtragem/paginação no servidor continuam necessárias para volumes grandes.
- Seleção para comparar é uma preferência da aba; anúncios e favoritos ficam no PostgreSQL do Supabase.
- Imagens são URLs externas carregadas pelo navegador, sem upload, cache ou garantia de disponibilidade; não há busca de imagens pelo servidor.
- Não há múltiplos usuários. Radares habilitados são verificados pelo scheduler do Supabase a cada 30 minutos e respeitam sua frequência diária ou semanal; avisos por e-mail dependem das variáveis do Resend configuradas no servidor.
- Instalação inicial requer acesso ao npm; depois de instalado, o núcleo funciona sem serviços externos.
- A execução foi validada em Linux na nuvem; as instruções Windows são fornecidas, mas não houve máquina Windows disponível para verificação.

## Pesquisa e base de monitoramento (21/10/2026)

A pesquisa, já integrada à `main`, acrescentou histórico de preços local, registrado nas criações e nas edições que alteram o preço. Favoritar ou repetir o mesmo valor não cria evento. Anúncios de um banco anterior recebem apenas um snapshot do valor atual no momento da nova migração, identificado como `baseline`; não há reconstrução de preços passados.

Depois de atualizar o código, use `npm run setup` para gerar os clientes. Aplique novas migrações com `npm run db:migrate:apply` em uma etapa controlada e faça backup antes de alterações estruturais. O histórico pode ser consultado em `GET /api/vehicles/:id/prices` e aparece nos detalhes do veículo; novas observações também podem ser coletadas por radares habilitados.

Os testes agora rodam por `scripts/test.mjs`, que cria um diretório temporário próprio e o remove depois que os processos de teste terminam. Isso evita bloqueio dos arquivos SQLite no Windows. Use `npm test` em vez de chamar Vitest diretamente.

Documentos desta investigação:

- [Pesquisa e matriz de decisão](docs/pesquisa-integracoes.md)
- [Custos e cenários](docs/comparativo-custos.md)
- [Arquitetura alinhada ao código](docs/arquitetura-integracoes.md)
- [Plano e aprovações pendentes](docs/plano-implementacao.md)
- [Evidências desta etapa](docs/evidencias-integracoes.md)

Os documentos iniciais registram etapas históricas. As provas posteriores de fonte e a implementação pessoal autorizada estão no [guia do MVP](docs/mvp-buscas-integradas.md). Uso comercial e operação contínua ainda dependem de qualificação.

## Buscas nos portais — MVP pessoal

A área `/buscar` permite salvar critérios e consultar manualmente OLX via Gecko e Webmotors via Reef, com estado por fonte, conferência local de filtros e histórico dos preços observados. Configuração, limites gratuitos e restrições: [guia do MVP](docs/mvp-buscas-integradas.md). Não há consultas automáticas ao abrir a página.

## Evolução visual e analítica (21/10/2026)

Esta implementação parte da `main` em `5626b17`. O [relatório de entrega](docs/ENTREGA.md) reúne funcionalidades, arquitetura, limitações e próximos passos. [Auditoria e plano](docs/TRANSFORMACAO.md), [metodologia](docs/METODOLOGIA.md) e [validação da transformação](docs/VALIDACAO-TRANSFORMACAO.md) registram a base encontrada, decisões e resultados.

- `/`: visão geral editorial, medianas, reduções reais, destaques e cobertura do catálogo.
- `/veiculos`: filtros compartilháveis pela URL, chips, ordenações, paginação de 12 registros, três visualizações e colunas configuráveis. Filtros salvos no Supabase podem ser reabertos sem consultar fornecedores.
- `/veiculos/:id`: imagem cadastrada ampliável, referência **manual**, comparáveis estritos, histórico completo preservado e simulação ajustável de compra/custos/venda/margem. `updatedAt` não determina recência financeira.
- `/mercado`: filtros, distribuição de preços, dispersão preço × quilometragem, tabelas acessíveis, agrupamentos por modelo e CSV. A amostra é o catálogo cadastrado, não todas as descobertas dos portais nem o mercado nacional.
- `/comparar`: até quatro veículos, filtro para diferenças, referências e histórico recente.
- `/favoritos`: veículos favoritos, buscas salvas e últimas reduções registradas nos últimos 30 dias.
- `/configuracoes`: estado não secreto dos conectores, limites de uso, dados locais e metodologia.
- `/buscar`: conectores e fluxos existentes mantidos; nenhum fornecedor é consultado automaticamente ao navegar.

As migrações SQLite históricas `20261021040000_catalog_searches` e `20261021050000_vehicle_seller_type` foram preservadas para validar upgrades legados. No PostgreSQL, o estado consolidado está em `supabase/migrations`. As APIs de veículos retornam os dois últimos registros de preço e `priceRecordedAt`; o endpoint `/prices` continua oferecendo o histórico completo.

**Não há integração FIPE nesta versão.** O valor de referência do cadastro não possui código/mês/combustível/versão verificados. Uma fonte licenciada e um fluxo de correspondência são necessários antes de chamar esse dado de FIPE. Descobertas de OLX/Webmotors não são promovidas automaticamente a veículos normalizados: faltam atributos para análises equivalentes e confirmação de direitos das fotografias.

As classificações usam critérios determinísticos e configuráveis em `OPPORTUNITY_RULES`, sem pontuação arbitrária. Exigem ao menos cinco comparáveis recentes e equivalentes. Reduções, suficiência amostral e limitações aparecem nos detalhes; condições do veículo e lucro de revenda nunca são garantidos. Os indicadores de redução usam a última mudança registrada, e não inventam séries temporais agregadas.

Credenciais do Supabase e chaves de conectores não são versionadas. As imagens de validação com veículos usam exclusivamente registros temporários de teste; a aplicação inicia vazia em um banco novo.

## Preview hospedado para avaliação

O `render.yaml` executa este projeto Next.js e solicita `DATABASE_URL` como segredo. O banco é o Supabase compartilhado pelo ambiente e as migrações devem ser aplicadas antes do deploy; a inicialização do servidor não altera o schema. As credenciais dos conectores continuam opcionais e nenhuma fonte é consultada automaticamente.

[Criar preview no Render](https://render.com/deploy?repo=https://github.com/lotrfanboy/car_Router)
