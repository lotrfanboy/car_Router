# Modelos comerciais e tradução para os portais

O seletor passa a oferecer um único modelo comercial para os agrupamentos revisados. `Celta 2P` e `Celta 4P` aparecem como **Celta**, com configuração opcional **2 portas** ou **4 portas**. `Camaro` e `Camaro (2017)` aparecem como **Camaro**; a configuração original continua disponível e restringe as versões relacionadas. Uma indicação no rótulo técnico não preenche automaticamente os filtros de ano-modelo.

## Catálogo e compatibilidade

`src/data/commercial-models.json` registra 138 famílias por marca e rótulo conhecido. A projeção sobre os 1.113 modelos da revisão ativa produz **937 modelos comerciais**, 314 aliases de registros originais e 121 configurações. As 63 marcas são preservadas. A aplicação mantém os registros técnicos e os IDs das versões, sem alterar a revisão importada no banco. Nomes fora da lista revisada permanecem completos.

Ka e Ka+, Onix e Onix Plus, HB20 e HB20S, Golf e Golf Variant e Duster e Duster Oroch permanecem distintos. O sinal `+` também participa da identidade e da chave de consulta. As tabelas do Inmetro continuam como evidência técnica; seu ciclo de publicação não é convertido em ano-modelo do veículo.

Seleções antigas são adaptadas na leitura e execução. O ID e o nome originais precisam corresponder ao alias revisado, à marca e à revisão. Uma seleção antiga de Celta 4P conserva a exigência de quatro portas; Camaro (2017) conserva a configuração específica. Salvar novamente reaproveita a busca equivalente, seu ID, histórico e vínculos com radares. Configurações e versões de outros pais, nomes adulterados e revisões incompatíveis são rejeitados antes da reserva de créditos.

## OLX e Webmotors

As consultas usam o modelo comercial. OLX recebe marca/modelo em `q`; Webmotors/Reef recebe os nomes em `make` e `model`. IDs locais e códigos de configuração não são enviados como identidades externas. Portas e configurações sem filtro remoto aprovado são verificadas localmente. `trim` continua exigindo uma tradução de versão aprovada.

`src/data/source-model-observations.json` contém atributos públicos já persistidos, suas URLs, datas e hashes dos registros usados na revisão. Os vínculos acrescentados reconhecem o modelo Webmotors **CELTA / 1143**, **CORSA / 670**, **S10 / 761** e cinco descrições completas de Celta observadas na OLX. A distinção 3P/5P das descrições revisadas do hatch corresponde a duas/quatro portas laterais. Ela não é aplicada por prefixo a descrições desconhecidas nem convertida em uma versão comercial presumida.

Uma descrição estruturada completa que coincide de forma única com um modelo/alias comercial pode identificar o modelo quando não existe vínculo de ID da fonte que contradiga essa leitura. IDs e referências já conhecidos têm prioridade; descrições longas desconhecidas, ambiguidades, versões e configurações sem evidência permanecem incertas. Vazio com grafia não validada não prova ausência do veículo.

As observações históricas e os favoritos são reclassificados na leitura a partir dos atributos originais, sem reescrever a coleta histórica. Corsa/S10 deixam de ser candidatos a uma busca por Celta. O filtro de portas participa tanto da elegibilidade quanto dos eventos de radar. A chave de coleta foi atualizada para não reutilizar o contrato anterior. As listas e os agrupamentos de mercado usam o nome comercial, enquanto os registros e critérios técnicos usados nas comparações de preço permanecem preservados.

## Validação

- `npm test`: **241 testes em 23 arquivos**, incluindo os adaptadores reais com HTTP interceptado, atributos recuperados, referências incompatíveis, portas, configurações e um banco SQLite temporário para buscas, histórico e radares.
- `npm run typecheck`, `npm run lint`, build de produção com SQLite temporário e `git diff --check`: aprovados.
- `python scripts/browser_commercial_models.py`: APIs locais reais e banco temporário; 1440 e 390 px. Confere restauração da seleção antiga, reclassificação, opções únicas, versões por configuração, limpeza de dependências e salvamento sem coleta. Zero erros JavaScript, solicitações a provedores ou consumo de créditos. Relatório e screenshots em `test-results/commercial-models/`, ignorado pelo Git.
- `python scripts/browser_catalog_regression.py`: regressão da busca AUDI A4 e separação de resultados confirmados, incertos e incompatíveis, nas duas larguras.

Os testes exercitam respostas interceptadas e observações existentes. Não houve nova extração nem migration. A coleta continua limitada ao recorte/paginação já suportado pelos adaptadores.

## Incidente de desempenho e correção

Após o primeiro deploy, os eventos do Render registraram reinícios por timeout HTTP de cinco segundos no health check `/`. A CPU se aproximou do limite de 0,15 CPU; a memória ficou abaixo do limite de 512 MB. A alteração foi revertida na `main` para recuperar o serviço durante a correção.

A leitura simultânea das buscas repetia cargas completas do catálogo no início do processo e reclassificava todos os anúncios de referência para cada busca/histórico. A resolução de cada anúncio ainda percorria modelos, aliases e versões em laços aninhados. A correção reúne cargas simultâneas em uma única promessa, consulta a revisão ativa no máximo a cada 30 segundos, conserva o catálogo válido em falhas transitórias e constrói índices por snapshot com `WeakMap`. Cada resposta de buscas salvas compartilha uma única leitura/reclassificação dos anúncios de referência, inclusive na recuperação do histórico.

A regressão cobre 40 leituras simultâneas, atualização de revisão, recuperação após falha, compartilhamento de referências e um catálogo sintético de 63 marcas, 1.113 modelos e 6.112 versões. Verifica o número de acessos às coleções para impedir a volta das varreduras completas por anúncio, sem depender da velocidade do CI.

Um ensaio HTTP local com o catálogo público completo, oito buscas e 232 anúncios sintéticos respondeu 200 a 46 requisições com concorrência de seis. O maior tempo da página `/` foi 457 ms, e o máximo das 40 requisições após aquecimento foi 111 ms. São medidas locais, não latências garantidas na instância do Render. Não houve chamada de coleta ou consumo de créditos no ensaio.

A indisponibilidade do serviço é distinta do limite diário configurado dos provedores. O histórico mostrou Webmotors/Reef bloqueado por dez créditos reservados no dia; essa proteção de orçamento foi preservada.
