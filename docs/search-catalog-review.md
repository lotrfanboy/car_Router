# Catálogo e busca — levantamento de 22/10/2026

Nenhuma consulta cobrada, chave nova, contratação ou alteração de plano foi feita neste levantamento. A documentação pública foi lida; as respostas de anúncios existentes no projeto foram usadas nos testes. Não foi encontrado um retorno salvo de catálogo completo.

## Reef já integrada

[`POST /webmotors/v1/makes_models`](https://reefapi.com/docs/webmotors) custa **1 crédito**. O pedido preparado é `{"vehicle_type":"car"}`; `make` permite restringir a marca. A documentação descreve a árvore de marcas/modelos da Webmotors, com a grafia esperada pelos filtros. O OpenAPI público especifica um envelope genérico: o formato interno, os identificadores e a completude da resposta ainda precisam ser verificados. Não existe, nas quatro ações documentadas, uma listagem de versões por modelo. Aceitar `trim` em `search` não comprova tal catálogo.

`node scripts/prepare-source-catalog.mjs` apenas imprime o plano. A execução real exige autorização específica para **1 crédito**, usa a credencial existente, grava resposta e proveniência em pasta ignorada pelo Git e não repete a chamada automaticamente. Um arquivo já presente impede nova execução. Não foi executada a opção de coleta.

## Contrato da Carpedia

Segundo a [documentação](https://www.carpedia.com.br/desenvolvedores/docs):

| Entidade | Rota GET                                   | Identidade e relação                                                       |
| -------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Marca    | `/api/v1/marcas`                           | `slug`, `nome`; selecionar categoria automóveis                            |
| Modelo   | `/api/v1/marcas/{marca}/modelos`           | `slug`, `nome`, marca explícita e contagem de versões                      |
| Versão   | `/api/v1/modelos/{marca}/{modelo}/versoes` | `id`/`fipeId`, `nome`, `versao`, `slug`, `anos`, marca e modelo explícitos |

As listas têm até 10 itens por página; `paginacao.totalPaginas` informa o término. `fipeId` é o identificador utilizado nas rotas da Carpedia; não é demonstrada equivalência com código FIPE de preço, `trim_id` Webmotors ou atributo OLX. Os anos informativos não devem limitar o intervalo da busca. Há versões manuais com ID negativo. Não há correspondência documentada com os IDs das integrações atuais.

A [tabela de preços](https://www.carpedia.com.br/planos) informa **R$ 0,25 por requisição de catálogo/identificação**, carteira pré-paga, sem mensalidade, recargas de R$ 20 a R$ 2.000. O custo de versões de um modelo é `R$ 0,25 × ceil(quantidade / 10)`, além das páginas de marcas/modelos. Por exemplo, 25 versões exigem três páginas: R$ 0,75. Benefícios de boas-vindas dependem de elegibilidade; não foram presumidos nem ativados. O volume total ainda é desconhecido.

Os [termos da API](https://www.carpedia.com.br/desenvolvedores/termos), revisados em 21/10/2026, exigem **contrato próprio de integrador** para dados incorporados a produto oferecido a terceiros. Acesso comum pago não basta para assumir autorização comercial do CarRouter; preço e alcance desse contrato precisam ser confirmados.

Os [termos gerais](https://www.carpedia.com.br/termos) permitem cache operacional, sem duração mínima/máxima, mas proíbem constituir base própria, reconstruir o acervo por varredura, guardar snapshots históricos ou redistribuir em massa. Exigem atribuição pública e apagar dados após encerramento da conta. Portanto, **não proponho copiar todo o catálogo Carpedia para o repositório**. Cabe confirmar contratualmente o cache necessário ao produto. As imagens desse catálogo não substituem as fotos originais dos anúncios.

## Proposta condicionada à escolha da fonte

1. Verificar primeiro a resposta Reef de marcas/modelos, quando autorizado o crédito. Reutilizar eventual exportação existente antes de chamar a API.
2. Para Carpedia, confirmar autorização de integração e cache operacional antes de contratar ou criar chave. Um piloto posterior deve ter modelos delimitados, orçamento de páginas e nenhuma coleta de anúncios.
3. Manter namespaces distintos para cada fornecedor. Associar os registros a identidades internas por dados de correspondência com evidência, data e hash. Igualdade numérica de IDs ou semelhança textual não autoriza uma associação. Ausência/ambiguidade permanece sem correspondência.
4. Traduzir identidades para os nomes aceitos por `make`, `model`, `trim` da Reef; para OLX, usar sua representação documentada e conferir localmente os atributos. Não enviar um nome Carpedia como `trim` Webmotors sem vínculo verificado.
5. Carregar seletores somente de dados já disponíveis e autorizados. Uma falta no cache não pode disparar pagamento ao selecionar. Definir um procedimento separado de atualização com custo conhecido; não fazer varredura integral da Carpedia.

## Estado da implementação

A relação genérica foi implementada e testada com dados sintéticos identificados em `tests/fixtures`; nenhum desses exemplos é regra de produção. O formato valida pais, IDs, fontes e evidências. `VEHICLE_CATALOG_PATH` aceita dados locais licenciados; não é um importador nem autorização para espelhar a Carpedia. O catálogo distribuído permanece explicitamente **não configurado**.

Marca/modelo/versão completos em produção dependem dessa decisão e dos dados reais. Enquanto isso, a entrada manual é explicitamente temporária, conservadora e pode deixar de reconhecer descrições diferentes; não resolve a relação entre fornecedores. Não se usa FIPE recortada nem páginas de anúncios como catálogo. A validação offline não comprova cobertura ou equivalência real entre fontes.

Ano, localização, resultados, preservação de buscas e traduções das integrações são alterações independentes. A publicação não deve ser descrita como conclusão do catálogo enquanto esse requisito estiver pendente.
