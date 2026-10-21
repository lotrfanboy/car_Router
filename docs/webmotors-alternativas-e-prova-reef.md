# Webmotors: alternativas e prova gratuita ReefAPI

Pesquisa e execução em 21/10/2026, aproximadamente 11h12–11h20, America/Sao_Paulo. Sem custo financeiro, cadastro, assinatura, cartão ou recarga. Nenhuma integração de produção ativada.

## Recomendação

**GeckoAPI para OLX por URL correta; ReefAPI como candidata para a busca Webmotors.** A prova pública Reef funcionou com marca/modelo/ano/localização e paginação. Estabilidade e autorização comercial permanecem pendentes. Limitações OLX estão em [validacao-gratuita-gecko.md](validacao-gratuita-gecko.md).

## Esclarecimento sobre a Gecko

A [página comercial Webmotors](https://geckoapi.com.br/api-webmotors/) declara busca por cidade/UF, paginação, novos/usados e diz que mais filtros estarão disponíveis em breve. Já a [documentação técnica PLP](https://geckoapi.com.br/docs/webmotors-com-br-plp/) e o catálogo autenticado incluem marca/modelo/ano. Essa inconsistência é compatível com os testes anteriores, em que esses critérios desapareceram da URL efetiva. Não prova a causa interna exata.

Filtrar localmente apenas os primeiros 50 carros de uma cidade não corrige a cobertura: em Curitiba a consulta ampla declarou mais de 12 mil anúncios. Manter Gecko para detalhes individuais ou futura correção, sem anunciar busca filtrada funcionando.

## Quatro chamadas reais da Reef

O [playground](https://reefapi.com/playground?action=search&engine=webmotors) permite testar sem conta, chave própria ou cartão, com limite anunciado de 15 chamadas/hora por visitante. Foram feitas quatro chamadas, todas HTTP 200. A interface exibiu 2 créditos por chamada da demonstração compartilhada. Nenhum crédito Gecko foi usado nesta rodada, nem extraída/reutilizada chave do site.

Endpoint: `POST https://api.reefapi.com/webmotors/v1/search`. `mode=live` e `cache_hit=false` foram informados pelo fornecedor, não auditados internamente.

| Teste                  | Filtros                                                            | Resultado                                                                            | Latência informada |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | -----------------: |
| Corolla                | Toyota, Corolla, ano-modelo 2020–2020, `pr-curitiba`, página de 10 | 9 registros; todos Corolla, ano-modelo 2020, cidade Curitiba/PR; total 9, uma página |           1.589 ms |
| BMW restrito           | BMW, 320i, `sc-blumenau`, preço até R$ 120 mil e km até 60 mil     | Zero resultados                                                                      |           4.758 ms |
| BMW controle, página 1 | Mesma marca/modelo/cidade, retirando preço/km; página de 10        | 10 registros, total declarado 20; próxima página disponível                          |           3.783 ms |
| BMW controle, página 2 | Mesmo controle, `page=2`                                           | Outros 10 registros; zero IDs repetidos com a página 1; `has_more=false`             |           1.800 ms |

Os vinte IDs BMW eram distintos, todos modelo 320i e cidade Blumenau. Nenhum atendia simultaneamente aos limites de preço/km; o zero do recorte restrito foi coerente com o controle completo desta amostra. São IDs de anúncios, não veículos deduplicados. O controle inclui novos/usados porque `condition` foi omitido. Não foi aplicado desconto FIPE, que exige referência exata independente.

### Conferência na origem

- [Corolla 81025836](https://www.webmotors.com.br/comprar/toyota/corolla/18-vvt-i-hybrid-flex-altis-premium-cvt/4-portas/2020/81025836): API e página individual aberta nesta rodada coincidiram em R$ 124.800, 60.800 km, 2020/2020 e Curitiba/PR.
- [Corolla 80767975](https://www.webmotors.com.br/comprar/toyota/corolla/20-vvt-ie-flex-xei-direct-shift/4-portas/2019-2020/80767975): Reef trouxe R$ 108.000, 107.900 km, ano-modelo 2020, Curitiba, particular. Preço/anos/km/cidade coincidem com a página conferida na rodada imediatamente anterior.
- Abertura do anúncio 81189329 recebeu **Access to this page has been denied**. Sem contorno ou repetição para vencer o bloqueio; não contar esse detalhe como conferido.

Não foram abertos todos os detalhes. Não declarar nove anúncios individualmente conferidos nem cobertura integral da Webmotors. Evidências sanitizadas e captura do playground ficam localmente fora do repositório; resposta bruta com identificação/contatos de vendedores não é publicada.

## Alternativas comparadas

| Fornecedor                                                                       | Oferta pública                                                                                                          | Avaliação                                                                                                                                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ReefAPI](https://reefapi.com/docs/webmotors)                                    | Busca filtrada e detalhe: 2 créditos; referência FIPE e catálogo marca/modelo: 1 crédito                                | Prioridade atual. Busca provada nesta amostra; detalhes/FIPE próprios e monitoramento ainda pendentes                                                                            |
| [GeckoAPI](https://geckoapi.com.br/api-webmotors/)                               | Busca por cidade/UF; filtros adicionais divergentes entre documentos                                                    | Detalhe funcionou; busca por marca/modelo/ano reprovada anteriormente                                                                                                            |
| [BrScrapp](https://brscrapp.com/api-webmotors)                                   | Busca, modelos, FIPE e veículo; 50 créditos grátis sem cartão; entrega final 1 crédito; 202 cria job e polling gratuito | Alternativa documental. Página legível na pesquisa desta rodada; incidente 525 anterior é histórico. API autenticada não testada; método/direitos ainda precisam de qualificação |
| [Apify ribtools/webmotors-scraper](https://apify.com/ribtools/webmotors-scraper) | Actor comunitário por URL filtrada; preço anunciado desde US$ 6,99/1.000 resultados, extras à parte                     | Reserva. Oferta explicita anti-detection e proxies residenciais: esclarecer método frente à restrição da missão. Nenhuma execução/contratação feita                              |

## Caminho para o CarRouter

1. Adaptadores separados por fonte; normalizar ID, URL, preço, fabricação/ano-modelo, km, cidade/UF e particular/loja. Validar filtros novamente localmente, com estado explícito para campos desconhecidos. Testar `condition=used` quando excluir 0 km.
2. Comparar IDs entre ciclos das buscas salvas. A Reef documenta cinco ordenações sem ordem de publicação mais recente: uma primeira página isolada pode deixar passar novidades. Consultar todas as páginas do recorte ou declarar cobertura parcial.
3. Comparar snapshots por ID para quedas de preço; ausência em uma página não significa vendido. Enriquecer detalhe/FIPE somente quando necessário, com mês e correspondência da versão registrados.
4. Medir alterações, falhas, custo e repetição em 24–48 h antes de ofertar alertas. Não há monitor automático ativo nem entrega de alerta validada nesta prova.

A [oferta Reef](https://reefapi.com/pricing) anuncia 1.000 créditos iniciais sem cartão: teoricamente 500 chamadas de busca a 2 créditos cada, antes de detalhes/FIPE. Não são 500 anúncios; cada chamada traz uma página. Até 100 itens/página são documentados, mas somente 10 foram testados.

Dimensionamento ilustrativo, não contratação: dez buscas distintas, uma página, a cada 30 min, por 30 dias = 14.400 chamadas = 28.800 créditos Webmotors. Paginação/detalhe acrescentam consumo. O gratuito serve à prova, não a esse monitoramento mensal. Nenhum plano contratado.

Para automatizar fora do playground, será necessária chave própria de conta gratuita. Não contornar o teto anônimo nem enviar chaves no chat.

Os [termos Reef](https://reefapi.com/terms) não concedem direitos de terceiros e vedam produto concorrente de redistribuição em massa. Antes do lançamento, qualificar por escrito busca/alerta com links de origem, retenção, fotos, redistribuição e método. Não há SLA sem acordo específico. Nenhum contato externo foi enviado.
