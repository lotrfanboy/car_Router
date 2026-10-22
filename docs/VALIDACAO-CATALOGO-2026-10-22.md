# Catálogo, correspondência e retomada da busca

Relatório histórico. Os agrupamentos e aliases descritos abaixo foram substituídos na [etapa de busca genérica](VALIDACAO-BUSCA-GENERICA-2026-10-22.md); não representam o contrato atual do catálogo.

## Base e reconciliação

- Base: `103ee04f7cbb07bdaaf16397c0ff5aa45bb82b5e` (`origin/main`, merge da PR 3). Branch de trabalho: `fix/catalog-identity-20261022`.
- A retomada do ambiente forneceu o snapshot limpo `1de85fb`, sem a branch e as alterações locais da execução anterior. A implementação atual foi feita sobre a main remota atualizada, sem reset ou sobrescrita de alterações existentes.
- A PR 3 já entregou combobox, fotos OLX, comparação, gráficos de salvos, estados de radar e ação móvel. Essas implementações foram preservadas. Esta mudança trata as lacunas de identidade e continuidade da busca.

## Comportamento entregue

- Marca mantém o código/nome FIPE separado do nome usado na consulta. Aliases como VW/Volkswagen e GM/Chevrolet não exigem igualdade literal com a fonte.
- Modelos são agrupados a partir dos registros recebidos do catálogo existente. A chave `family:` é identidade local do seletor, nunca código FIPE. Os códigos e nomes das versões originais permanecem disponíveis na resposta do catálogo.
- A consulta usa o nome do modelo; a versão é opcional e corresponde a palavras completas no atributo de versão informado pela fonte. Nenhum código FIPE é enviado como texto ao provedor.
- A normalização OLX preserva o atributo original em `sourceModel` e mantém nomes compostos. C180 Coupé, Cabriolet, Touring e SW não são aceitos como C180 genérico. Versão inferida continua identificada como inferência.
- Seleção comprometida de marca carrega modelos; digitação apenas filtra opções locais. Trocar marca limpa modelo/versão; trocar UF limpa cidade. Entrada manual exige confirmação explícita e permanece manual depois de salvar/reabrir.
- Filtros controlados e resultados anteriores permanecem durante carregamento e falhas. Cada fonte recupera sua última observação bem-sucedida, com data e critérios identificados; o histórico separado não entra na contagem atual. Falhas sucessivas ou execução interrompida não escondem a observação de outra fonte.
- Metadados de catálogo não provocam nova cobrança de consulta idêntica dentro do cache existente. Critérios salvos continuam distinguindo sua proveniência.
- As preferências de fonte desconectada podem ser salvas, conforme a interface já integrada. A configuração pendente é explícita; executar sem qualquer fonte configurada é bloqueado.

## Evidência local

- Baseline da main: 120 testes/13 arquivos; lint, typecheck e build aprovados.
- Implementação: `npm test` aprovado, **196 testes/14 arquivos**. Inclui catálogo/aliases, identidade no payload, Mercedes e modelos compostos, cache, recuperação por fonte, persistência e mídia.
- `npm run lint`, `npm run typecheck`, `npm run build` e `git diff --check` aprovados.
- Build de produção final para navegador: `nqA1It7txSaKhk9Cz-NFC`.
- Roteiro: `python scripts/browser_search_media_radar.py`. Usa Chromium, SQLite temporário e APIs reais locais para critérios, favoritos, comparação e radar. Catálogos, fotos e respostas de coleta são fixtures; não há extração externa nem e-mail.
- Roteiro final aprovado em 22/10/2026 às 01:51:48 UTC: zero exceções JavaScript, dez screenshots. Inclui retomada catálogo/manual, falha parcial seguida de falha total/interrupção, filtros preservados, teclado, favoritos, comparação, gráficos, radar e reinício do servidor.
- Relatório/screenshots locais em `test-results/search-media-radar/` (ignorados pelo Git). Desktop, toque 390 px e reflow 720 px são inspecionados. O teste de zoom CSS 200% registra overflow herdado porque preserva media queries desktop; reflow 720 px passa. Não é prova em aparelho físico ou zoom pela interface do navegador.

## Limites e publicação

- Os agrupamentos são uma interpretação conservadora dos nomes recebidos, não um mapeamento oficial FIPE↔OLX. Nomes desconhecidos permanecem completos; entrada manual cobre ambiguidades. Catálogo fora do ar tem fallback manual.
- Cobertura continua limitada a uma página por fonte. Parte dos filtros só pode ser aplicada após a coleta; vazio não significa ausência de carros em todo o mercado. Oportunidade exige comparáveis válidos.
- Parser, persistência, renderização de fotos reais quando fornecidas e fallback foram testados. Isso não comprova que o provedor ao vivo entrega fotos para todos os anúncios. Não há imagem genérica substituta.
- Consulta de leitura a `https://radar-automotivo-preview.onrender.com/api/searches` foi bloqueada pelo proxy do ambiente: `Tunnel connection failed: 403 Forbidden`. Isso não é resposta da aplicação. Não foi repetida nem contornada.
- Nenhuma coleta paga, chave, permissão, infraestrutura, migration ou registro existente foi alterado. Radar/scheduler externo e notificações reais não foram validados.
- Publicação usa somente o repositório e serviço existentes. Antes do push, reconferir main e revisão/testes. Antes do deploy, confirmar o workspace Render, conferir auto-deploy e acompanhar o SHA correto até `live`; push sozinho não comprova publicação.
