# Transformação do produto — auditoria de 21/10/2026

## Base correta e preservação
Esta etapa parte da `main` no commit **5626b17**, que incorpora o MVP e os conectores pesquisados no PR #2. O checkout inicialmente disponibilizado continha apenas README; aquela preparação foi pausada e arquivada fora deste repositório. O diagnóstico válido é o presente documento e `AUDIT-BACKEND.md`.

## Auditoria técnica e visual
- **A — Implementado e coberto por testes existentes:** Next.js 16 / React 19 / TypeScript, Prisma 6.19 + SQLite via libSQL, validação Zod, CRUD de veículos, favoritos persistentes, busca textual, filtros combináveis, comparação de até três veículos, preço versus referência manual, histórico de preço no banco, navegação responsiva e estados de erro/carregamento. Conectores OLX/Gecko e Webmotors/Reef implementados, com testes simulados, limites gratuitos, trava, cooldown e observações persistidas; funcionamento ao vivo depende de configuração/serviço (não reconfirmado nesta execução).
- **B — Parcial:** radar sem URL compartilhável/paginação/lista compacta; histórico manual disponível na API sem tela; fotos por uma URL externa sem atribuição/licença estruturada; comparação sem cálculo de cenário; métricas agregadas simples sem amostra/tempo explícitos; fotos/fontes externas dependentes de disponibilidade.
- **C — Interface sem implementação:** não foi identificado botão deliberadamente fictício na base examinada.
- **D — Ausente:** FIPE identificada/licenciada, comparáveis qualificados, motor de oportunidades, simulador financeiro, exploração macro, filtros salvos do catálogo e monitoramento interno de alterações dos favoritos. Autenticação/multiusuário e cobrança não existem e não fazem parte desta etapa local.
- **E — Inadequado ao objetivo premium:** tema branco/verde uniforme, cabeçalho pouco editorial, grandes áreas vazias, métricas sem recorte explícito; ausência de densidade e hierarquia próprias de análise financeira. A estrutura e os componentes são reutilizáveis.

### Semântica que não pode mudar
`referenceCents` é **referência manual**, não FIPE. Valores monetários são centavos inteiros. `createdAt` é cadastro local; `updatedAt` também muda ao favoritar, portanto não prova observação de preço. Descobertas dos portais não têm versão/combustível/fotos suficientes para comparáveis estritos. Não inferir venda, liquidez ou lucro. Não chamar fornecedores ao carregar páginas.

## Linha de base
Instalação reproduzida com `npm ci` (461 pacotes, lockfile preservado). Cache direcionado a `/tmp` porque o diretório de cache padrão não é gravável. Testes/build da base serão registrados em `VALIDACAO-TRANSFORMACAO.md`; resultados anteriores no README não substituem verificação desta execução. Banco de verificação isolado em `/tmp`, sem dados de usuário.

## Plano de implementação e riscos (antes das alterações)
1. Preservar stack, APIs, modelos e conectores. Criar tokens grafite/carvão e acento lima discreto, foco/contraste, densidade e navegação revisada; aproveitar componentes atuais.
2. Radar: parâmetros URL, paginação cliente, chips removíveis, três visualizações, filtros por atributos reais, buscas salvas e comparação até quatro.
3. Camada analítica TypeScript pura: medianas/amostra, comparáveis exatos, exclusão do próprio anúncio/outliers, recência por histórico de preço, confiança e motivos determinísticos. FIPE continua indisponível até fonte e correspondência confiáveis.
4. Detalhes: histórico existente, análise de comparáveis, imagem ampliada quando cadastrada e simulador de custos/margem. Comparador coerente com a camada analítica.
5. Home e `/mercado`: apenas agregados do catálogo cadastrado, gráficos acessíveis com valores observados, drilldown e exportação. Portais permanecem na área de busca real, sem misturar descoberta incompleta com cadastro normalizado.
6. Persistir filtros de catálogo em tabela aditiva. Mostrar mudanças de preços registradas dos favoritos como monitoramento interno; nunca simular notificações enviadas.
7. Verificar testes, tipos/lint/build, fluxos reais em banco temporário, telas 390/768/1280/1440 e ausência de regressões nos conectores.

## Migração e operação
Mudanças de banco apenas aditivas, aplicadas com `prisma migrate deploy` a banco de teste; banco de usuário não está no checkout. Nenhuma exclusão/reset nem publicação. Manter backup SQLite conforme README antes de atualizar instalação com dados. Carregamento do catálogo segue integral nesta fronteira; paginação reduz DOM, mas filtragem backend/virtualização são evolução para bases grandes. Não introduzir novos pacotes, taxas ou consultas externas de coleta nesta etapa.
