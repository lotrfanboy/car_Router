# Referência FIPE por competência mensal

A interface lê somente uma base local em `validation-private/fipe-reference`. Não chama BrasilAPI ou FIPE por clique, não faz varredura integral e não escolhe versão por proximidade de preço. A associação ao veículo e a atualização mensal são operações separadas. A consulta não sobrescreve a referência manual, classificação ou histórico de anúncios.

## Dependência de dados

Não foi importada uma tabela completa no projeto principal. Falta confirmar fornecedor, direitos, contrato e formato. A Fundação oferece informações para contratação em https://veiculos.fipe.org.br/. Não pressupor que o formato comercial é o JSON interno abaixo, nem que BrasilAPI autoriza extração integral. Nenhuma contratação foi feita. Não existe atualização automática ligada: após obter uma nova competência autorizada, converter seu formato para o contrato interno e importar explicitamente.

O sistema seleciona a competência disponível mais recente, sem usar uma competência futura. Se for anterior ao mês atual (UTC), mostra aviso de desatualização. Uma revisão da mesma competência cria outro arquivo e preserva os anteriores. O mesmo conteúdo não é reimportado. O importador não consulta rede nem altera banco. Os arquivos mensais também precisam entrar no backup local.

## Importação local

No PowerShell, na raiz do projeto, com `DATABASE_URL` apontando ao SQLite local:

```powershell
node scripts/import-fipe-reference.mjs --file C:\caminho\tabela-autorizada.json
```

O comando exige `DATABASE_URL=file:...` no processo; não lê ou modifica credenciais do `.env`. O limite por arquivo é 128 MB. Importações completas grandes ainda precisam de medição de memória/tempo com o arquivo real. O leitor mantém o último arquivo validado em memória e invalida o cache quando muda a revisão.

Contrato JSON interno (exemplo fictício, não é cotação FIPE):

```json
{
  "schemaVersion": 1,
  "competence": "2026-11",
  "referenceMonth": "novembro de 2026",
  "source": "Fornecedor e identificação do arquivo autorizado",
  "sourceUrl": "https://example.test/fonte",
  "rightsNote": "Identificação da licença/autorização verificada pelo responsável",
  "records": [{
    "brandKey": "marca-local",
    "modelKey": "versao-exata-local",
    "yearKey": "2018-1",
    "brand": "Marca fictícia",
    "model": "Descrição exata da versão fictícia",
    "modelYear": 2018,
    "fuel": "Gasolina",
    "code": "123456-7",
    "priceCents": 10000000
  }]
}
```

`brandKey` e `modelKey` são identificadores estáveis da importação, não códigos presumidos de uma API. `yearKey` é uma chave de ano e combustível; preservar a identificação comprovada da fonte, sem inventá-la. O importador rejeita chaves repetidas, anos inconsistentes e preços inválidos. `rightsNote` documenta a declaração do responsável, não verifica juridicamente uma licença. `importedAt` é gerado no salvamento.

Na UI, selecionar marca, descrição completa da versão, ano-modelo e combustível explicitamente. Identificação ambígua permanece para revisão humana; não usar o valor anunciado como critério de correspondência. A FIPE é referência nacional mensal, não avaliação individual ou preço efetivo de venda.

## Evidência de teste

QA usou apenas uma resposta pública individual previamente capturada da BrasilAPI, identificada como fixture QA e isolada do projeto principal. Não é uma base completa nem uma validação comercial de licença. O percurso marca → versão → ano → valor foi conferido no navegador sem incremento do registro de chamadas externas. Testes cobrem importação offline, idempotência, revisões preservadas, ausência de base e seleção exata.
