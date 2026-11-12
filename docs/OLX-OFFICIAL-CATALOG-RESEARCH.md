# Pesquisa de fontes para normalização geral OLX — 03/11/2026

## Resultado

Foram encontrados dois pacotes já disponíveis em `C:\Users\Sisplan\Downloads`: `catalogo-radar-primeira-base.zip` e `catalogo-radar-primeira-base (1).zip`. O conteúdo canônico é idêntico. O primeiro tem SHA-256 `d91967d3cc58fcc87b2cd80f9cd2644ebc80ed2c5c539b1a8e0c4eec1ad1e43b`; o segundo, `f363496a22470e5b93a81152f978a63925a681bee4c4712e320fcca357ffa54b`. O segundo inclui um arquivo de prompt adicional, que não foi tratado como instrução nem executado.

O SHA-256 de `canonico/catalog.json` é `6dfa65f36047d6dcadd8bc3afe47cc8f042908875a7b57182721597bff776794`, igual ao registro interno de validação. Foram extraídos somente oito arquivos JSON para uma cópia de QA isolada. Nenhum código dos ZIPs foi executado.

O validador já existente do projeto, executado com `--dry-run`, `DATABASE_URL` ausente e rede externa bloqueada, aprovou: **63 marcas, 1.113 modelos, 6.112 versões, 12.239 evidências, 202 modelos sem versão aceita, 2.472 evidências pendentes e 18 registros de correspondência**. A revisão resultante seria `radar-r2-6dfa65f36047d6dc`.

Isso demonstra integridade estrutural do pacote, sem comprovar toda a semântica das extrações. Os PDFs originais não estão dentro dos ZIPs; seus bytes não foram obtidos ou conferidos nesta pesquisa. As pendências continuam pendentes. O pacote não foi importado no banco nem ativado.

## Ensaio com todos os anúncios salvos

Dois testes offline construíram a projeção do pacote em memória, usando o código real de resolução e os 206 anúncios sanitizados já disponíveis. O teste usa uma data fictícia explícita apenas para preencher o esquema em memória; ela não é evidência de data de aquisição e não foi incorporada à aplicação.

| Busca | Atual: confirmados / incertos / incompatíveis | Pacote mantendo IDs salvos | Pacote com nova seleção em memória |
|---|---:|---:|---:|
| BMW 320i SC, 50 anúncios | 39 / 1 / 10 | 0 / 0 / 50 | 39 / 0 / 11 |
| Audi A4 PR, 50 anúncios | 5 / 0 / 45 | 0 / 0 / 50 | 5 / 0 / 45 |
| Mercedes C180 SP, 50 anúncios | 30 / 0 / 20 | 0 / 0 / 50 | 30 / 0 / 20 |
| Passat SC, 56 anúncios | 12 / 24 / 20 | 0 / 0 / 56 | 12 / 24 / 20 |

A troca direta do catálogo altera os IDs de marca/modelo usados pelas buscas atuais; todas perderiam correspondência nessa simulação. A seleção refeita existe somente em memória para medir a cobertura: não alterou os critérios salvos. Antes de qualquer ativação desse pacote é necessário planejar e testar migração explícita e auditável das identidades, ou preservar os IDs atuais e importar somente relações de fonte compatíveis.

O pacote contém oito mapeamentos de modelo revisados, todos BMW, e dez pendências de versão. Não contém o catálogo geral de descrições OLX. Mesmo depois de refazer a seleção em memória, o Passat mantém as mesmas 24 incertezas. A mudança do GT na simulação vem de uma decisão negativa antiga com escopo de sedã; não foi transferida automaticamente para a busca atual. É necessário conferir a equivalência entre o escopo dessa decisão e a família comercial atual.

## Fontes oficiais consultadas

### OLX: fonte adequada, acesso autenticado

A [documentação oficial do catálogo OLX](https://developers.olx.com.br/anuncio/api/autos/car_models.html) descreve três níveis de consulta por POST em `https://apps.olx.com.br/autoupload/car_info`: marcas, modelos por marca e versões por marca/modelo. Os exemplos exigem `access_token`. A página informa uma revisão dos identificadores em 25/09/2025; um export precisa registrar a versão/data do contrato.

Trata-se do catálogo de publicação OLX. Seu uso para reconhecer campos de anúncios coletados precisa ser validado por igualdade dos rótulos completos e pelo vínculo de marca/modelo, sem presumir que seus IDs sejam filtros aceitos pela API Gecko. Não se deve misturar IDs desse produto com IDs Reef, FIPE ou internos.

A [autenticação oficial](https://developers.olx.com.br/anuncio/api/oauth.html) é um fluxo OAuth separado. Nesta tarefa não foi criada aplicação, solicitada autorização, configurado token nem tentado reutilizar credenciais Gecko/Reef. Uma tentativa de abertura pública do endpoint não forneceu uma resposta utilizável; não houve tentativa de contornar esse limite. Nas fontes oficiais pesquisadas não foi encontrado um download completo anônimo do catálogo. Isso não prova que a OLX não possa fornecer um export mediante solicitação autorizada.

### FIPE

A [página oficial da FIPE](https://www.fipe.org.br/pt-br/indices/veiculos) informa que a consulta é feita por modelo e que não fornece API ou download da base. Não foram usados endpoints internos de sessão, serviços de terceiros, dumps ou rotas não documentadas para extrair o catálogo. A semelhança entre uma descrição OLX e um nome FIPE não comprova equivalência de identidade.

### Inmetro

O [PBE Veicular oficial](https://www.gov.br/inmetro/pt-br/assuntos/regulamentacao/avaliacao-da-conformidade/programa-brasileiro-de-etiquetagem/tabelas-de-eficiencia-energetica/veiculos-automotivos-pbe-veicular) publica tabelas anuais de veículos participantes. Elas servem para evidência técnica e revisão de famílias, com cobertura própria; não fornecem os IDs nem os rótulos completos de todas as descrições OLX. Ciclo de publicação não deve virar ano-modelo de um anúncio. O pacote local é uma extração dessas fontes, com pendências declaradas.

## Método geral recomendado e dado necessário

O próximo insumo concreto é um **export autorizado e sanitizado da árvore oficial OLX**, com:

- Marca: ID e nome original; modelo: ID, nome original e marca-pai; versão/descrição completa: ID, rótulo e modelo-pai.
- Data de obtenção, rota de cada resposta, versão do contrato, SHA-256 da resposta de dados e indicação explícita de cobertura/erros. Export parcial precisa ser identificado como parcial.
- Somente dados do catálogo: sem `access_token`, cabeçalhos de autenticação, cookies, dados de conta ou contatos.

Com esse insumo, o processo reproduzível é:

1. Validar estrutura, integridade referencial, unicidade por namespace e cobertura antes de importar.
2. Relacionar marca/modelo-pai OLX aos IDs atuais por igualdade literal inequívoca ou aliases já revisados. Pais ausentes ou ambíguos ficam pendentes. Não substituir os IDs das buscas existentes.
3. Criar relações de entrada para a **descrição completa** do catálogo, dentro daquela marca/modelo. Conferir o rótulo estruturado de cada anúncio, nunca o título. Não cortar nomes por prefixo.
4. Não ampliar automaticamente uma relação sem IDs para anúncios que passem a fornecer IDs diferentes. Detectar conflitos com correspondências positivas, negativas ou pendentes existentes; conflito impede aprovação automática.
5. Confirmar apenas o modelo/família fundamentado. Uma relação de modelo não comprova a equivalência técnica de motor, versão, configuração ou ano. Não publicar esses vínculos como novos filtros remotos Gecko.
6. Gerar relatório de cobertura/diferenças e reproduzir todos os registros salvos, com casos negativos de famílias próximas, variantes, pontuação significativa, IDs divergentes e revisões antigas. A ativação deve ser uma etapa separada, sem iniciar coleta, cron ou envio.

Esse método se aplica a todas as marcas presentes no export. Sem a árvore ou outro crosswalk verificável equivalente, implementar uma aprovação geral seria substituir evidência por heurística. Não foi acrescentada uma exceção específica para Passat.

## Deduplicação conservadora

As 206 identidades de anúncio continuam separadas. Os dez grupos apontados pela auditoria anterior representam coincidência de atributos, não identidade de veículo. A confirmação entre plataformas requer identificador verificável do veículo ou vínculo explícito entre anúncios comprovado pela fonte; apenas vendedor, foto, preço, ano ou quilometragem semelhantes não bastam.

Um vínculo futuro deve ser reversível, com status, origem, data, evidência e revisão. Ele deve preservar todos os IDs e históricos por origem. Diferença de preço entre IDs distintos não é queda histórica. Nenhuma relação de veículo foi confirmada nem registro ocultado ou unido nesta pesquisa.

## Bloqueio e preservação

O bloqueio restante é obter o export descrito ou uma base equivalente verificável, e revisar os escopos conflitantes. Uma ativação do pacote técnico local exige também resolver a transição de IDs, comprovadamente incompatível com a troca direta. Não há necessidade demonstrada de alterar as chaves dos coletores para resolver a normalização.

Nenhuma consulta paga, novo crédito, credencial, alteração de `.env`, migração, envio, cron, commit, push ou deploy foi feito. A aplicação e os dados locais permanecem preservados. Os dois ensaios adicionais passaram; o dry-run existente passou. A suíte de 400 testes e os checks da entrega anterior permanecem a referência do código da aplicação, que não mudou nesta fase.
