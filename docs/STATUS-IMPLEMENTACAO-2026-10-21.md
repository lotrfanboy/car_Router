# Estado da implementação

## Continuação em 22/10/2026

- A busca principal agora segue Marca → Modelo → Ano-modelo → Versão. Os anos são seletores e, para modelos FIPE agrupados, mostram apenas anos retornados para as versões reais da família; a versão é filtrada pelo ano ou intervalo escolhido.
- A localização possui os modos “Cidades selecionadas” (até 12 municípios da mesma UF) e “Estado inteiro”. Consultas municipais são executadas uma vez por cidade, com custo explicado antes da busca e deduplicação por fonte; buscas estaduais usam uma URL estadual na OLX e o recorte estadual da Reef.
- Buscas antigas com uma única `city`, histórico e URL OLX continuam legíveis. A chave anterior é reconhecida sem duplicar a busca; a URL antiga só é removida quando marca, modelo, ano ou abrangência realmente mudam.
- UF e cidade compartilham a mesma linha, altura e estrutura visual. As cidades escolhidas aparecem como itens removíveis.
- O parser Webmotors/Reef preserva imagens HTTPS fornecidas em `image_url`, `imageUrl`, `thumbnail_url`, objeto `image`, `images`, `photos` ou `media.images`, sem fabricar endereços de CDN.
- Validação: Prisma Client 6.19.0 gerado; 199 testes passaram em 14 arquivos; lint, typecheck e build de produção passaram. O roteiro Playwright passou em desktop, reflow e toque de 390 px, sem exceções JavaScript e sem extrações pagas. A resposta real da Reef ainda precisa ser conferida em uma consulta autorizada para confirmar qual variante de mídia e o recorte estadual ela entrega hoje.

Base consultada: `origin/main` em `80b5213a79b68414dd028aed920b35ac234ec73d`.

Retomada da validação em 21/10/2026 (America/Sao_Paulo), a partir de `69e239e` da branch `fix/car-router-search-media-radar`.

## Busca

- Substituído o `datalist` de marca, descrição FIPE e cidade por um combobox com teclado, estados de catálogo e entrada manual.
- UF limpa a cidade; marca limpa modelo/versão. Respostas antigas não substituem a consulta mais recente.
- A interface chama a descrição da FIPE de “Modelo/versão FIPE”, sem presumir uma hierarquia ausente da origem.
- Audi/AUDI, Mercedes/Mercedes-Benz e C180/C-180 têm equivalência testada sem juntar versões diferentes.
- Corrigidos o salvamento dos critérios sem fontes configuradas e o estado de carregamento ao trocar para uma marca manual. A consulta sem fontes conectadas informa a pendência antes de criar uma busca.
- O teclado mantém a opção ativa visível na lista e não seleciona opções ocultas durante carregamento ou erro.
- Pendente externo: confrontar descrições FIPE com modelos reais da OLX. A normalização OLX ainda pode reduzir nomes de vários termos, e esse mapeamento precisa de amostra autorizada antes de ser alterado.

## Fotos

- O parser OLX lê fotos de `images[].url` ou `images[].webpUrl` quando presentes e rejeita URLs inválidas. Cartão e detalhe mostram “Foto indisponível” sem imagem.
- Teste integrado confirma que `images[].webpUrl` atravessa o parser, a persistência e a leitura de detalhes/salvos depois de reconectar o banco.
- Pendente externo: prova ponta a ponta com anúncio real autorizado. Fixtures não comprovam entrega de mídia pelo provedor.

## Salvos, comparação e radar

- Anúncios salvos podem ser selecionados até quatro por IDs de origem estáveis, com seleção guardada no navegador e página própria para comparar campos faltantes.
- O estado do radar distingue configuração pendente, agendado, em andamento, sucesso e falha a partir de registros reais. O `render.yaml` mantém `RADAR_SCHEDULER_ENABLED=false`; não há execução automática comprovada.
- A comparação reconcilia a seleção com os salvos atuais, liberando posições de anúncios removidos por outra tela. Detalhes preservam o retorno à busca, aos salvos ou à comparação; somente origens locais explícitas são aceitas.
- Testes integrados com SQLite temporário validam persistência, reconexão e estados do scheduler, incluindo heartbeat vencido, execução, sucesso, falha, pausa e deduplicação de avisos. Provedor e e-mail são simulados; nenhum agendamento externo foi criado.

## Gráficos

- A página de salvos usa apenas registros persistidos para distribuição de preços pedidos e relação preço × ano/quilometragem, com filtros de fonte, UF e modelo, contagem de campos ausentes, horário observado e links para os anúncios.
- O universo é **somente os anúncios salvos**, não todo o mercado nem vendas concluídas. Sem preço ou com amostra insuficiente, o gráfico informa a limitação.

## Validação local

- `npm ci --no-audit --no-fund --cache /workspace/.npm-cache` passou.
- `npm run db:generate` passou: Prisma Client 6.19.0 gerado. O bloqueio anterior de acesso aos binários foi resolvido no ambiente.
- `npm test` passou: 120 testes em 13 arquivos, com migrações aplicadas a bancos temporários. Atualizada a expectativa antiga `active` para o estado `success` do radar.
- `npm run typecheck`, `npm run lint` e `npm run build` passaram com Node.js 24.19.0 e Next.js 16.4.2/Webpack.
- `python scripts/browser_search_media_radar.py` passou: oito blocos, zero exceções JavaScript, usando o build de produção com SQLite temporário, APIs reais da aplicação e catálogos/fotos de teste. Cobertura: teclado, toque em 390 px, limpeza de dependências, respostas antigas, salvamento sem credenciais, fotos e fallback, comparação/remoção/retorno, gráficos, radar, exclusão e persistência após reinício real do servidor.
- Scroll do teclado validado com zoom CSS de 100%/200%; layout responsivo validado em 720 px/DPR 2, equivalente à área de layout de uma janela de 1440 px ampliada a 200%. Não foi usado zoom pela interface do navegador nem dispositivo físico. Aplicar apenas zoom CSS a 1440 px conserva as media queries de desktop e causa overflow; o reflow de 720 px não apresenta esse problema.
- Relatório e screenshots locais: `test-results/search-media-radar/report.json` e arquivos PNG no mesmo diretório (ignorados pelo Git). Screenshots desktop, mobile e reflow foram inspecionadas.
- Nenhuma chave, configuração de segurança, dado existente ou serviço pago foi alterado. Não houve coleta de créditos.

## Render

- Serviço existente: `radar-automotivo-preview` (`srv-dbch2ud9fdbs73cqdsug`), em `https://radar-automotivo-preview.onrender.com`, ligado à `main`.
- O serviço real está com deploy automático desligado, embora o blueprint declare `autoDeploy: true`. A publicação após o merge exige disparo manual.
- Validação do novo deploy deve conferir o SHA integrado, o resultado do build, as migrações e a saúde pelo conector Render. O proxy deste ambiente bloqueou a consulta HTTP direta ao domínio com 403; isso não é uma resposta da aplicação.
- O preview permanece no plano gratuito, com SQLite em `/tmp` e sem scheduler habilitado. A validação local não comprova durabilidade no Render nem execução periódica externa.
