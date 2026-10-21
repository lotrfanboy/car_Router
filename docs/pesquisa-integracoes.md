# Pesquisa de integrações do CarRouter

Data da consulta: 21/10/2026, America/Sao_Paulo. Base analisada: `64e360c3de4426f1c21f76411b18d18deddb8bae`, repositório [lotrfanboy/car_Router](https://github.com/lotrfanboy/car_Router). Pesquisa documental pública; nenhum token comercial usado, conta criada, fornecedor contratado ou anúncio coletado por contorno técnico.

## Conclusão para decisão

Não foi comprovada nesta investigação uma API pronta que reúna **cobertura brasileira real, consulta de terceiros, licença adequada ao CarRouter e funcionamento autenticado testado**. Isso não prova que nenhuma parceria seja possível. A próxima etapa economicamente responsável é validar um fornecedor com direitos explícitos, antes de implementar seu conector.

A OLX documenta gestão do estoque da conta autorizada. O Facebook exige permissão para coleta automatizada e não foi localizada documentação oficial de pesquisa geral de Marketplace. Mercado Livre tem restrições técnicas e contratuais incompatíveis com assumir uma busca geral livre. A CarAPIs tem páginas de fontes que não estão ativas; ReefAPI tem oferta tecnicamente mais concreta para Webmotors, mas não comprova direitos de redistribuição das fontes.

**Primeiro caminho recomendado:** estoque de lojistas que autorizem o CarRouter diretamente, via API do gestor que detenha os dados e os direitos de distribuição. Em paralelo, negociação de feed com portal. Essa recomendação é arquitetural/comercial; ainda não existe parceiro contratado nem conector implementado.

## Critério de evidência

- **Comprovada:** chamada autorizada executada, dados reais e direitos necessários confirmados. Nenhuma fonte externa atingiu esse nível.
- **Parcialmente validada:** documentação original e escopo encontrados; falta teste autenticado ou confirmação contratual.
- **Dependente de autorização:** parceria, licença, conta ou escopo ainda necessários.
- **Inviável no escopo atual:** a modalidade documentada não atende à busca geral, ou exige método excluído pela missão.
- **Inconclusiva:** documentação pública insuficiente. Ausência na pesquisa não equivale a inexistência.

A expressão “API disponível” em marketing não é evidência de inventário ativo. Exemplos de respostas de fornecedores são exemplos deles, nunca testes do CarRouter.

## OLX Brasil — prioridade máxima

A [visão oficial](https://developers.olx.com.br/anuncio/api/home.html) descreve publicação, manutenção, status, catálogo de marcas/modelos, saldos e destaques. É integração do anunciante, não licença de descoberta de oportunidades de terceiros.

A [autenticação oficial](https://developers.olx.com.br/anuncio/api/oauth.html) usa OAuth 2.0, registro de aplicação e consentimento do usuário; requer aplicação/chaves e conta autorizada. O [suporte de integradores](https://ajuda.olx.com.br/s/article/integradores-e-importacao-de-anuncios) orienta o cadastro da integração. Não foram solicitadas chaves.

A [listagem atual](https://developers.olx.com.br/anuncio/api/published_ads.html) é `GET https://apps.olx.com.br/autoupload/v1/published`, Bearer por anunciante, escopo `autoupload` ou `basic_user_info`; paginação `page_token`/`next_token`, até 200 por página, filtro `ads_status`. Retorna IDs e status: não é uma busca global com preço, km, localização e fotos. O [envio](https://developers.olx.com.br/anuncio/api/import.html) aceita dados automotivos e preço inteiro em reais; não confundir campos enviados com campos disponíveis para leitura pública.

O [limite publicado](https://developers.olx.com.br/faq/rate_limit.html) é 5.000 requisições/minuto/IP no host apps, com bloqueio de dez minutos após excesso e HTTP 429. Isso não autoriza coletar o catálogo público. [Webhooks e status](https://developers.olx.com.br/anuncio/api/ads.html) referem-se ao fluxo dos anúncios integrados, não notificações sobre todo o marketplace.

Classificação: **parcialmente validada para estoque próprio; inviável como API pública documentada de terceiros; parceria de dados inconclusiva**. Custos de parceria/plano: cotação. Faltam contrato de feed de terceiros, escopo, preço, credenciais, quota e amostra BR.

## Facebook Marketplace — prioridade máxima

Não foi localizada documentação oficial que conceda pesquisa geral de anúncios de veículos de terceiros. Catálogo de produtos/veículos para publicidade não comprova leitura do Marketplace inteiro.

A Meta explica a exigência de permissão prévia em [How We Combat Scraping](https://about.fb.com/news/2021/04/how-we-combat-scraping/). A tentativa de abrir os [termos de coleta](https://www.facebook.com/legal/automated_data_collection_terms) foi redirecionada a login e mostrou bloqueio; não foi contornado. A leitura integral da versão atual desses termos permanece pendente.

Dados em anúncios podem ser incompletos, campos livres e preços de entrada/parcelas. Não há quota oficial de busca geral ou garantia de publicação, atualização e cobertura BR validada. Sem conta/permissão, nenhum teste de coleta foi executado.

Classificação: **dependente de autorização; coleta não autorizada inviável no escopo**. Falta autorização expressa da Meta e direitos de exibição, inclusive fotos. Não existe custo comprovado de feed oficial nesta pesquisa.

## Webmotors

O [portal oficial](https://portal-webmotors.sensedia.com/api-portal/documentacao) lista integração com gestores, classificados, sites, leads e Marketplace. Essa lista permite investigar parceria de distribuição, mas não comprova acesso aberto ao catálogo geral. O [API Browser](https://portal-webmotors.sensedia.com/api-portal/api-browser) enumera APIs de estoque/canais. O [suporte comercial](https://comercialwebmotors.zendesk.com/hc/pt-br/articles/360056716132-Como-integrar-o-estoque) orienta cadastro e obtenção de APIs de teste.

O [serviço SOAP documentado](https://integracao.webmotors.com.br/wsEstoqueRevendedorWebMotors.asmx?op=ObterEstoqueAtual) recebe `pHashAutenticacao` para `ObterEstoqueAtual`. É evidência do contrato técnico de estoque, não autorização para pesquisar todos os vendedores. Autenticação, endpoints e limites da API de canais escolhida precisam ser confirmados na homologação; não misturar contratos SOAP legados e REST atuais.

Classificação: **parcialmente validada documentalmente; dependente de parceria para terceiros**. Dados/cobertura, frequência, fotos, paginação, SLA e preço comercial precisam de proposta escrita. Melhor candidato entre os portais para conversa técnica por já haver modalidade de canais/sites publicada.

## Mercado Livre — veículos

A [documentação de buscas](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas), atualizada em 31/08/2026, concentra-se em listagens por vendedor, com Bearer e filtros/ordenação. Não comprova pesquisa livre de todo o marketplace. Informa migração de multiget para `/items/bulk` e `/users/bulk` até **25/10/2026**; integrações novas não devem nascer em endpoints descontinuados. A [publicação de automóveis](https://developers.mercadolivre.com.br/pt_br/publicacao-de-automoveis) é gestão de anúncios e atributos, outro escopo.

Os [termos de desenvolvedor](https://developers.mercadolivre.com.br/pt_br/termos-e-condicoes), item 7.9, incluem restrição a serviços concorrentes. A [política de bloqueio](https://developers.mercadolivre.com.br/devcenter/bloqueio-de-aplicacoes) cita `INTEGRATORS_DATA_INFRACTION` para consumo apenas de leitura sem APIs que gerem valor. Isso torna inadequado assumir sustentabilidade de um agregador somente porque um GET funciona.

Uma tentativa pelo leitor web de `https://api.mercadolibre.com/sites/MLB/search?category=MLB1744&limit=1` retornou inacessibilidade da ferramenta. **Não é um HTTP 403 comprovado do Mercado Livre, nem teste autenticado.** Nenhum resultado real foi obtido.

Classificação: **inviável assumir busca geral com as permissões atuais; parceria/estoque autorizado parcialmente validado**. Faltam aprovação do caso de uso, aplicação, consentimento, escopos e teste de veículos BR. Não foi encontrada tarifa pública específica para licenciamento desse feed.

## iCarros e Mobiauto

Não foi localizada documentação oficial pública suficiente para afirmar API de consulta global, endpoints, quotas e licença de republicação de nenhum dos dois. O [portal de atendimento Mobiauto](https://atendimento.mobiauto.com.br/portal/pt/home) é um canal para solicitar documentação. Os [termos publicados no domínio iCarros](https://www.icarros.com.br/media/mediaresource?id=3037) não constituem credencial ou concessão de API ao CarRouter.

Há SDK público [IcarrosAPI](https://github.com/pensadorsolucoes/IcarrosAPI). Ele é evidência de uma implementação de terceiros, não comprovação de acesso atual, cobertura global ou direito de redistribuição. Não foi instalado nem executado.

Classificação de ambos: **inconclusiva para consulta geral; dependente de documentação/parceria**. Não se inferem autenticação, preço, filtros, atualização ou fotos a partir de portais de compra ou manuais de integradores. Solicitar contrato técnico atual e distinguir estoque autorizado do lojista de anúncios de todos os vendedores.

## Regionais e estoque de lojistas

- [CarroSP](https://cdn.carrosp.com.br/contato): FAQ confirma um caminho de integração para quem possui integrador; não comprova feed geral. API, preços, licença e abrangência: pendentes.
- [CarroQuente](https://desenvolvedores.carroquente.com.br/): resultado de busca do próprio portal informa documentação para integradores; a abertura falhou no leitor web. Conteúdo integral e contrato não validados.
- [Carros.com](https://carros.com/developers/?lang=pt): página oficial recebe pedido de API e finalidade de uso; cita consumo de informações e gestão dos próprios anúncios. Não informa publicamente endpoints, autenticação, quotas ou licença de terceiros. Candidato a solicitar acesso, não integração comprovada. O formulário tem CAPTCHA e não foi preenchido.
- [IntegraCarros](https://home.integracarros.com.br/): publica e sincroniza estoque da loja em múltiplos canais; orçamento personalizado. **Integrador de distribuição do lojista não equivale a fornecedor de todos os anúncios dos portais.** Pode ser parceiro de estoque autorizado se a loja e o gestor concederem os direitos.

Classificação: **dependentes de parceria ou inconclusivos**. Um feed diretamente autorizado por lojista reduz a ambiguidade de origem dos dados, mas o contrato precisa incluir fotos, exibição, atualização e revogação. Não basta o lojista ter uma conta em um portal.

## Leilões brasileiros

A [Superbid](https://www.superbid.net/todas-categorias/) lista carros/motos e mantém [procedimento de utilização](https://cac.superbid.net/br/institucional/procedimento-de-utilizacao/). A busca por documentação de integração não localizou API pública de catálogo licenciada ao CarRouter. Um PDF de API PNCP hospedado em anexo de leilão é sobre compras públicas, **não API da Superbid**.

Também foi pesquisado o domínio oficial Sodré Santoro. Não surgiu documentação pública suficiente de feed/API para afirmar acesso. Resultados em domínios semelhantes não foram usados como fonte oficial.

Classificação: **inconclusiva; parceria necessária**. Não executar bots de lances ou leitura por endpoints internos. Para futura integração, exigir identificação do lote/evento, natureza do preço (lance atual, mínimo ou estimativa), comissão, taxas, encerramento e estado do lote. O modelo atual `Vehicle.priceCents` representa preço anunciado e não calcula custo total de arrematação; não misturar essas modalidades.

## Provedores comerciais

### CarAPIs

As páginas específicas de [OLX Brasil](https://docs.carapis.com/platforms/latam/olx-brasil-autos), [Facebook](https://docs.carapis.com/platforms/global/facebook-marketplace), [iCarros](https://docs.carapis.com/platforms/latam/icarros) e [Mobiauto](https://docs.carapis.com/platforms/latam/mobiauto) afirmam que não estão no feed contínuo atual e que ativação é sob demanda. **Não recomendar assinatura como se essas fontes já estivessem funcionando.** A página geral de Brasil faz promessa mais ampla; prevalece a necessidade de testar as fontes habilitadas na conta. Webmotors não pôde ser aberta no leitor; disponibilidade específica permanece inconclusiva.

O [guia inicial](https://docs.carapis.com/api/getting-started) documenta Bearer e `/v2/listings`; páginas de fonte também apresentam `/apix/api/vehicles/` e `/apix/api/sources/`. Essa divergência deve ser resolvida com contrato/OpenAPI da conta, sem escolher arbitrariamente uma versão. Campos indicativos incluem marca, modelo, ano, km, preço/moeda, fotos, URL e disponibilidade. Campos ausentes não podem virar zero.

Os [termos de 16/10/2026](https://my.carapis.com/legal/terms/) permitem integração/exibição no app, mas restringem concorrência e revenda dos dados, deixam direitos de terceiros a cargo do cliente e não garantem cobertura/atualidade nos planos comuns. O CarRouter precisa de confirmação escrita específica do caso de uso e das fontes antes de uso comercial. Classificação: **documentação parcialmente validada; fontes prioritárias não ativas; dependente de autorização e cotação**. Não houve chamada autenticada.

### ReefAPI

A [documentação Webmotors](https://reefapi.com/docs/webmotors) descreve POST `/webmotors/v1/search` e `/listing` (2 créditos), `reference_price` e `makes_models` (1), chave `x-api-key`, filtros automotivos, página de até 100 e teto aproximado de 10 mil resultados por consulta. Marca/modelo, anos, km, preço, fotos, URL e vendedor são anunciados; há exemplo capturado pelo fornecedor, não pelo CarRouter. Para descoberta em escala é necessário particionar consultas; isso não garante snapshot consistente ou cobertura integral.

Os [termos](https://reefapi.com/terms) não concedem direitos além do uso lícito, atribuem ao cliente conformidade com fontes e restringem redistribuição concorrente em massa. Não foi encontrada prova de autorização da Webmotors, OLX ou Meta para o uso específico do CarRouter. Classificação: **parcialmente validada documentalmente, dependente de licença e teste autorizado**. É a candidata mais concreta a uma prova técnica limitada de Webmotors após resolver os direitos, mas não aprovada para implementação.

### Apify e Bright Data

O [Actor da Apify](https://apify.com/apify/facebook-marketplace-scraper) anuncia US$ 5/1.000 resultados. Sua existência não comprova autorização da Meta, cobertura brasileira, campos completos ou continuidade. Não foi executado.

A [Bright Data](https://brightdata.com/products/datasets/marketplace) anuncia dataset a partir de US$ 250/100 mil registros, compra única. É necessário distinguir dataset histórico de monitoramento contínuo e pedir amostra de veículos BR, licença e política de refresh. Não se extrapola essa tarifa mínima como orçamento contratável para qualquer recorte. Não foram executadas ferramentas de bypass, proxies ou resolução de CAPTCHA.

Classificação de ambos: **oferta comercial verificada documentalmente; adequação ao CarRouter inconclusiva e dependente de aprovação**.

## Projetos públicos e discussões

[web-motors-api](https://github.com/vm-felipe/web-motors-api) se apresenta como wrapper não oficial de API interna. [olx-scraper](https://github.com/leourl/olx-scraper) é voltado a hardware, não uma integração automotiva comercial validada. [Facebook Marketplace Scraper API](https://github.com/unitbytes/Facebook-Marketplace-Scraper-API) é divulgação de um serviço de scraping. Nenhum comprova direitos das fontes ou foi incorporado.

Discussões recentes localizadas sobre falhas e mudanças do Mercado Livre e scrapers foram usadas para encontrar hipóteses, não para concluir viabilidade técnica. As conclusões sobre Mercado Livre acima se apoiam na documentação original e política de bloqueio, não em relatos de usuários.

## Matriz de decisão

Avaliação qualitativa de engenharia; não são notas medidas. “Condicional” exige contrato e teste.

| Opção                                                  | Técnica                                             | Jurídica/contratual                           | Dados BR                                | Custo                               | Implementação              | Escala/interrupção                 | Potencial e ordem                          |
| ------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------- | --------------------------------------- | ----------------------------------- | -------------------------- | ---------------------------------- | ------------------------------------------ |
| API de estoque diretamente autorizado por lojas/gestor | Contrato técnico pendente                           | Negociável com titulares                      | Cobertura inicial limitada, controlável | Cotação                             | Média                      | Incremental; dependência do gestor | 1: piloto sustentável                      |
| Webmotors canais/parceria                              | Modalidades documentadas                            | Aprovação do portal                           | Potencial alto, escopo não validado     | Cotação                             | Média                      | SLA a negociar                     | 2: negociar feed                           |
| Carros.com / CarroSP                                   | Acesso/documentação pendentes                       | Aprovação do portal                           | Não medida                              | Cotação                             | Não estimável sem contrato | Não medida                         | 3: qualificar parceria                     |
| ReefAPI Webmotors                                      | Contrato público, sem teste próprio                 | Direitos das fontes não comprovados           | Anunciada, não medida                   | Créditos; ver custos                | Média                      | Alto risco de fonte mudar          | Prova condicionada, sem produção           |
| CarAPIs fontes prioritárias                            | Sob demanda, sem feed ativo nas páginas verificadas | Cláusula de concorrência e direitos pendentes | Não comprovada                          | Cotação e ativação                  | Incerta                    | Não há SLA padrão de cobertura     | Aguardar proposta e amostra                |
| OLX API de anunciante                                  | Documentada                                         | Consentimento/credenciais                     | Só estoque autorizado                   | Cotação de planos                   | Média                      | Limite oficial publicado           | Útil como gestão de loja, não busca global |
| Facebook coleta geral                                  | Sem API oficial localizada                          | Permissão necessária                          | Não validada                            | Não contratável com evidência atual | Alta                       | Alto                               | Não implementar coleta não autorizada      |
| Mercado Livre geral                                    | Busca livre não comprovada                          | Restrições de leitura/concorrência            | Não validada                            | Licença sem preço publicado         | Alta incerteza             | Alto                               | Não assumir como primeiro conector         |
| iCarros/Mobiauto oficiais                              | Documentação insuficiente                           | Parceria pendente                             | Não validada                            | Cotação                             | Não estimável              | Não medida                         | Solicitar documentação                     |
| Superbid/Sodré                                         | API licenciada não localizada                       | Parceria pendente                             | Lotes não equivalem a classificados     | Cotação                             | Alta, domínio distinto     | Atualização sensível ao horário    | Etapa posterior                            |
| Apify/Bright Data Facebook                             | Oferta comercial, sem teste BR                      | Direitos e método pendentes                   | Não comprovada                          | Tarifas indicativas publicadas      | Média/alta                 | Alto                               | Não aprovar só pelo preço                  |

## Prova técnica que falta antes do primeiro conector

1. Confirmar por escrito permissão para este agregador, anúncios de terceiros, fotos, retenção e histórico; excluir cláusula de concorrência impeditiva e métodos vedados pela missão.
2. Obter aprovação do usuário para fonte e credencial, sem contratar plano automaticamente.
3. Receber chave de teste por configuração local segura; não inserir em mensagens, código, logs ou GitHub.
4. Consultar fontes habilitadas; selecionar BR e um recorte pequeno; registrar status HTTP, data UTC, duração, versão, filtros e contagens, sem token ou dados pessoais desnecessários.
5. Conferir amostra de pelo menos 20 anúncios e duas páginas com a origem, quando acesso permitido; medir campos completos, duplicatas e latência do inventário.
6. Reconsultar em 24–48 horas e registrar mudanças reais e remoções. Não tratar `first_seen_at` como data de publicação nem ausência numa página como venda.
7. Confirmar medição de quota/custo, 429 documentado sem provocar bloqueio, retenção e desativação. Só então classificar como comprovada no recorte testado.

Nenhuma conta comercial, autorização ou amostra autenticada foi fornecida. O bloqueio para avançar a uma integração específica é evidência/permissão, não falta de um adaptador fictício.
