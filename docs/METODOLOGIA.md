# Metodologia da inteligência automotiva

Implementação: `src/lib/intelligence.ts`. Regras compartilhadas por radar, detalhes, comparador e exploração. Os testes estão em `tests/intelligence.test.ts`. Este documento descreve o código implementado nesta etapa; não pressupõe dados de fornecedores que não estejam no catálogo.

## Universo e significado dos dados

- A unidade das métricas de catálogo é o **registro cadastrado** em `Vehicle`. Não representa todo o mercado, volume de vendas nem estoque confirmado. Cadastros repetidos continuam preservados no banco.
- `createdAt` é a data de cadastro local, não a publicação do anúncio. `updatedAt` também muda ao favoritar e, por isso, **não é usado para recência financeira**.
- A data de registro do preço vem do histórico `VehiclePrice`; o endpoint do catálogo fornece os dois registros mais recentes e `priceRecordedAt`. O detalhe pode fornecer o histórico completo. Em registros legados sem esses metadados, usa-se somente `createdAt`, de forma conservadora.
- O histórico registra cadastro e alteração do preço. Ausência de nova alteração não prova que o veículo continua anunciado. Nenhuma regra infere venda, liquidez, segurança mecânica ou prazo de revenda.
- Preços são **centavos inteiros**. Conversão para reais ocorre apenas na apresentação. Mediana de dois valores com meio centavo é arredondada ao centavo mais próximo; o máximo de compra é arredondado para baixo para não exceder a margem-alvo.
- `referenceCents` é uma referência **informada manualmente pelo usuário**. Não é FIPE. Nesta base não há código FIPE, mês de referência, correspondência verificada nem provedor licenciado configurado; nenhuma tela deve apresentar essa referência como FIPE.
- Descobertas OLX/Gecko e Webmotors/Reef permanecem separadas do catálogo. O contrato atual dessas descobertas não fornece versão e combustível suficientes para equivalência estrita, nem licença de fotos. Não são adicionadas silenciosamente ao universo comparável.

## Comparáveis e recência

Um candidato precisa ter a mesma marca, modelo, versão, ano-modelo, combustível e UF. A comparação normaliza caixa, acentos e espaços; não aproxima modelos ou versões diferentes. Se qualquer um desses atributos faltar no alvo, o resultado é **Dados insuficientes**. Não há associação automática com um catálogo de versões: a identificação depende do cadastro.

São elegíveis preços positivos cujo último registro tenha menos de **45 dias**, sem datas futuras. Os mesmos critérios valem para alvo e pares. A marcação de favorito não renova esse prazo. Quando não houver atualização do preço, será preciso interpretar esse limite como restrição conservadora da amostra, não como confirmação de anúncio removido.

O próprio registro é excluído. URLs originais iguais são deduplicadas para formar os pares, removendo fragmentos e parâmetros de rastreamento `utm_*`, `fbclid`, `gclid` e `msclkid`. Demais parâmetros de URL são preservados. Entre cópias usa-se o preço com registro mais recente; uma cópia da URL do alvo também é excluída. Não se fundem registros sem URL só porque modelo, preço ou localização coincidem.

Depois da exclusão do alvo, calculam-se Q1 e Q3 por interpolação linear (posição `(n − 1) × p`). Com ao menos cinco candidatos, são excluídos preços fora de `[Q1 − 1,5 × IQR; Q3 + 1,5 × IQR]`, com `IQR = Q3 − Q1`. A quantidade de comparáveis sempre corresponde à amostra **após** essa exclusão.

São necessários pelo menos **5** pares. A dispersão é `IQR / mediana`. Acima de **0,30**, a amostra não sustenta classificação. Um alvo mais de **30% abaixo** da mediana também recebe Dados insuficientes e orientação para conferir identificação, condição e preço; um valor muito baixo não é automaticamente vantajoso.

## Regras de classificação

O desconto relativo é `(mediana dos pares − preço anunciado) / mediana dos pares × 100`. Sinal positivo significa preço menor que a mediana. A faixa apresentada contém mínimo e máximo dos pares após remoção de extremos. O percentil é a proporção de pares abaixo do alvo, com metade do peso para empates.

| Classe                         | Condição após os critérios de suficiência                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Oportunidade forte             | Pelo menos 8 pares, desconto de 10% a 30%, dispersão até 0,30 e redução registrada de pelo menos 2% nos últimos 30 dias |
| Potencial oportunidade         | Pelo menos 5 pares e desconto de 5% a 30%                                                                               |
| Preço alinhado aos comparáveis | Desconto menor que 5%, com preço no máximo 5% acima da mediana                                                          |
| Acima dos comparáveis          | Preço mais de 5% acima da mediana                                                                                       |
| Dados insuficientes            | Identidade incompleta, preço sem recência, poucos pares, dispersão alta ou desconto extremo                             |

A suficiência é moderada com 5–7 pares e alta com pelo menos 8, depois das demais verificações. **Suficiência da amostra não significa confiança no estado do veículo nem garantia de compra segura.**

Os limiares utilizam percentuais antes do arredondamento de apresentação. Um desconto exibido como 5,0% pode estar ligeiramente abaixo de 5% e continuar na faixa alinhada; o valor monetário permanece disponível para conferência.

Não existe pontuação oculta nem soma de sinais correlacionados. Os limiares ficam em `OPPORTUNITY_RULES`; funções aceitam configuração explícita para evolução controlada. O preço relativo estabelece a faixa de avaliação; a redução registrada é uma condição adicional para a classificação forte. A referência manual não participa da classificação. Quilometragem, conservação, avarias, custos de financiamento e histórico mecânico não estão ajustados nesse modelo e são limitações explícitas.

`analyzeVehicles` prepara grupos ordenados uma vez e calcula fatias sem o alvo com busca binária, evitando ordenação repetida de toda a amostra. O processamento em lote omite listas de IDs comparáveis por padrão para evitar memória quadrática; o detalhe as obtém por `analyzeVehicle`.

## Coerência dos filtros

`filterIntelligentVehicles` aplica filtros de catálogo e filtros analíticos, mas mantém o **universo completo** para a classificação dos comparáveis. Filtrar um preço máximo não remove os pares mais caros da referência e não muda artificialmente a classificação do mesmo veículo. `marketSummary` recebe o conjunto filtrado para os indicadores e o universo completo para o motor de oportunidades.

Busca textual continua parcial, preservando o comportamento existente. Links de detalhamento de grupos usam `exactMatch` para correspondência exata normalizada de marca, modelo, versão e fonte; assim, um grupo “Gol” não passa a incluir “Gol G5” ao abrir o radar.

O filtro de dias significa **cadastro local no período**. Redução significa queda entre registros de preço sucessivos, de até 30 dias. Novos registros iguais não tornam uma redução antiga recente. Reduções não equivalem a depreciação de mercado.

## Métricas de mercado

- Contagem: registros do recorte, com preço válido; não uma estimativa do mercado nacional. Preservam-se registros repetidos no total do catálogo; somente a amostra de comparáveis é deduplicada por identidade confiável.
- Mediana: valor central dos preços cadastrados do recorte; menos sensível a extremos que a média.
- Referência manual: desconto `(referência informada − preço) / referência informada × 100`. A cobertura contabiliza apenas registros com referência válida. Ausência não é zero. O helper legado `opportunity` mantém seu sinal original de variação `(preço − referência) / referência` para compatibilidade.
- Oportunidades: quantidade de registros classificados como fortes ou potenciais, usando o universo qualificado completo. Não são negócios concluídos nem recomendação de compra.
- Grupos: marca e modelo, com quantidade, mediana, oportunidades, desconto mediano frente às referências manuais e dispersão interquartil. A mistura de anos e versões pode explicar a dispersão do grupo; o motor individual continua estrito.
- Histograma: classes em centavos, sem sobreposição, com limites inferior e superior inclusivos. Todos os preços válidos entram exatamente uma vez.
- Última data: registro mais recente de preço na amostra. Não é data de sincronização global nem validação de disponibilidade na fonte.

Não se produz série temporal de “preço de mercado” a partir da data de atualização dos cadastros. O histórico individual é mostrado somente quando há registros. Variação de composição da amostra não demonstra tendência nacional.

## Simulação de compra

Todos os valores são informados ou confirmados pelo usuário. Custos opcionais começam em zero de forma explícita; não representam estimativas fiscais automáticas. Cada valor monetário deve ser um inteiro não negativo em centavos, e a margem-alvo deve estar entre 0% e menos de 100%.

```
custos = preparação + transporte + documentação + tributos + outros
capital necessário = compra + custos
resultado estimado = venda hipotética − capital necessário
margem estimada = resultado estimado / venda hipotética × 100
compra máxima = piso(venda hipotética × (1 − margem-alvo / 100) − custos)
```

Margem usa receita de venda como denominador; não é retorno sobre capital investido. Venda zero produz margem indefinida, e valores negativos de resultado ou de compra máxima são preservados para mostrar perda ou inviabilidade. A sensibilidade varia a venda em −10%, −5%, 0%, +5% e +10%, mantendo os custos. Nenhum cenário é apresentado como lucro garantido.

## Limitações a resolver com dados autorizados

FIPE exige fonte autorizada/licenciada, mês, código, correspondência de versão/ano-modelo/combustível e data de atualização. Não inferir FIPE da referência manual. Fotografias dependem de URL real e permissão da fonte. Para maior escala, evoluir filtragem no servidor e observações explícitas de disponibilidade; paginação visual não substitui essas estruturas. Antes de ampliar regras, validar uma amostra auditada de anúncios comparáveis e preservar este conjunto de testes.
