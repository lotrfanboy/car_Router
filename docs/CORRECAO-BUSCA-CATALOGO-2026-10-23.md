# Correção da ligação entre catálogo e fontes

Base atualizada de `origin/main` antes de editar: `8d282e75e5ac39e1fb3135462d96751630a444f5`.

## Falha reproduzida

A leitura do Supabase recuperou a busca `cmvkcaavz00021gi1vdoa9n2z` e a execução `cmvkcab4100031gi1p8h32ajx`, de 23/10/2026 02:17:02 UTC (22/10 23:17:02 BRT). Seleção: **AUDI A4, sem versão, PR inteiro**, sem limites de ano, preço ou quilometragem. OLX e Webmotors falharam antes da coleta, com zero créditos reservados. A fixture sanitizada em `tests/fixtures/failed-catalog-search.json` conserva os critérios e erros, e um recorte mínimo da hierarquia do catálogo. Não representa o catálogo completo nem anúncios coletados nesta tarefa.

O catálogo persistido produz entidades sem `references` e guarda os vínculos em `mappings`. O pré-requisito de `fetchSource` examinava apenas `references`, rejeitando inclusive seleções com mapeamentos aprovados. A busca BMW 320i/PR anterior, às 02:15:49 UTC, também sofreu esse bloqueio. Ausência de vínculo foi confundida com impossibilidade de consultar.

Contagens verificadas, sem alterações: 63 marcas, 1.113 modelos, 6.112 versões, 202 modelos sem versão. Há seis vínculos positivos de modelo, nenhum de versão; AUDI A4 não tem vínculo pertinente. Nenhuma migração, cron, credencial ou dado de produção foi alterado.

## Comportamento corrigido

- O planejamento usa rótulos aprovados únicos em referências ou mapeamentos; na ausência deles, usa nomes canônicos nos campos textuais suportados, explicitamente como tentativa incerta. IDs canônicos nunca viram IDs externos.
- OLX recebe texto de marca/modelo/versão em `q`. Uma URL legada continua com seus filtros próprios, explicitados, e todos os critérios selecionados continuam conferidos localmente.
- Reef/Webmotors recebe os campos reais `make`/`model`; esses nomes exigem a grafia da fonte, portanto zero resultados com grafia não validada não prova ausência. `trim` só é enviado com tradução aprovada e pais relacionados. Sem ela, a versão permanece obrigatória na conferência local, com aviso de que a coleta pode conter outras versões.
- Seleção desatualizada, IDs inexistentes, nomes adulterados ou relações incompatíveis falham antes de qualquer reserva. Marca, modelo, versão, limites De/Até independentes e estado/cidades permanecem nos critérios.
- Resultados confirmados, incertos e incompatíveis têm contagens separadas. Incertos ficam disponíveis para revisão, com motivos, e não entram como correspondências exatas. Incompatibilidade comprovada tem precedência sobre dados desconhecidos. Comparações de preço não usam identidade de catálogo incerta nem misturam versões confirmadas de IDs diferentes só por nomes iguais.
- A versão da chave de coleta mudou para evitar reaproveitar o contrato anterior; buscas e histórico salvos foram preservados.

Capacidades conferidas na documentação pública: [Reef Webmotors](https://reefapi.com/docs/webmotors) e [Gecko OLX PLP](https://geckoapi.com.br/docs/olx-com-br-plp/). Nenhum endpoint de extração foi consultado.

## Evidências locais

- Base antiga isolada: os quatro novos testes de comportamento falham; duas verificações adicionais confirmam o erro registrado e zero chamadas/reservas em ambas as fontes.
- Código corrigido: os mesmos quatro testes passam. A suíte cobre também mapeamentos aprovados, ausentes e ambíguos, versão pendente, relações inválidas, anos independentes, cidades, classificação e comparação.
- `npm test`: **199 testes em 17 arquivos**, aprovados. `npm run lint`, `npm run typecheck`, build de produção com `DATABASE_URL` SQLite isolada e `git diff --check`: aprovados.
- `python scripts/browser_catalog_regression.py`: Chromium com banco temporário real, seleção recuperada e anúncios sintéticos, 1440/390 px. Confere restauração de filtros, contagens separadas, avisos, motivos e estado vazio. Relatório e quatro screenshots em `test-results/catalog-regression/` (ignorado pelo Git), sem erros JavaScript, overflow, chamadas externas ou consumo de créditos.

O primeiro build sem `DATABASE_URL` falhou por configuração local ausente; passou após fornecer apenas um banco temporário local. Nenhuma credencial de produção foi necessária.

## Publicação e limites

Publicação autorizada na `main`, sem force-push, no serviço Render existente `srv-dbch2ud9fdbs73cqdsug`, workspace `tea-dbch2c0m7kps739pa8a0`. Auto-deploy desligado: push e publicação são ações separadas. SHA, deploy e saúde devem ser confirmados no resultado da execução.

HTTP direto ao endereço de produção foi bloqueado pelo proxy do ambiente (`CONNECT 403`, sem resposta da aplicação); a verificação remota disponível é pelo estado e logs do Render. Não houve busca real OLX/Webmotors nesta tarefa. Testes com respostas simuladas provam a lógica e preservação dos filtros, não disponibilidade, grafia aceita, equivalência ou cobertura real de anúncios. A coleta existente continua limitada a uma página por fonte/cidade.
