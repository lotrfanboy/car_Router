# Entrega da transformação — 21/10/2026

Base: `main`, commit `5626b17`. Implementação local, sem publicação em produção, chamadas pagas ou alteração de um banco de usuário. Os dados usados na validação ficam em SQLite temporário e são identificados como teste.

## A. Transformação

O Radar passou de catálogo com CRUD para uma área de descoberta e análise: identidade grafite/carvão com acento lima, navegação comum, três modos de catálogo, análise individual, exploração macro e acompanhamento de favoritos. Indicadores são calculados sobre o catálogo real; ausência de informação tem estado explícito.

## B. Arquitetura

Next.js, React, TypeScript, Prisma e SQLite foram mantidos, sem novas dependências. A camada pura `src/lib/intelligence.ts` centraliza dinheiro em centavos, comparáveis, classificação, agregados e simulação. Home, radar, detalhes, comparador e mercado utilizam as mesmas regras.

A API de veículos passou a incluir as duas últimas observações de preço e a data efetiva do registro; a API de histórico completo foi preservada. Favoritar ou editar outro atributo não faz um preço antigo parecer recém-observado. A única nova tabela é `CatalogSearch`, em migração aditiva, com API validada para filtros salvos. A migração foi testada preservando entidades antigas.

## C. Interface

- `/`: visão geral com universo, período, métricas, destaques e acesso aos modelos.
- `/veiculos`: radar em cards, lista e tabela configurável, chips, ordenação, paginação e filtros na URL.
- `/veiculos/[id]`: foto ampliada, ficha, comparáveis, suficiência, histórico e simulador.
- `/mercado`: filtros macro, distribuição de preços, dispersão preço × quilometragem, agrupamentos por modelo, drilldown e CSV.
- `/comparar`: até quatro veículos, diferenças, dados financeiros e históricos.
- `/favoritos`: catálogo de favoritos, reduções registradas e gestão de buscas salvas.
- `/configuracoes`: estado das fontes, limites disponíveis e metodologia.
- `/buscar`, cadastro e edição: fluxos existentes preservados e integrados à linguagem visual.

Fotografias usam apenas a URL associada ao veículo cadastrado, identificam o domínio de origem, preservam proporção e possuem fallback para ausência/falha. O modelo atual comporta uma foto por veículo. A home destaca uma imagem cadastrada quando disponível; sem imagem, usa uma ilustração abstrata identificada, sem simular dados.

## D. Funcionalidades operacionais

CRUD, favoritos persistentes, filtros combináveis e compartilháveis, retorno ao catálogo com filtros, buscas salvas no banco, paginação, ordenação, seleção de comparação durante navegação, histórico de preços, cálculo financeiro imediato, gráficos com tabelas alternativas, CSV e navegação dos agregados aos anúncios. O acompanhamento interno mostra reduções efetivamente registradas; não simula notificações enviadas.

## E. Integrações

Conectores existentes OLX/Gecko e Webmotors/Reef foram preservados, incluindo orçamento, cooldown, cache, proteção de concorrência e histórico de descobertas. Foram verificados por testes simulados; a disponibilidade ao vivo não foi reconfirmada nesta execução. Carregar páginas não dispara uma coleta.

Descobertas dos portais continuam separadas do catálogo normalizado: faltam atributos para uma comparação confiável em parte desses registros. Não há integração Facebook ou fonte FIPE autorizada/configurada nesta base. O valor `referenceCents` continua sendo uma **referência manual**, nunca apresentado como FIPE.

## F. Dados e análises

Mediana, distribuição, diferenças frente à referência manual, reduções registradas, comparáveis e classificação usam dados observados. Comparáveis exigem marca, modelo, versão, ano-modelo, combustível e UF correspondentes; excluem o próprio anúncio, duplicatas por URL normalizada, registros antigos e outliers. Amostra insuficiente ou excessivamente dispersa bloqueia a classificação. Os critérios e limites são configuráveis e estão descritos em [METODOLOGIA.md](METODOLOGIA.md).

O simulador calcula capital, resultado, margem e teto de compra com custos informados. A venda é uma hipótese, preenchida por comparáveis apenas quando há suficiência válida. Preço anunciado não prova transação, disponibilidade, liquidez ou lucro. Os agregados representam o catálogo cadastrado, não todo o mercado nacional.

## G. Validação

A linha de base foi executada antes das mudanças. Os 94 testes passaram, assim como lint, TypeScript e build. O roteiro de navegador passou em 66,304 s, cobrindo 16 grupos de fluxos e nove rotas em quatro larguras, sem exceções JavaScript ou consultas aos provedores. Testes financeiros, de persistência, API, segurança de entrada, migração e regressão foram ampliados. Comandos, medidas locais e limites constam em [VALIDACAO-TRANSFORMACAO.md](VALIDACAO-TRANSFORMACAO.md); [capturas revisadas](screenshots/transformacao/README.md) estão preservadas no repositório.

Uma verificação dedicada identificou deslocamento do rodapé durante o carregamento mobile. A reserva de altura no skeleton eliminou esse deslocamento: CLS local de aproximadamente 0,14–0,16 para zero, confirmado em seis navegações no build final, em 390 × 844 e 390 × 1000. Após essa alteração apenas de CSS, o build e o cenário diretamente afetado foram repetidos. Isso não é uma medição de Core Web Vitals em campo.

## H. Fronteira funcional

- FIPE automática e histórico FIPE dependem de fonte autorizada e correspondência verificável de código, versão, combustível, ano e mês. Não foram implementados por aproximação.
- Fotos dependem de URL real fornecida com permissão; não há galeria múltipla nem aquisição automática de fotografias dos portais.
- Não há série temporal macro: as observações disponíveis não comprovam evolução de todo o universo ao longo do tempo.
- O catálogo ainda é carregado integralmente no cliente. A paginação limita o DOM, mas não substitui consultas paginadas para bases grandes.
- Não há monitoramento agendado, central persistente de notificações, autenticação ou multiusuário. Cobrança e serviços pagos não foram introduzidos.
- Validação local não equivale a auditoria formal WCAG, teste de carga ou Core Web Vitals de usuários reais.

## I. Próximos passos necessários

1. Aplicar a migração aditiva na instalação do usuário após backup, seguindo o README; não houve migração em produção nesta execução.
2. Configurar/verificar as fontes já existentes no ambiente real e conferir cobertura e permissões dos anúncios/imagens.
3. Selecionar fonte FIPE autorizada e acrescentar associação verificável com tratamento de ambiguidades.
4. Com volume real, medir consultas e interações para decidir paginação no servidor e índices adicionais. Antes de disponibilizar publicamente, implementar autenticação, isolamento e operação apropriada.

Documentação complementar: [auditoria e plano](TRANSFORMACAO.md), [auditoria do backend](AUDIT-BACKEND.md), [sistema visual](DESIGN-SYSTEM.md).
