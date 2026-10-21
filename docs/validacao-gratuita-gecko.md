# Validação gratuita GeckoAPI — 21/10/2026

O usuário autorizou os testes gratuitos de API em 21/10/2026. Proibidos compra, assinatura, cartão, recarga e consumo pago. Teto da prova: 100 créditos gratuitos, sem obrigação de consumi-los integralmente. Nenhum conector de produção é ativado nesta etapa.

## Estado observado

- Documentação pública de OLX PLP e Webmotors PLP acessível; isso não comprova execução.
- Dashboard exige login. Cadastro pede e-mail, telefone, senha e aceite de termos.
- Usuário informou estar conectado; a sessão do navegador compartilhado continuou sem login. Nenhuma senha foi solicitada.
- Preparado `.env.gecko.local`, ignorado pelo Git, para configuração local da chave pelo usuário. Nunca publicar seu conteúdo.
- Preparado `node scripts/gecko-credits.mjs`: apenas GET autenticado de saldo, sem extração ou repetição automática. Só exibe status, duração, plano, saldo e consumo agregado; omite identificadores da conta e resposta bruta.
- Verificados sintaxe do script, exclusão do arquivo secreto pelo Git e recusa sem chave. Chave fornecida pelo usuário e configurada somente no arquivo ignorado. Não reproduzir em commits, relatórios ou mensagens.
- Acesso autenticado confirmado: HTTP 200, plano `free`, saldo inicial observado **94**. A conta já indicava 6 créditos consumidos antes desta prova. Saldo final **86**, total consumido pela conta 14: **8 créditos nesta prova**, todos no plano gratuito. Nenhuma compra, recarga ou assinatura foi acionada.

## Resultados reais

O catálogo autenticado MCP (`tools/list`) confirmou custo atual de **1 crédito** para cada OLX/Webmotors PLP/PDP. Leituras de saldo e catálogo não alteraram o saldo observado. As oito extrações retornaram HTTP 200 e reduziram o saldo em um crédito cada. Horário da prova: aproximadamente 10h55–11h02, America/Sao_Paulo.

| Extração                                          | Duração | Resultado e avaliação                                                                                                                                                                                    |
| ------------------------------------------------- | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OLX, filtros estruturados Corolla/Curitiba/PR     |  4,46 s | 50 itens, total declarado 20.032; apenas 3/50 no PR e 0/50 em Curitiba. A URL montada usou `/estado-pr/curitiba`; na própria OLX exibiu breadcrumb Brasil e resultados nacionais. Localização reprovada. |
| Webmotors REST, Toyota/Corolla/2020/Curitiba      |  5,00 s | 50 itens, total declarado 12.018. URL efetiva só `/carros-usados/pr-curitiba`, sem marca/modelo/ano. Incluiu Frontier, Fit, Jetta e publicidade 0 km. Filtros reprovados.                                |
| OLX, URL regional pública de Corolla              |  4,81 s | 50 itens, total declarado 416; 50/50 no PR, 46/50 em Curitiba. Regional inclui municípios vizinhos. 19/50 Corolla Cross, portanto o caminho Corolla não equivale a sedã estrito.                         |
| Webmotors REST, URL pública com `/toyota/corolla` | 30,93 s | URL efetiva perdeu marca/modelo; total declarado 12.012, 50 itens amplos. Não resolveu os filtros.                                                                                                       |
| Webmotors MCP, mesmos filtros estruturados        | 29,98 s | Total declarado 12.014; 50 itens, apenas um com Corolla no nome. Também perdeu marca/modelo/ano. Falha reproduzida em outra interface documentada.                                                       |
| OLX, URL da segunda página retornada              | 13,52 s | Página efetiva 2, 50 itens; interseção de IDs com página 1 igual a zero. **100 IDs distintos em duas páginas**, sem provar 100 veículos únicos.                                                          |
| OLX PDP, anúncio da primeira página               |  3,69 s | Título, preço R$ 106.900 e Curitiba/Uberaba coincidem com a listagem pública. Envelope possui camada adicional `data.data`; não reutilizar parser Webmotors cegamente.                                   |
| Webmotors PDP, anúncio conhecido                  |  3,30 s | R$ 108.000, 2019/2020, 107.900 km, Curitiba/PR, particular. Preço, anos, km e cidade conferidos na página individual aberta no navegador. Detalhes viáveis nesta amostra; busca continua reprovada.      |

As durações são amostras individuais, não percentis/SLA. Totais declarados são da fonte e não representam contagem de veículos únicos. Três entradas Webmotors da primeira página eram publicidade sem SKU/km/localização; não devem virar veículos elegíveis.

### Conferência na origem

Na [listagem regional OLX](https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/toyota/corolla/estado-pr/regiao-de-curitiba-e-paranagua), conferidos no navegador os dez primeiros cards: títulos, preço, km, ano no título e município coincidiram com a resposta. Preços, na ordem: 106.900; 135.900; 138.900; 137.900; 129.000; 99.900; 119.900; 124.900; 153.700; 129.900. Não foram abertos dez detalhes individuais. A API marcou 9/50 como particulares; classificação não auditada individualmente. IDs, preço e km estavam preenchidos nos 50 itens desta página.

No [anúncio Webmotors 80767975](https://www.webmotors.com.br/comprar/toyota/corolla/20-vvt-ie-flex-xei-direct-shift/4-portas/2019-2020/80767975?lkid=4668), dados do PDP coincidiram com o portal. A [busca pública Corolla](https://www.webmotors.com.br/carros-usados/pr-curitiba/toyota/corolla) possui filtros Toyota/Corolla, enquanto `requestUrl` nas três tentativas do fornecedor os perdeu. A falha é do caminho de consulta observado; ainda requer diagnóstico/correção do fornecedor, não permite afirmar causa interna exata.

### Decisão desta rodada

**OLX: viabilidade inicial comprovada por URL pública correta, com ressalvas. Webmotors: detalhes individuais funcionam; busca filtrada não aprovada.** Não integrar em produção nesta condição, nem esconder erro retornando estoque amplo como se atendesse aos filtros. Nenhum contato foi enviado ao fornecedor.

O segundo recorte BMW não foi executado após reproduzir falha de filtros. Paginação Webmotors, FIPE, monitoramento, remoções, atraso desde a publicação, alertas, estabilidade em 24–48 h e Facebook continuam sem validação. Não há monitor automático ativo. Próxima rodada deve priorizar correção de filtros Webmotors, filtros estritos/localização OLX e repetição em outro horário, preservando os créditos gratuitos restantes.

## Reproduzir de forma controlada

`node scripts/gecko-credits.mjs` lê somente saldo. `node scripts/gecko-probe.mjs olx-url` executa uma extração; `olx-url-page2`, `olx-detail`, `webmotors-control`, `webmotors-url` e `webmotors-detail` representam os demais casos. Para comparar MCP: `node scripts/gecko-probe.mjs webmotors-control 1 mcp`.

Cada invocação faz no máximo uma extração, exige plano `free`, saldo entre 1 e 100 e custo atual de 1 crédito confirmado no catálogo; consulta saldo antes/depois, bloqueia redirects e não repete em erro. Não oferece compra ou recarga. O script limita cada execução e não é um controle de faturamento da conta: não rodar em loop ou em conta cujo saldo tenha sido comprado. Resultados ficam somente na pasta ignorada. O argumento `page` não deve ser combinado com URL; a segunda página OLX usa a query retornada pela fonte. Casos BMW estão preparados, mas não foram executados.

## Critérios para rodadas futuras

1. Consultar `/v1/me/credits`; conferir saldo e plano com o painel. Confirmar que são créditos promocionais e que não há cobrança automática. O endpoint de saldo não informa a origem dos créditos nem configuração de cobrança.
2. Conferir custo de OLX PLP e Webmotors PLP no painel antes de extrair. A documentação pública consultada não estabeleceu o custo específico destes dois endpoints; não presumir 1 crédito.
3. Fazer uma consulta por fonte, sem retries. Conferir saldo após cada uma. Se custo incerto, saldo insuficiente, necessidade de pagamento, bloqueio ou CAPTCHA, interromper.
4. Controle: Corolla em Curitiba/PR, usados. Webmotors: Toyota/Corolla, ano-modelo 2020; OLX: categoria de carros, palavra Corolla, ordenação por data. Ano não aparece como filtro estruturado na documentação OLX consultada: verificar localmente sem prometer equivalência de filtros.
5. Segundo recorte: BMW 320i em Blumenau/SC, conforme demonstração. Registrar separadamente preço máximo R$ 120 mil, km máximo 60 mil e desconto mínimo FIPE R$ 10 mil. Não confundir ausência de campos com aprovação do critério; FIPE exige correspondência exata independente.
6. Verificar URLs e IDs, preço, ano-modelo, km, cidade e particular/loja de até dez anúncios por fonte na origem. Registrar amostra efetiva, ausências, divergências, páginas e duração. HTTP 200 com `data: null`/`notFound: true` não é prova de busca útil.
7. Só avançar para paginação e repetição com saldo gratuito suficiente. Medir frescor em nova execução; não declarar estabilidade ou alerta validado a partir de uma chamada.

Resultados brutos, se necessários à inspeção, ficam em `validation-private/` (ignorado pelo Git). Relatórios compartilháveis devem conter somente métricas e referências públicas necessárias, sem chave, dados pessoais, IDs de conta ou contatos.

## Fontes oficiais

- [Conta e créditos](https://geckoapi.com.br/docs/account/)
- [OLX PLP](https://geckoapi.com.br/docs/olx-com-br-plp/)
- [Webmotors PLP](https://geckoapi.com.br/docs/webmotors-com-br-plp/)
- [Preços e crédito inicial](https://geckoapi.com.br/precos/)

Documentação e exemplos do fornecedor não contam como resultado real da prova.
