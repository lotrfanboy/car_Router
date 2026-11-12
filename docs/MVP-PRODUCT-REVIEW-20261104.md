# Proposta de produto para o MVP — 04/11/2026

## Recomendação

Concentrar o MVP na jornada **buscar um carro → conferir a oferta → salvar/comparar → criar radar → receber e acompanhar novidades confirmadas**. O usuário define o carro; cadência, execução e custo pertencem à plataforma. Evitar promessa de detecção instantânea ou de compra segura. Esta é uma proposta para decisão: nenhuma ferramenta ou dado foi removido.

O diagnóstico combina código, QA no frontend novo e o menu fornecido por Carlos. A identidade Stitch agora é compartilhada, mas a arquitetura ainda contém dois produtos sobrepostos.

## Mapa atual e sobreposições

| Área/rota | Dados e função reais | Decisão sugerida |
| --- | --- | --- |
| Buscar carros `/buscar` | SavedSearch/SearchRun e anúncios externos; marca/modelo, localização, filtros, consultar e retomar | Manter como entrada principal. Explicações operacionais detalhadas em disclosure; critérios/resultados e falhas em primeiro plano. |
| Meus radares `/radares` e detalhe | Monitoramento ligado a busca salva, avisos, histórico e situação de envio | Manter. Status real, critérios, ofertas e última consulta. Criação sem frequência/número de execuções. |
| Salvos `/salvos` | Anúncios externos salvos e uma seção de favoritos manuais antigos | Manter. Uma lista principal; favoritos legados identificados enquanto não há migração aprovada. |
| Comparar anúncios `/comparar-anuncios` | Até quatro anúncios externos salvos, seleção própria | Manter como ação contextual de Salvos, não nova área principal. Comparação lado a lado não é avaliação de mercado. |
| Catálogo de veículos `/veiculos` | Vehicle/VehiclePrice manuais, CRUD, filtros, histórico e seleção própria | Simplificar e posicionar como catálogo manual/legado, secundário ou operação. Não é automaticamente a base das consultas externas. |
| Favoritos do catálogo `/favoritos` | Mesmo catálogo manual, filtro de favoritos e filtros de catálogo salvos | Sobrepõe Salvos. Propor futura convergência de favoritos, mantendo origem e histórico; nunca migrar por semelhança de nome. |
| Comparador do catálogo `/comparar` | Até quatro Vehicle; seleção diferente da seleção de anúncios | Sobrepõe o comparador de Salvos. Adiar unificação técnica até decidir a entidade única e preservar IDs/proveniência. |
| Análises do catálogo `/mercado` | Agregações/classificações dos preços manuais, não de todos os anúncios coletados | Adiar do caminho principal do MVP. Se mantido, chamar análise da amostra do catálogo e explicitar universo. |
| Visão geral do catálogo `/visao-geral` | Painel do mesmo universo manual; links para catálogo/análises/favoritos | Sobreposição de resumo e descoberta. Adiar do caminho principal; não chamar seus registros de radares de monitoramento. |
| Configurações `/configuracoes` | Fontes, limitações e diagnósticos de chaves, scheduler e e-mail | Separar conteúdo útil ao comprador de diagnóstico de operação, sem perder transparência sobre falhas/pausa. |

Há duas noções de busca salva (critérios externos e filtros do catálogo), duas listas de favoritos e duas seleções para comparar. O QA corrigiu a barra da seleção manual que aparecia nas telas de anúncios e oferecia o comparador errado: agora ela permanece no contexto do catálogo, preservando a seleção. Termos como Explorar o radar e Anúncios no radar, no painel manual, confundem estoque cadastrado com monitoramento real. Não são duplicatas de banco demonstradas; são sobreposições de experiência.

## Regras de preço atualmente espalhadas

| Regra | Anúncios externos `listing-comparison.ts` | Catálogo manual `intelligence.ts` |
| --- | --- | --- |
| Referência | Média aritmética dos comparáveis após exclusões | Mediana após exclusões |
| Recência do preço | Até 7 dias | Menos de 45 dias |
| Identidade | Marca/modelo/versão, UF, ano ±1; conflito de IDs impede comparação | Marca/modelo/versão/combustível/UF/ano-modelo exatos |
| Quilometragem | Diferença máxima max(20 mil km, 25% do km alvo) | Não compõe a classificação relativa |
| Motor/câmbio/combustível | Conflito impede quando ambos conhecidos; ausência em um lado ainda passa com aviso | Câmbio e motor não compõem a chave; combustível sim |
| Região | Prefere cidade com cinco pares, senão UF com aviso | UF |
| Amostra | Mínimo cinco; dispersão IQR/mediana ≤30%; preço alvo abaixo de metade da mediana bloqueia | Mínimo cinco; oito habilitam rótulo de suficiência maior; IQR/mediana ≤30%; diferença >30% bloqueia |
| Extremos | Exclusão por 1,5 × IQR se há ao menos cinco pares | Mesma família de regra, implementação própria |
| Classificação | Diferença para média de preços pedidos | Potencial a partir de 5% abaixo; forte requer ≥10%, oito pares e queda real ≥2%; acima se >5% acima |
| Histórico/eventos | Fonte+ID/URL e preços observados | URL/ID e histórico cadastrado; favoritar não renova data do preço |

Estes cortes são **hipóteses de implementação**, sem calibração demonstrada no mercado. Cinco anúncios não provam precisão, e “high/moderate” não é probabilidade estatística. O catálogo pode classificar pares com km e transmissão diferentes; no externo, campos desconhecidos ainda deixam comparabilidade incompleta. Assim, “Oportunidade forte” pode transmitir certeza maior do que os dados sustentam.

Os limites também aparecem em `radar-events.ts` (base/novo/queda/desconto e queda mínima de 1%), `radar.ts` (elegibilidade do resumo), facetas e projeções. Hoje um preço menor conhecido pode aparecer como queda no app, mas a rotina de e-mail exige ausência de aviso anterior: não tratar isso como e-mail de queda implementado. Concentrar contratos/política de comparação e elegibilidade, mantendo cenários de regressão distintos; não apenas mover números para um arquivo.

## Contrato recomendado para a comparação

1. Separar **preço pedido**, **referência FIPE** e **preço efetivo de venda**. O produto atual observa anúncios e cadastros, sem comprovação de venda concluída. Referência digitada manualmente não é FIPE.
2. Lado a lado pode comparar opções diferentes, deixando diferenças visíveis. Referência de preço só usa equivalentes: marca/modelo/versão identificados, ano-modelo, motor, câmbio, combustível, km e região. Dados desconhecidos não devem virar igualdade silenciosa.
3. Exibir alvo, critérios usados, contagem antes/depois das exclusões, fontes, data das observações e deduplicação. “Novo” significa observado pela primeira vez no radar; não necessariamente recém-publicado. Ausência numa página parcial não comprova venda/remoção.
4. Preferir mediana de preços pedidos e, quando a amostra permitir, intervalo central Q1–Q3. Não chamar mínimo–máximo de faixa central. Mostrar insuficiência em vez de selo de oportunidade quando a equivalência ou amostra não sustentam a leitura.
5. Ampliação de região, ano ou km deve ser explícita, reproduzível e separada da amostra estrita. Testar limites usando distribuições reais por segmento; não importar cortes do concorrente como padrão validado.
6. Deduplicar automaticamente somente com identidade demonstrada. Mesmo carro em portais distintos exige prova; foto/ano/km/cidade/preço semelhantes não bastam. Possíveis duplicatas podem ser excluídas cautelarmente da referência com motivo auditável, sem fundir registros ou apagar preços.
7. Não inferir preço justo, conservação, sinistro, avaliação mecânica ou vantagem garantida. Uma diferença de preço é um convite para conferir a oferta.

A [FIPE oficial](https://veiculos.fipe.org.br/) descreve referência nacional para negociação, com mês/ano e ano-modelo; condições particulares alteram o preço. O site oferece consulta pública e contratação da tabela completa: não pressupor API oficial gratuita ou licença para copiar toda a base. Integração FIPE fica fora do MVP até definir fonte, uso e custo.

A [ferramenta Radar de Carros](https://www.radardecarros.com.br/anuncio-esta-caro), consultada em 04/11/2026, é referência de apresentação de mediana, faixa central, posição e limites. Suas próprias regras e amostras não validam os cortes do CarRouter. Não foram copiados seus números nem dados para o produto.

## Escopo proposto e ordem

**Manter:** Buscar, detalhe e link original; Salvos; comparar até quatro; criar radar a partir dos critérios; ofertas confirmadas e revisão separadas; situação real de monitoramento/e-mail; filtros e fontes com falhas explícitas.

**Simplificar:** navegação principal Buscar / Meus radares / Salvos; comparar dentro de Salvos; detalhes técnicos recolhidos; Configurações secundárias. Um vocabulário: busca = critérios, anúncio = oferta de uma fonte, radar = monitoramento, salvo = interesse. Nenhuma frequência solicitada ao comprador.

**Adiar:** painel amplo de mercado, catálogo manual como jornada paralela, segundo comparador público, unificação destrutiva, FIPE automática, avaliação de preço justo, rankings “fortes”, fusão entre portais sem prova e novos provedores. Preservar acesso legado até decidir migração, com origem clara.

**Prioridade 1 — confiabilidade:** fechar prova de e-mail automático com oportunidade nova real e monitoramento limitado; definir teto de operação e observabilidade. Não habilitar recorrência antes da autorização de custo.

**Prioridade 2 — clareza:** aprovar escopo e nomenclatura; reduzir diagnósticos do caminho principal; distinguir salvos/legado e seleções. Validar a jornada com usuário sem remover dados.

**Prioridade 3 — comparação:** política única de equivalência e referências; primeiro mediana/amostra/data/limitações, depois eventual sinal de preço calibrado. Testes de dados insuficientes, IDs conflitantes, unknowns e ampliação explícita são critérios de aceite.

## Decisões de produto realmente necessárias

- O público inicial é comprador particular procurando um carro ou profissional gerindo várias oportunidades? Recomendação para este MVP: comprador particular, uma jornada de ofertas externas, catálogo manual como legado.
- O resumo deve incluir só anúncios inéditos no radar ou também quedas posteriores confirmadas? Recomendo suportar ambos futuramente com preferência simples; hoje não prometer o segundo como concluído.
- Qual teto financeiro e duração do piloto a plataforma pode usar, e qual público recebe os resumos? Recomendo piloto restrito a Carlos e um radar; a cadência é proposta pela operação depois de medir custo/página e cobertura, sem seletor ao usuário.

Nenhuma dessas decisões autoriza por si só gasto recorrente. O ciclo Audi já feito custou um crédito, encontrou cinco correspondentes e nenhuma novidade elegível; não enviou resumo. Os testes de envio ponta a ponta restantes são simulados. A normalização tem revisões exatas auditáveis, não cobertura universal OLX.

## Decisão posterior implementada

Carlos aprovou conectar Buscar → Salvar → Comparar, retirar Mais ferramentas e simplificar Salvos. A execução está descrita em `SAVED-COMPARISON-20261104.md`. O comparador principal usa anúncios salvos; o catálogo manual e comparador anterior permanecem em Configurações, sem migração/fusão/exclusão. As demais recomendações deste documento continuam propostas, não funcionalidades implementadas.


## Atualização posterior: preservar a riqueza do catálogo

Carlos corrigiu a proposta de simplificação: manter inclusão manual e recursos ricos, integrando anúncios salvos e cadastros sem misturar entidades. O painel e o comparador visuais desta decisão estão implementados e documentados em [COLLECTION-COHESION-20261104.md](./COLLECTION-COHESION-20261104.md). A retirada dos recursos manuais da jornada deixou de ser a decisão vigente.
