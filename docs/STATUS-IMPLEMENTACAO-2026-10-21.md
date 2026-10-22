# Estado da implementação

Base consultada: `origin/main` em `80b5213a79b68414dd028aed920b35ac234ec73d`.

## Busca

- Substituído o `datalist` de marca, descrição FIPE e cidade por um combobox com teclado, estados de catálogo e entrada manual.
- UF limpa a cidade; marca limpa modelo/versão. Respostas antigas não substituem a consulta mais recente.
- A interface chama a descrição da FIPE de “Modelo/versão FIPE”, sem presumir uma hierarquia ausente da origem.
- Audi/AUDI, Mercedes/Mercedes-Benz e C180/C-180 têm equivalência testada sem juntar versões diferentes.
- Pendente: verificar em navegador com teclado, toque e zoom; confrontar descrições FIPE com modelos reais da OLX. A normalização OLX ainda pode reduzir nomes de vários termos, e esse mapeamento precisa de amostra autorizada antes de ser alterado.

## Fotos

- O parser OLX lê fotos de `images[].url` ou `images[].webpUrl` quando presentes e rejeita URLs inválidas. Cartão e detalhe mostram “Foto indisponível” sem imagem.
- Pendente: prova ponta a ponta com anúncio real autorizado e recarregamento após persistência. Fixtures não comprovam entrega de mídia pelo provedor.

## Salvos, comparação e radar

- Anúncios salvos podem ser selecionados até quatro por IDs de origem estáveis, com seleção guardada no navegador e página própria para comparar campos faltantes.
- O estado do radar distingue configuração pendente, agendado, em andamento, sucesso e falha a partir de registros reais. O `render.yaml` mantém `RADAR_SCHEDULER_ENABLED=false`; não há execução automática comprovada.
- Pendente: teste integrado de persistência, remoção, recarga, rota de volta e scheduler. Nenhum agendamento externo foi criado.

## Gráficos

- A página de salvos usa apenas registros persistidos para distribuição de preços pedidos e relação preço × ano/quilometragem, com filtros de fonte, UF e modelo, contagem de campos ausentes, horário observado e links para os anúncios.
- O universo é **somente os anúncios salvos**, não todo o mercado nem vendas concluídas. Sem preço ou com amostra insuficiente, o gráfico informa a limitação.

## Validação e bloqueio

- `npm ci` passou com cache gravável no workspace.
- `npm run lint` passou.
- `npx vitest run tests/listing-media.test.ts tests/listing-selection.test.ts tests/radar-state.test.ts tests/search-aliases.test.ts` passou: 5 testes.
- A suíte completa e `npm run typecheck` não passaram no baseline: o cliente Prisma ainda não foi gerado. `npm run db:generate` recebeu HTTP 403 ao acessar `binaries.prisma.sh` pelo proxy permitido. Testes de integração, build, inspeção no navegador, coleta externa e deploy não foram comprovados.
- Nenhuma chave, configuração de segurança, dado existente ou serviço pago foi alterado. Não houve coleta de créditos.
