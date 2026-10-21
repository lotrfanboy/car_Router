# Comparativo de custos

> **Revisão após demonstração:** veja [GarimpaMotors e fornecedores](garimpamotors-e-fornecedores.md). Inclui busca pública multicanal executada, conferência de anúncios na origem, a pista Apify na gravação e GeckoAPI como candidata prioritária a prova OLX/Webmotors. Esta revisão substitui a priorização anterior de estoque de lojas como primeira solução para a necessidade do usuário.

Consulta em 21/10/2026. Valores em USD quando publicados nessa moeda. Não foi adotado câmbio fictício: `total BRL = total USD × câmbio efetivo de pagamento + tributos/tarifas aplicáveis`. Nenhuma compra foi feita. Preço acessível em uma página não comprova licença, disponibilidade ou cobertura.

## Tarifas verificadas e preços ausentes

| Modalidade                      | Inicial / mensal / unidade                                                                | Gratuidade                                                  | O que falta                              |
| ------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| OLX oficial                     | Sem preço público de feed geral localizado; plano/parceria sob cotação                    | Não comprovada para este uso                                | Escopo de terceiros e proposta           |
| Facebook oficial                | Nenhuma tarifa de API geral de Marketplace validada                                       | Não comprovada                                              | Permissão e produto de acesso            |
| Webmotors oficial               | Parceria/API de canais sob cotação                                                        | Homologação precisa de cadastro; não equivale a feed grátis | Licença, amostra e contrato              |
| Mercado Livre                   | Sem tarifa publicada validada para licenciamento de busca geral                           | Não assumir acesso livre/grátis                             | Aprovação e escopos                      |
| iCarros/Mobiauto                | Sob cotação; sem tabela de feed validada                                                  | Não comprovada                                              | Documentação e licença                   |
| Regionais, leilões e gestores   | Sob cotação                                                                               | Não comprovada                                              | Volume, frequência e direitos            |
| CarAPIs                         | Valor depende de fontes, frequência e módulos; ativação das fontes não ativas sob cotação | 100 requisições/dia; limite de posição 10.000 por consulta  | Não há orçamento BR confirmado           |
| ReefAPI                         | Créditos e assinatura; tabela abaixo                                                      | 1.000 créditos iniciais anunciados, não mensais             | Direitos das fontes e teste              |
| Apify Actor consultado          | US$ 5 por 1.000 resultados anunciados                                                     | Não considerada na conta                                    | Detalhes/execução/planos e cobertura BR  |
| Bright Data dataset Marketplace | A partir de US$ 250/100.000 registros, compra única                                       | Não considerada                                             | Mínimo efetivo para recorte BR e refresh |

Fontes: [OLX](https://developers.olx.com.br/anuncio/api/home.html), [Webmotors](https://portal-webmotors.sensedia.com/api-portal/documentacao), [Mercado Livre](https://developers.mercadolivre.com.br/pt_br/itens-e-buscas), [CarAPIs planos](https://carapis.com/developers/plans/), [ReefAPI preços](https://reefapi.com/pricing), [Apify](https://apify.com/apify/facebook-marketplace-scraper), [Bright Data](https://brightdata.com/products/datasets/marketplace). A ausência de preço não significa zero. Contratos de dados não devem ser estimados pelo preço de publicar um anúncio.

## ReefAPI: assinatura não é o custo total

A página observada exibia desconto anual:

| Plano      | Créditos/mês | Equivalente mensal anual | Cobrança anual antecipada | Base mensal sem desconto exibida | Top-up exibido / 1.000 créditos |
| ---------- | -----------: | -----------------------: | ------------------------: | -------------------------------: | ------------------------------: |
| Pro        |       10.000 |                 US$ 7,50 |                    US$ 90 |                           US$ 15 |                        US$ 1,72 |
| Ultra      |       50.000 |                   US$ 25 |                   US$ 300 |                           US$ 50 |                        US$ 1,15 |
| Enterprise |      300.000 |                  US$ 100 |                 US$ 1.200 |                          US$ 200 |                        US$ 0,77 |

Confirmar no checkout validade das recargas, incrementos de compra e condições da modalidade mensal; os cálculos seguintes usam **apenas a modalidade anual exibida e top-ups indicados**. Não houve cotação ou compromisso. [Tabela original](https://reefapi.com/pricing).

### Hipótese A: lista em lote, menor custo e menor garantia

Hipótese de planejamento: páginas de 100, uma varredura por dia, 30 dias, um único inventário de N registros, busca custando dois créditos. Não inclui detalhe individual, chamadas vazias, filtros sobrepostos, reposição de anúncios ou outras fontes.

`requisições/mês = 30 × ceil(N/100)`; `créditos = 2 × requisições`.

| Inventário | Páginas/dia | Requisições/mês | Créditos/mês |
| ---------- | ----------: | --------------: | -----------: |
| 1.000      |          10 |             300 |          600 |
| 10.000     |         100 |           3.000 |        6.000 |
| 100.000    |       1.000 |          30.000 |       60.000 |

Isso é limite inferior ilustrativo, **não orçamento de monitoramento garantido**. Resultados podem mudar durante a paginação; há teto por consulta e cinco ordenações documentadas, sem garantia de ordenação por atualização. Anúncios acompanhados podem sair do recorte. Não inferir venda ou exclusão só pela ausência. [Contrato técnico consultado](https://reefapi.com/docs/webmotors).

### Hipótese B: acompanhamento individual diário e descoberta em lote

Para reduzir dependência da presença em uma busca, reconsultar cada URL acompanhada uma vez/dia: dois créditos por detalhe, além da descoberta da hipótese A. Supõe URLs válidas e chamadas bem-sucedidas. Não inclui histórico prévio, referência extra, múltiplos portais, chamadas para checar remoção ou particularidades de faturamento.

`C = 30 × [2N + 2ceil(N/100)]`.

| Cenário  | Anúncios | Chamadas/mês (busca + detalhe) | Créditos/mês | Menor custo calculado entre planos exibidos, anual equivalente |
| -------- | -------: | -----------------------------: | -----------: | -------------------------------------------------------------: |
| MVP      |    1.000 |                         30.300 |       60.600 |                               Ultra: US$ 37,19/mês equivalente |
| Inicial  |   10.000 |                        303.000 |      606.000 |                         Enterprise: US$ 335,62/mês equivalente |
| Expansão |  100.000 |                      3.030.000 |    6.060.000 |                       Enterprise: US$ 4.535,20/mês equivalente |

Exemplo MVP: `25 + ((60.600−50.000)/1.000) × 1,15 = 37,19`. Há US$ 300 de assinatura anual antecipada, além das recargas; não é compra mensal de US$ 37,19. A expansão ultrapassa a faixa para a qual o fornecedor anuncia plano customizado: usar o número apenas como extrapolação aritmética, pedir cotação. Não é proposta contratável nem prova de capacidade.

Sensibilidade de frequência, mantendo o mesmo universo e somando varredura a cada ciclo:

| Anúncios | Créditos com 4 ciclos/dia | Créditos com 24 ciclos/dia |
| -------- | ------------------------: | -------------------------: |
| 1.000    |                   242.400 |                  1.454.400 |
| 10.000   |                 2.424.000 |                 14.544.000 |
| 100.000  |                24.240.000 |                145.440.000 |

Polling mais rápido que a atualização real da fonte pode apenas aumentar custo. O limite da API intermediária não assegura a mesma capacidade no portal de origem. O modelo precisa ser recalibrado depois de amostra real e contrato de freshness. Consultas a novos anúncios além do universo N aumentam o denominador; N monitorados não é sinônimo de N resultados totais da pesquisa.

## Outros provedores: simulações separadas

**CarAPIs:** a [quota publicada](https://carapis.com/developers/plans/) é por requisição, não linha: Free 100/dia; Production 5.000/dia; Scale 25.000/dia. A frequência de coleta depende da fonte. Sem tamanho de página/contrato efetivo da conta, nenhuma promessa de que o free suporta um MVP. Fórmula para uma página útil de P anúncios, F varreduras/dia: `Qdia = Fceil(N/P) + detalhes + descoberta adicional`; custo = proposta comercial + infraestrutura. Uma simulação meramente operacional com P=100 e F=1 exigiria 10/100/1.000 páginas por dia nos três cenários, mas **P=100 é hipótese**, e quota não ativa uma fonte ausente. Inicial e mensal: não determinados; solicitar cotação.

**Apify:** aplicando a tarifa anunciada de US$ 0,005 por resultado a uma observação diária de cada registro por 30 dias: 1.000 → US$ 150/mês; 10.000 → US$ 1.500; 100.000 → US$ 15.000. São cálculos, não faturas. Consultar detalhes adicionais, execução, retries faturáveis e plano. É alternativa potencialmente cara para polling frequente, mas não pode ser declarada economicamente inviável sem orçamento e receita-alvo. Fonte: [Actor consultado](https://apify.com/apify/facebook-marketplace-scraper).

**Bright Data:** a taxa mínima anunciada equivale aritmeticamente a US$ 0,0025/registro. Aplicá-la linearmente daria US$ 2,50 / 25 / 250 por snapshot de 1 mil / 10 mil / 100 mil; **os dois primeiros não são preços de compra comprovados**, pois o mínimo do produto/recorte pode ser US$ 250 ou outro valor cotado. Trinta entregas com essa hipótese dariam US$ 75 / 750 / 7.500; não há validação de preço, cobertura BR ou entrega diária nesses números. Fonte: [produto Marketplace](https://brightdata.com/products/datasets/marketplace).

## Infraestrutura: reserva de planejamento, não preço de fornecedor

Não contratar cloud antes do piloto. O núcleo local existente não cobra assinatura de infraestrutura; máquina, energia, backup e trabalho têm custo e não foram medidos.

Para um serviço hospedado, reservar **estimativamente** US$ 20–60/mês (MVP), US$ 60–180 (10 mil), US$ 200–800 (100 mil), fora dados, impostos e trabalho. Esses intervalos são orçamento de engenharia, sem cotação: processo web + worker, armazenamento persistente, backup e observabilidade. Não são dimensionamento validado nem oferta comercial. O app atual precisa de segurança e paginação antes de operar como SaaS.

Estimativa de armazenamento sem baixar fotos: 2 KB/anúncio, mais 120 bytes por evento de preço incluindo índice (hipóteses não medidas). Com uma alteração/dia durante 365 dias: aproximadamente 46 MB / 458 MB / 4,58 GB nos três tamanhos, antes de backups, WAL, logs e folga. Mudanças menos frequentes reduzem o histórico; não registrar snapshot idêntico em cada polling. Medir bytes reais no piloto. Fotos armazenadas mudam o custo e exigem licença própria.

MVP ilustrativo na hipótese B ReefAPI: `US$ 37,19 + reserva US$ 20–60 = US$ 57,19–97,19/mês equivalente`, com assinatura anual antecipada, recargas e direitos ainda pendentes. **Não é orçamento aprovado de produto comercial.** No caminho recomendado de parceria, o custo total continua `cotação dos dados + infraestrutura + manutenção`.

## Viabilidade de negócio

Não há base para declarar nenhuma fonte paga “economicamente inviável” em absoluto sem preço de venda, margem, número de clientes e contrato. Há modalidades inadequadas: pagar anúncios próprios não compra direito de buscar terceiros; pagar assinatura de agregador não cria um feed que está sob demanda.

Critério proposto: `clientes mínimos = teto(custo mensal total / contribuição líquida por cliente)`. Substituir contribuição por receita menos tributos, pagamento, suporte e custos variáveis. Separar implantação, anual antecipado, manutenção de conectores e reserva de falha de fonte. Definir teto de gasto antes de qualquer teste pago; manter um contador de quota e interromper quando atingir o teto aprovado.
