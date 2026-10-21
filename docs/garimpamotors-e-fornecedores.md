# GarimpaMotors, demonstração e fornecedores: revisão da estratégia

Consulta em 21/10/2026. Esta revisão incorpora a demonstração enviada pelo usuário e uma busca pública efetivamente executada em outro agregador. A prioridade do CarRouter é encontrar oportunidades nos portais em que o comprador já procura, incluindo particulares. Estoque autorizado de lojas não substitui esse requisito.

## O que mudou na conclusão

Há agora evidência de uma busca multicanal funcionando no recorte testado. Isso corrige uma lacuna da primeira investigação, que examinou ofertas e documentos, mas não realizou uma busca em um agregador público. Ainda não há prova autenticada de um fornecedor de API integrado ao CarRouter, licença aprovada ou cobertura contínua de Facebook.

A candidata técnica principal para prova de OLX/Webmotors passa a ser **GeckoAPI**. Para Facebook, a gravação revela referência à **Apify**, mas também a falta de configuração naquela sessão. BrScrapp entra como alternativa documental com incidente de disponibilidade observado. Nenhuma dessas classificações equivale a aprovação de produção.

## GarimpaMotors: página pública versus produto demonstrado

A [página pública](https://garimpamotors.com.br/) anuncia busca em OLX, Webmotors e Facebook, filtros, FIPE e alertas. A própria landing page identifica os cards iniciais como ilustrativos. O login foi aberto no navegador, sem criar conta, entrar ou fornecer dados. Links públicos de privacidade e termos apontavam para `#`, sem documento separado naquela página. Isso não prova ausência de contrato em outras partes do produto. Nenhum fornecedor de dados foi identificado na landing page.

A gravação de aproximadamente 3min07s enviada pelo usuário mostra o produto autenticado. Análise visual por quadros em intervalos e trechos mais densos; áudio não foi transcrito. Vídeo e quadros, que contêm dados de conta/contato, **não foram incluídos no repositório público**.

| Trecho aproximado | Evidência visível                                                                                                                     | Limite da conclusão                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 00:16–00:50       | Fontes selecionáveis; marca/modelo/versão; ano, km, preço, desconto FIPE e região                                                     | São controles de interface; não comprovam filtros aplicados na fonte                                              |
| 00:55–01:05       | Consulta em andamento, barra de progresso e placeholders                                                                              | Progresso de UI não mede cobertura nem porcentagem real da coleta                                                 |
| 01:20–01:25       | Cards de BMW 320i atribuídos à Webmotors com foto, km, cidade, pessoa física, preço/FIPE/diferença, média e link de origem/prospecção | Os links desses cards não foram abertos na gravação; preços e identidade não foram conferidos na origem           |
| 01:33–02:10       | Formulário e criação de alerta com fontes, região e WhatsApp; card ativo aguardando primeira verificação                              | Alerta cadastrado não comprova execução posterior ou entrega de mensagem                                          |
| 02:15             | Tela de prospecção no WhatsApp                                                                                                        | Envio efetivo não demonstrado                                                                                     |
| 03:06             | Mensagem: “Sem resposta de: facebook (Apify não configurado).”                                                                        | Evidência explícita de referência à Apify para Facebook; não revela Actor, conta, custo ou integração funcionando |

A mensagem do último trecho é a pista mais concreta sobre aquisição de dados. **Não concluir que o Facebook do GarimpaMotors está funcionando, nem que o Actor oficial da Apify é o utilizado.** A gravação mostra cards Webmotors e uma fonte Facebook sem resposta; não comprova as três fontes funcionando em conjunto.

A imagem separada de consentimento OAuth menciona “FIPE Finder Pro” e acesso a e-mail/perfil. Não identifica fornecedor de anúncios. Sua relação com o GarimpaMotors ainda não foi confirmada pelo usuário; não foi usada como prova técnica de coleta.

## Busca multicanal que executei: RadaCar

Usei a [busca pública](https://radacar.com.br/buscar), sem conta, para Toyota Corolla, ano 2020–2020, Curitiba/PR, demais filtros abertos. É um recorte de comparação escolhido para esta investigação, não preferência de compra atribuída ao usuário.

O [resultado reproduzível](https://radacar.com.br/resultados?brand=Toyota&brandCode=56&model=Corolla&yearMin=2020&yearMax=2020&state=PR&city=Curitiba) terminou indicando **33 anúncios encontrados**, com contadores OLX 20, Mercado Livre 1, Webmotors 2, Chaves na Mão 8 e Mobiauto 2. Há agrupamento de anúncios equivalentes: 33 não foi validado como número de veículos únicos. A Webmotors terminou depois das outras fontes. Não medi a duração integral de busca, pois intercalei a investigação de outras páginas.

Conferi três origens:

| Origem                                                                                                                                                                 | Resultado no agregador                             | Conferência direta                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| [OLX, ID 1494629700](https://pr.olx.com.br/regiao-de-curitiba-e-paranagua/autos-e-pecas/carros-vans-e-utilitarios/toyota-corolla-xei-2-0-flex-16v-aut-2020-1494629700) | Corolla XEi 2020, R$ 103.900, 133.000 km, Curitiba | Página original abriu e apresentou os mesmos campos                     |
| [Mobiauto, ID 33326736](https://www.mobiauto.com.br/comprar/carros/pr-curitiba/toyota/corolla/2020/2-0-xei-multi-drive-s-flex/detalhes/33326736)                       | Corolla XEi, R$ 117.800, 55.822 km, Curitiba       | Página original abriu com preço/km iguais e fabricação/modelo 2019/2020 |
| [Webmotors, ID 80767975](https://www.webmotors.com.br/comprar/toyota/corolla/20-vvt-ie-flex-xei-direct-shift/4-portas/2019-2020/80767975?lkid=4668)                    | Corolla XEi 2020, R$ 108.000, 107.900 km, Curitiba | Página original confirmou preço/km e fabricação/modelo 2019/2020        |

A Webmotors carregou após a primeira observação; a verificação final confirmou também a terceira origem. Nenhum vendedor foi contatado, telefone revelado, anúncio favoritado ou monitoramento cadastrado.

**Comprovado:** busca pública multicanal nesse recorte e coincidência de três anúncios com suas origens. **Não comprovado:** fornecedor interno do RadaCar, contrato de dados, latência de novos anúncios, alerta automático, cobertura de particulares ou Facebook, completude nacional e direito de usar essa base no CarRouter. RadaCar é benchmark/prospecto de parceria, não API contratável confirmada. Sua [política](https://radacar.com.br/privacidade) informa consulta de anúncios públicos e ausência de afiliação, sem identificar fornecedor de ingestão.

## Fornecedor 1: GeckoAPI — primeira candidata técnica OLX/Webmotors

A [documentação de OLX](https://geckoapi.com.br/docs/olx-com-br-plp/) descreve busca real de listagens, inclusive URL pública pronta, palavra-chave, categoria automotiva, UF/região/cidade, preço, ordenação por data e paginação. O schema anuncia IDs, URL, preço anterior/atual, publicação, indicador profissional, fotos e atributos. Há exemplos de outras categorias; não foram tratados como amostra automotiva validada.

A [documentação Webmotors](https://geckoapi.com.br/docs/webmotors-com-br-plp/) especifica cidade/UF, marca/modelo, ano, preço/km, vendedor particular/profissional e filtros automotivos. O [detalhe](https://geckoapi.com.br/docs/webmotors-com-br-pdp/) complementa dados do anúncio. Essas modalidades atendem melhor à necessidade do que APIs de publicação de estoque próprio. A execução documentada é POST `/v1/extract` com Bearer; não foi executada com chave.

[Preços](https://geckoapi.com.br/precos/) observados: 100 créditos iniciais sem cartão; Developer 10.000 créditos/ciclo, R$ 126,90/mês equivalente; Business 100.000, R$ 999,90/mês equivalente. A página esclarece que os valores têm desconto e **cobrança anual**: equivalentes a R$ 1.522,80 e R$ 11.998,80 por ano. Não foram confirmados preços mensais sem compromisso nem custo exato de cada endpoint. Endpoints especializados podem consumir mais que um crédito.

A [política de uso responsável](https://geckoapi.com.br/uso-responsavel/) declara ausência de bypass, proíbe credenciais de terceiros e inclui análise de preço/mercado entre os usos permitidos, com restrições de redistribuição/clonagem e conteúdo protegido. Isso é sinal documental relevante para o escopo solicitado, não auditoria do método. Os [termos](https://geckoapi.com.br/termos-de-uso/) dizem que a empresa não concede autorização para acessar terceiros e responsabilizam o cliente por permissões e saídas; confirmar expressamente a aplicação CarRouter e exibição a clientes. Há diferenças entre texto promocional de uso em marketplaces e as limitações contratuais que precisam de resposta específica.

A página do dashboard foi aberta e redirecionou a login. Nenhuma conta/chave foi criada. Contato publicado: `contato@geckoapi.com.br`. **Classificação: candidata documental prioritária; ainda sem prova autenticada e licença aprovada.** Não há evidência de suporte a Facebook no catálogo consultado.

## Fornecedor 2: Apify — pista direta da demonstração para Facebook

A gravação permite identificar a plataforma Apify, mas não um Actor. O [Actor mantido pela Apify](https://apify.com/apify/facebook-marketplace-scraper) recebe URLs de localização/categoria/busca e anuncia dados de anúncios e vendedores; a [API](https://apify.com/apify/facebook-marketplace-scraper/api/python) permite executar e obter resultados programaticamente. A Apify é plataforma/fornecedor de automação, não API oficial da Meta.

A tabela/cartão atual anuncia **a partir de US$ 2,60/1.000 anúncios**; o README da mesma página menciona US$ 6,20 no plano Free e US$ 5 no Starter com assinatura. Essa divergência impede usar US$ 2,60 como preço final universal. Confirmar tabela de eventos/plano na conta antes de qualquer execução. O valor anterior de US$ 5 nos documentos desta branch corresponde a uma modalidade anunciada, não à única tarifa.

Também existe [Actor específico para veículos](https://apify.com/raidr-api/facebook-marketplace-vehicle-scraper), oferecido por outro desenvolvedor. Campos/filtros especializados podem ser úteis, mas não foi identificado como o usado pelo concorrente. Cobertura de Blumenau/SC e demais regiões BR, atualização, duplicação, método, autorização e custo por evento precisam de teste e esclarecimento. Nenhum Actor foi executado; não houve uso de conta comercial, proxy, CAPTCHA ou contorno técnico.

**Classificação: fornecedor identificado na mensagem do produto; funcionamento de Facebook no concorrente não demonstrado; Actor e adequação do método/contrato pendentes.** A autorização do usuário para testar não substitui permissões da origem. Deve continuar uma frente de validação separada, sem bloquear a prova das outras fontes.

## Fornecedor 3: BrScrapp — alternativa com bloqueio operacional observado

A [página OLX indexada](https://brscrapp.com/api-olx) anuncia busca nacional com categoria de carros, filtros, até 500 itens e detalhe; [Webmotors](https://brscrapp.com/api-webmotors) também consta na oferta. Não é integração para publicar anúncios próprios. Há declaração de independência dos portais.

Na navegação direta em 21/10/2026, `api-olx` exibiu erro **525 SSL handshake failed** do Cloudflare; docs também não puderam ser lidas integralmente. Esse é um incidente observado, não prova de falha permanente de toda a API. Não houve contorno de certificado.

O [preço indexado](https://brscrapp.com/pricing) mostra créditos pré-pagos e 50 iniciais grátis; por exemplo R$ 75/1.071 créditos e R$ 500/7.812. A informação indexada precisa de confirmação quando o site estiver acessível, inclusive se OLX usa as mesmas tarifas do restante. Licença, cache, frescor e custo efetivo não validados. **Classificação: alternativa documental em espera por acesso estável.**

## Outras possibilidades

- **Parceria OEM/API com operadores que já entregam a busca**, como GarimpaMotors/RadaCar: hipótese comercial válida para qualificação, não oferta pública de API encontrada. Nenhum contato foi enviado.
- **Índice de busca web como descoberta complementar:** a [Brave Search API](https://brave.com/search/api/) oferece pesquisa própria e US$ 5/1.000 requisições, mas não garante captura de anúncio novo no momento da publicação. A página exige plano com direitos de armazenamento para reter resultados; não é substituto pronto para banco de monitoramento. Índice pode retornar páginas antigas/categorias em vez de anúncios individuais. Não foi contratado ou testado com chave.
- **Piloterr OLX:** [documentação](https://www.piloterr.com/pt/library/olx-search) informa endpoint privado, sujeito a liberação, e descreve contorno de proteção. Não priorizar sob a restrição de método desta missão, nem usar 403 como motivo para tentar acessos alternativos.

## Arquitetura econômica adequada ao produto demonstrado

O foco inicial deve ser **buscas salvas por veículo/região**, não reconsultar individualmente todo o estoque nacional. Consultar listagens compartilhadas entre filtros equivalentes, detectar IDs novos e enriquecer detalhes apenas quando necessário. Atualizações e remoções exigem reconciliação própria; um anúncio ausente na primeira página não está necessariamente vendido.

Exemplo operacional calculado, não tarifa: Q buscas distintas, duas fontes, uma página por ciclo, 30 dias. `chamadas = Q × fontes × ciclos/dia × dias × páginas`. Dez buscas a cada 30 minutos geram 28.800 chamadas/mês; a cada hora, 14.400; a cada cinco minutos, 172.800. Detalhes, novas páginas e falhas podem adicionar consumo. Dez buscas de clientes que compartilham o mesmo recorte podem usar menos consultas que dez buscas totalmente distintas; isso precisa ser medido, sem infringir cache/licença.

Para GeckoAPI, créditos = chamadas × custo real do endpoint, ainda a confirmar. Se fosse um crédito/chamada, 28.800 caberiam no pacote Business; se fossem cinco, seriam 144.000 e ultrapassariam o pacote. **Não prometer custo do MVP a partir do número de anúncios sem definir frequência, fontes, páginas e detalhe.**

## O CarRouter que o usuário quer, baseado na gravação

Fluxo-alvo: escolher o carro/região/fontes → buscar anúncios de terceiros → conferir oportunidade → abrir a origem → salvar e acompanhar → receber alerta de anúncio novo ou queda de preço. A interface atual será evoluída, preservando o cadastro e as funções existentes. A aquisição de dados precede expansão de telas.

| Parte observada            | Requisito para CarRouter                                   | Como fazer melhor e medir                                                                                                |
| -------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Seleção de fontes          | OLX, Webmotors e Facebook com capacidade real distinta     | Estado por fonte: ativo, coletando, desatualizado, indisponível; não anunciar fonte apenas configurável como funcionando |
| Filtros automotivos e raio | Marca/modelo/versão, anos, km/preço, cidade/UF/raio        | Distinguir aplicado na fonte de filtro local; dados desconhecidos não passam por silêncio                                |
| Desconto e cards           | Preço, origem, última conferência e cálculo auditável      | Separar elegíveis de aproximações; listar todos os critérios reprovados, inclusive preço, km e desconto                  |
| FIPE e média               | Referência exata de versão/ano/combustível e mês           | Mostrar correspondência/confiança, tamanho e dispersão da amostra comparável; desconto FIPE não é lucro                  |
| Mesmo carro em portais     | Preservar IDs e cada anúncio                               | Agrupar possíveis duplicatas com evidência, sem fundir por marca/modelo/ano apenas; mostrar preços por origem            |
| Alertas                    | Busca persistente, agendamento e controle do primeiro lote | Diferenciar criação, última execução, anúncios novos e entrega confirmada; não reenviar o mesmo anúncio a cada ciclo     |
| WhatsApp/prospecção        | Link para origem e organização do acompanhamento           | Priorizar avisos solicitados; envio/negociação automáticos dependem de decisão e canal autorizado                        |
| IA                         | Interpretar pedido e explicar filtros/proposta             | Nunca inventar anúncio, FIPE, margem ou telefone; apoiar-se em resultados com proveniência                               |

A gravação demonstra estados úteis, mas não entrega de alerta ou estabilidade prolongada. O diferencial inicial deve ser **cobertura e frescor medidos, filtros confiáveis e transparência quando uma fonte falha**. Vitrine, assistente de negociação e demais módulos ficam depois da aquisição comprovada.

## Próxima prova — testes gratuitos autorizados em 21/10/2026

O usuário autorizou seguir com validações exclusivamente gratuitas. A [prova real](validacao-gratuita-gecko.md) consumiu oito créditos gratuitos: OLX por URL correta e paginação funcionaram; filtros estruturados OLX e filtros Webmotors falharam. Detalhes individuais de ambas responderam. Saldo final 86, sem compra. A autorização não permite compras ou consumo pago.

1. Fonte: GeckoAPI OLX e Webmotors, contas/chaves somente após aprovação expressa do usuário. Sem compra ou aceite de contrato em nome do usuário automaticamente.
2. Limite: usar apenas créditos gratuitos, teto de 100 créditos; conferir custo por ação antes de executar. Se teste exigir pagamento, parar nesse ponto.
3. Usar dois recortes, um equivalente ao exemplo do vídeo e um recorte amplo de controle. No recorte restrito, zero resultados pode ser correto; comparar com busca pública da origem.
4. Obter IDs/URLs de duas páginas, conferir pelo menos dez anúncios por fonte e repetir em 24–48 horas. Registrar dados ausentes, divergências, data de coleta, atraso e custo sem publicar token, contato ou payload pessoal.
5. Antes de disponibilizar aos clientes, confirmar caso de uso, método sem contorno, direitos de fotos/dados, retenção e limites comerciais com o fornecedor.
6. Facebook/Apify: qualificar Actor, região BR e método separadamente; a mensagem do concorrente é pista, não permissão. Não implementar integração específica antes de aprovação.

Esta seção começou como proposta; a execução gratuita posteriormente autorizada está registrada no relatório vinculado acima. Não confundir a seleção documental inicial com a aprovação técnica integral: a busca Webmotors segue reprovada e a OLX exige URL correta e validação dos critérios.
