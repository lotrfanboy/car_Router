# Coleção unificada e painel visual — 04/11/2026

Esta entrega substitui a simplificação anterior da jornada. Anúncios salvos da busca e cadastros manuais continuam sendo entidades distintas, com seleção compartilhada de até quatro registros.

## Entregue

- `/` e `/visao-geral`: painel com contagens reais do ambiente local, escolhas recentes, grupos da lista, origem/cobertura dos dados, favoritos manuais, consultas armazenadas e último estado registrado das fontes. Abrir o painel não coleta ofertas. Não há autenticação individual neste workspace: os indicadores são do ambiente atual, não de uma conta isolada por usuário.
- `/salvos`: ambas as origens, identificação clara, pesquisa, ordenação simples e acesso ao catálogo completo. Cards manuais mantêm favorito, referência informada e análise. Sem mesclar entidades nem contar registros como carros únicos.
- `/comparar`: fotos fornecidas ou ausência explícita, cores consistentes, destaques por preço/km/ano, barras de preço, dispersão preço × km, ficha com diferenças e históricos individuais. Não calcula um vencedor geral. Custos e condições mecânicas não são avaliados.
- Inclusão/edição manual, catálogo com filtros avançados, favoritos, análises e simulador preservados. A antiga Visão Geral rica está acessível em `/catalogo/visao-geral`.
- Dados técnicos: valores estruturados da origem/cadastro prevalecem. Motor, câmbio e combustível só são extraídos do texto explícito da versão quando não ambíguos; proveniência e conflitos ficam visíveis. Essa projeção não altera persistência, normalização de identidade nem deduplicação.
- Histórico e simulador também disponíveis no detalhe do anúncio salvo. Preço de venda da simulação começa vazio; depende de hipótese do usuário.
- Navegação principal: Visão geral, Buscar carros, Meus radares, Salvos, Comparar, Catálogo, Configurações. Sem menu Mais ferramentas. Recursos antigos continuam disponíveis com indicação de escopo manual.

## Evidência de QA

| Fluxo | Resultado |
|---|---|
| Inclusão manual inválida | Validação dos campos sem envio de POST; nome acessível dos campos permanece estável após erros |
| Criar/editar manual | Uma criação e uma edição via UI em SQLite isolado; 13 campos anteriores preservados; preço 84.000 → 82.000; histórico com dois eventos |
| Favorito manual | Persistência confirmada no banco e no detalhe |
| Buscar na lista e filtrar origem | Cadastro de QA localizado; abas com contagem correta de 15 manuais e 5 anúncios salvos |
| Comparar duas origens | Seleção conjunta, retorno do detalhe, cores, ficha, diferenças e históricos confirmados |
| Históricos | Manual: dois preços; anúncio: uma observação, sem curva de tendência inventada; IDs de acessibilidade distintos |
| Simulador do anúncio | Compra 119.900, venda hipotética 130.000, preparação 1.000: resultado bruto 9.100; nenhum registro ou coleta gerado |
| Falha manual/API 503 | Seleção preservada, anúncios disponíveis, erro/retry visíveis; painel continua funcionando |
| Falha anúncios/API 503 | Cadastro disponível, seleção preservada, cobertura 1/2 explícita |
| Falha indicadores/API 503 | Indicadores indisponíveis em vez de zeros; escolhas continuam disponíveis |
| Recuperação normal | 20 registros retornam após restaurar endpoints e recarregar |
| Mobile 390 px | Menu funciona; abas/quebra de colunas conferidas; corrigido SVG de seta que causava excesso de largura no dashboard; largura final do documento 373 px (viewport 390) |
| Teclado | ArrowRight, Home e End selecionam as abas corretas |
| Contraste calculado | Dashboard 57 textos, lista mista 311 textos e detalhe/simulador 77 textos sem falhas após ajuste do número de seção; auditoria por CSS renderizado, com inspeção visual complementar. Não equivale a certificação completa WCAG |
| Dados preservados no QA | 14 veículos e 12 preços originais intactos; adicionado 1 veículo e 2 preços. SavedSearch, SearchRun, DiscoveredListing, ListingPrice e ProviderSpend sem alterações |
| Regressão | 452 testes / 44 arquivos passaram; lint passou; build completo com TypeScript passou |

O primeiro teste paralelo com build encontrou timeout no hook de banco, sem falha de asserção; a execução serial completa passou. Um build posterior passou em compilação/TypeScript mas parou com EPERM no diretório temporário; o build completo com permissões adequadas passou. Não foram alteradas proteções do sistema.

## Limites

- Testes funcionais manuais usam dados fictícios e banco isolado; a conferência visual final do projeto principal usa apenas leituras dos dados reais.
- Um teste de estado vazio foi interrompido pela desconexão e não é contado como validado nesta rodada. Os mocks foram restaurados, sem excluir registros.
- Não foram feitos testes reais em Safari/Firefox, leitores de tela ou todos os tamanhos de telefone.
- Preço de referência manual, mediana do catálogo e média de anúncios têm métodos distintos e são rotulados separadamente; nenhum deles é declarado FIPE ou preço efetivo de venda. Os critérios legados de amostra/km/recência permanecem hipóteses do MVP.
- Conteúdo técnico ausente ou ambíguo continua desconhecido; não se presume motorização pela marca/modelo. Normalização OLX e similaridade entre anúncios não são resolvidas por esta apresentação.
- Radares/agendamento/envio automático permanecem desligados. Este trabalho não valida um alerta automático com novidade real nem consome créditos.
- Sem migração de banco, remoção de dados, alteração de chaves, commit, push ou deploy.

## Evidências locais

`C:/Temp/carrouter-user-qa-20261104/cohesion-final-data-proof.json` contém a comparação das linhas do QA. Capturas em `screenshots/cohesion-*` nesse diretório mostram o comparador misto, gráficos, mobile, detalhe e a Visão Geral manual preservada. Valores fictícios do QA são identificados e não são ofertas reais.


## Conferência final no projeto principal

Os 33 arquivos foram aplicados com comparação prévia dos hashes e backup em `validation-private/collection-cohesion-20261104/source-before`. Nenhum arquivo preparado tinha conflito com alterações concorrentes.

O antigo servidor da porta 3000 já estava desligado. Foi iniciado um novo `next dev` vinculado a 127.0.0.1:3000, com banco SQLite local explicitamente verificado e agendamento/envio automático desativados. Estado e logs em `validation-private/collection-cohesion-20261104/dev-server-*`.

Conferidos no navegador: dashboard com 3 salvos, 0 cadastros manuais, 314 anúncios observados, 315 observações de preço e 4 radares pausados; comparador com os 3 anúncios UP existentes, preços de 49.900, 62.000 e 64.900, dados técnicos explícitos, gráficos, ficha e cobertura 3/3. A seleção anterior foi reaproveitada. Nenhuma oferta ou cadastro fictício foi acrescentado ao banco principal. Auditoria de contraste renderizado: dashboard 89 textos, visão comparativa 67 e ficha 122, sem falhas nos textos amostrados. Conferência mobile da ficha: viewport 390 px, documento 373 px, tabela com rolagem interna (885 px em área de 332 px).

A impressão digital final manteve exatamente os hashes de 12 das 13 tabelas: buscas, consultas, anúncios, preços, execuções/avisos/observações dos radares, estados de fonte, e-mails, consumo, veículos e preços manuais. A tabela Radar passou de 3 para 4 registros durante atividade concorrente: o quarto foi criado em 14:06:36Z, depois do baseline das 14:04:48Z. Os três anteriores mantêm timestamps de atualização anteriores ao baseline; todos os quatro estão desativados. Esta rodada não executou POST/PATCH/DELETE no ambiente principal, e não atribui essa criação aos testes. Os hashes agregados sozinhos não provam integridade linha a linha dessa tabela alterada.

Capturas reais finais: `C:/Temp/carrouter-user-qa-20261104/screenshots/cohesion-live-dashboard.png`, `cohesion-live-comparator.png` e `cohesion-live-graphs.png`. Uma captura mobile final atingiu timeout do Chrome; a geometria foi verificada e o override de viewport foi restaurado. Isso não afetou dados nem o servidor. O teste interrompido de vazio continua explicitamente fora da cobertura final.


## Complemento: origem verificável do quarto radar e estado vazio concluído

### Quarto radar — leitura, sem atribuir autor

- Registro `cmw26x16k004v2guocldo8pmw`, nome **Meu próximo Pálio**.
- Timestamp de criação e atualização registrado no SQLite: **2026-11-04T14:06:36.092Z**. Ambos iguais; não há atualização posterior registrada.
- Vínculo: busca `cmw26nwoq003x2guog330kmlz`, **FIAT Palio · Blumenau**, SC, OLX e Webmotors, sem limites informados de ano/preço/km. A busca foi criada às **13:59:30.345Z**; sua consulta armazenada é das **13:59:40.993Z**. Isso identifica a busca de origem, não a pessoa ou cliente que criou o radar.
- Estado: `enabled=false`, `runsRemaining=0`, `lastRunAt=null`, `nextRunAt=null`. Não há RadarRun, RadarNotice, RadarObservation, RadarSourceState ou RadarEmailDelivery vinculado a esse quarto radar.
- Preferências `new_listings`, canal `both`, intervalo de 24 horas e mínimo 10% são compatíveis com a política gerenciada atual do código. A compatibilidade não comprova que o cadastro veio da interface: o POST `/api/radars` também aceita o fluxo direto e não persiste a modalidade de entrada.
- O esquema Radar não grava autor, usuário, IP, agente do navegador ou identificador da requisição. Os logs locais disponíveis pesquisados não continham uma linha POST de radar que permitisse relacionar a criação ao horário. Não foi encontrada evidência suficiente para atribuir o cadastro a Carlos, a um teste ou a qualquer outro agente. A expressão anterior “atividade concorrente” indicava apenas mudança observada entre leituras; não identifica um responsável.

### Estado vazio — pendência encerrada

Respostas vazias foram injetadas somente nas rotas GET de listagens, cadastros e indicadores da cópia QA `C:/Temp/carrouter-user-qa-20261104`. Banco e registros permaneceram intactos. Nenhuma chave real foi usada; coleta externa estava bloqueada e o servidor usava credenciais fictícias.

- Dashboard: contagens zero, ausência de ofertas ilustrativas, orientação para buscar ou incluir manualmente, sem gráfico de mercado inventado.
- Salvos: 0 registros em todas as origens, estado “Suas escolhas começam aqui”, links de busca/inclusão e botão Mostrar todos sem erro.
- Comparar: seleção 0/4, seletor desativado sem opções de veículo, chamada para escolher registros e nenhum gráfico fictício.
- Navegação Dashboard → Salvos → Comparar e ação Mostrar todos exercitadas. Contraste calculado: dashboard 57 textos e comparador 11, sem falhas nessa amostra.
- Mobile do comparador vazio: viewport 390 px, documento 373 px, zero gráficos. Override de viewport restaurado.
- Rotas GET restauradas byte a byte e modo `ok` confirmado. Após recarregar, o QA voltou a mostrar **20 registros: 5 anúncios salvos e 15 cadastros manuais**.
- Comparação SHA-256 das **31 tabelas do banco principal e das 31 tabelas do QA**, antes/depois desta verificação: nenhuma tabela alterada. Também não houve nova chamada paga ou e-mail.

Evidências: `task/empty-check-before.json`, `task/empty-check-after.json`, `task/fourth-radar-evidence.json`; snapshots de interface `C:/Temp/carrouter-user-qa-20261104/cohesion-empty-*-ax.txt`; captura `screenshots/cohesion-empty-dashboard.png`. A validação de estado vazio usa respostas controladas de API, não um novo banco fisicamente vazio; cobre a apresentação e navegação nessas respostas, não migrações/bootstrap de banco vazio. A limitação anterior de estado vazio interrompido fica superada por esta execução concluída.
