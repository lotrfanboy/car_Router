# Validação da busca genérica — 22/10/2026

Base: `main` em `4a81fae3993149495e1f713fe23e875641cebc38`. Trabalho existente preservado; sem mudança de schema de banco, credenciais, planos ou segurança. Esta etapa não conclui a disponibilidade de um catálogo real; veja [levantamento e condições de adoção](search-catalog-review.md).

## Mudanças verificadas

- Ano-modelo com dois limites opcionais, livres do catálogo. Formato de quatro dígitos, limites suportados e ordem validados sem correção silenciosa. Trocar marca/modelo não muda os anos.
- Estado com zero, uma ou várias cidades. Etiquetas removíveis, limpeza na troca de UF, envio e restauração coerentes. Texto de cidade ainda não selecionado é apontado, sem transformar inadvertidamente o pedido em busca estadual. Rádios de abrangência removidos; dimensões dos controles corrigidas.
- Relações explícitas por IDs de marca/modelo/versão e referências de fonte com evidência, data, hash e revisão. FIPE não é recortada para fabricar modelos; nenhuma regra de marca/modelo/versão específico permanece no normalizador. Versão é opcional e seu seletor guarda ID, não apenas nome. Fonte sem correspondência confirmada não recebe uma consulta paga por tentativa.
- Seletores leem dados locais; somente municípios usam IBGE com cache. Não dependem de extração de anúncios. O arquivo de produção está vazio e identificado como não configurado. Os exemplos da matriz ficam exclusivamente em fixtures de teste; entrada manual é temporária e não prova equivalência entre fontes.
- Tradução para nomes/`trim` da Reef a partir dos vínculos da fonte. Identificadores `make_id`, `model_id`, `trim_id` e descrições originais são preservados; fotos vêm dos próprios anúncios. Dados de veículo originais são conservados sem persistir contatos do vendedor.
- Ano/preço/km/vendedor não são removidos nem ampliados na coleta. Semelhantes usam observações já disponíveis. O cache distingue critérios e revisão do catálogo.
- Grade identifica critérios efetivos e alterações ainda não pesquisadas. Falha, fonte não configurada, cobertura parcial e sucesso sem candidatos permanecem distintos. Recebidos, aprovados, descartados por motivo, duplicatas e registros inválidos são contabilizados; um anúncio pode ter vários motivos.

## Evidências

- `npm test`: **156 testes, 14 arquivos**, aprovados. Matriz em quatro marcas com modelos semelhantes que não podem ser agrupados, descrições comerciais divergentes com mesmos IDs, IDs conflitantes, relações inválidas, catálogo ausente/versões vazias, normalização, filtros, contagens, cache e persistência.
- `npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check`: aprovados.
- `python scripts/browser_search_media_radar.py`: Chromium real, build de produção, banco SQLite isolado. Critérios, favoritos, comparação, fotos e radar passam por APIs locais reais. A rota de catálogo real lê somente o arquivo sintético de teste; cidades, mídia e a execução paga são interceptadas.
- Fluxo desktop 1440 px, reflow 720 px e mobile 390 px com toque: marca/modelo/versão, limpeza de dependentes, anos inválidos e não existentes, cidades múltiplas/removidas, salvar/retomar, Buscar com retorno vazio, estados de falha e histórico, critérios antigos identificados, contagens de descartes, teclado e limites dos controles. Nenhum overflow horizontal nos três viewports.
- Fotos, favoritos, comparação e radar também verificados após recarga e reinício do servidor local. Nenhuma coleta externa ou envio de e-mail.
- Relatório completo e doze screenshots: `test-results/search-media-radar/`, ignorado pelo Git. O JSON registra o build, horário, cenários e número de execuções interceptadas. Os screenshots são fixtures de teste, não anúncios obtidos nesta tarefa.
- Execução final aprovada em **22/10/2026 às 14:53:33 UTC**, build **`UGs_tsg6aQmPqYWibNQ6n`**, 11 grupos de cenários, zero exceções JavaScript e quatro execuções de busca interceptadas.
- O preparo `node scripts/prepare-source-catalog.mjs` retorna `executed: false` e custo Reef de 1 crédito. A execução de coleta não foi autorizada nem feita.

## Limitações e publicação

Os testes demonstram a lógica e as interações, não a cobertura de um catálogo comprado ou equivalência real Carpedia/Webmotors/OLX. Nenhum fornecedor novo foi adotado. As correspondências e o preenchimento dos seletores em produção dependem dos dados autorizados. A entrada manual pode não reconhecer descrições comerciais diferentes.

A coleta continua restrita a uma página por fonte/cidade e informa cobertura parcial quando necessário. Zero candidatos nesse recorte não comprova ausência no mercado. As integrações ao vivo não foram exercitadas, conforme a restrição de não consumir consultas.

Mobile foi em viewport com toque em Chromium, não aparelho físico. Zoom CSS de 200% ainda produz overflow herdado da estrutura geral (media queries continuam desktop); o reflow de 720 px passa. Não houve redesign para resolver a estrutura global.

Publicação autorizada em `main`, no serviço Render existente `radar-automotivo-preview`, workspace confirmado pelo usuário. O deploy automático está desligado: push não é evidência de publicação. O deploy é acompanhado separadamente até confirmar SHA e estado `live`; resultado informado na entrega. Plano e configuração mantidos. O preview existente usa SQLite efêmero em `/tmp`, portanto não oferece garantia de durabilidade após recriação; a preservação verificada nesta tarefa é no banco local persistido, não essa garantia de hospedagem.

O acesso HTTP direto ao preview foi bloqueado pelo proxy do ambiente na investigação; isso não é resposta da aplicação. A verificação remota disponível usa estado e logs do Render. Não foi feita busca paga para testar publicação.
