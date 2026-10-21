# Evidências da investigação e validação

> **Revisão após demonstração:** veja [GarimpaMotors e fornecedores](garimpamotors-e-fornecedores.md). Inclui busca pública multicanal executada, conferência de anúncios na origem, a pista Apify na gravação e GeckoAPI como candidata prioritária a prova OLX/Webmotors. Esta revisão substitui a priorização anterior de estoque de lojas como primeira solução para a necessidade do usuário.

Data: 21/10/2026 (America/Sao_Paulo). Ambiente: Windows, Node.js v22.15.1, npm 10.9.2, dependências do lockfile original. Base: `64e360c3de4426f1c21f76411b18d18deddb8bae`. Branch: `research/integracoes-2026-10-21`.

## Resultado executado nesta etapa

| Verificação                                | Resultado                                                   |
| ------------------------------------------ | ----------------------------------------------------------- |
| Acesso ao repositório pelo conector GitHub | Confirmado; árvore e README lidos antes de editar           |
| Cópia local e branch de desenvolvimento    | Concluídas; main preservada                                 |
| Instalação `npm ci --no-audit --no-fund`   | Sucesso, 451 pacotes; lockfile preservado                   |
| Geração Prisma `npm run db:generate`       | Sucesso, Prisma Client 6.19.0                               |
| `npm test` final                           | **28 testes passaram em quatro arquivos**, duração 4,10s    |
| `npm run typecheck`                        | Sucesso, sem diagnóstico                                    |
| `npm run lint`                             | Sucesso, sem diagnóstico                                    |
| `npm run build`                            | Sucesso; rota dinâmica `/api/vehicles/[id]/prices` presente |
| Banco de uso / deploy                      | Nenhum banco de uso inicializado/migrado; sem deploy        |
| Navegador desktop/mobile nesta branch      | Não executado; UI não foi alterada                          |
| Teste autenticado de fonte externa         | Nenhum; credenciais e permissões não fornecidas/aprovadas   |

Os 25 testes existentes foram preservados. Três casos foram acrescentados: ciclo real de histórico via HTTP, rollback da edição se o histórico falhar e preservação de banco do schema anterior.

## O que os testes demonstram

- CRUD, filtros/cálculos e validações existentes permanecem aprovados.
- Criação registra preço inicial; preço alterado cria evento; repetir preço, editar modelo e favoritar não criam eventos indevidos.
- Histórico persiste após desconectar/reconectar; inválidos não alteram o preço; favorito é preservado; exclusão remove o histórico e a consulta passa a responder 404.
- Um trigger exclusivo de teste rejeita a gravação do histórico. A transação falha e o preço do veículo permanece inalterado, sem evento parcial. Trigger removido no bloco de limpeza.
- Banco legado temporário recebe anúncio favorito, executa o SQL da migração nova e conserva exatamente os campos do registro anterior. O baseline usa o instante de migração, não a data antiga do anúncio.
- A limpeza da suíte ocorre no processo pai após o encerramento dos workers. O diretório é criado exclusivamente para a suíte e tem caminho pai validado antes de remoção recursiva.

O teste HTTP aplica ambas as migrações pelo `prisma migrate deploy` em banco isolado. O teste de upgrade executa os dois SQLs versionados para simular dados anteriores entre eles; não simula migração em produção.

## Falhas observadas e resolvidas

1. Clone inicial restrito falhou na resolução de rede. Repetido com a permissão do ambiente, sucesso.
2. Instalação restrita terminou com erro do próprio npm; repetição autorizada concluiu. Não houve alteração de versões para mascarar o problema.
3. Executor de testes restrito falhou com EPERM em arquivos temporários de transformação. Repetido fora dessa restrição.
4. No Windows, testes executavam as asserções, mas libSQL mantinha arquivos SQLite bloqueados até o término dos workers. Retentar a remoção no mesmo worker não resolveu. `scripts/test.mjs` agora cria o diretório pai e remove-o depois que Vitest encerra. Não se ignora erro de limpeza; ele ainda faz a execução falhar.
5. Build restrito compilou, mas falhou criando diretório de prerender. Repetido autorizado concluiu compilação, TypeScript, geração e tracing.

Avisos remanescentes: npm avisou sobre pacotes depreciados; Next.js avisou sobre um lockfile no diretório pai fora deste repositório e o ignorou. Nenhum dos dois foi removido ou atualizado incidentalmente. Nenhuma auditoria completa de segurança/dependências foi realizada.

## Evidências externas e seus limites

| Verificação                                     | Resultado real                                                       | O que não prova                                             |
| ----------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| OLX documentação oficial de anúncios publicados | Lida; listagem vinculada ao anunciante/token e paginação documentada | Busca global, preço de parceria ou chamada autenticada      |
| Facebook termos de coleta                       | Redirecionamento a login e bloqueio no leitor web; sem contorno      | Conteúdo integral dos termos atuais ou licença              |
| Meta página oficial de combate a scraping       | Lida; exigência de permissão identificada                            | Acesso concedido ao CarRouter                               |
| Mercado Livre busca por leitor web sem token    | Ferramenta retornou URL inacessível                                  | Não é medição de status HTTP 403 da API                     |
| CarAPIs OLX/Facebook/iCarros/Mobiauto           | Páginas específicas indicam fonte não ativa no feed contínuo         | Não prova que uma futura encomenda funcionará               |
| CarAPIs guia e páginas específicas              | Versões/caminhos divergentes localizados                             | Não autoriza escolher endpoint sem validar contrato         |
| ReefAPI Webmotors                               | Documentação, tarifa e exemplo do fornecedor lidos                   | Não é resposta obtida pelo CarRouter nem licença das fontes |
| Carros.com                                      | Página oficial recebe solicitação de API                             | Não confirma acesso a todo inventário, preço ou prazo       |
| CarroQuente e Webmotors/CarAPIs específico      | Algumas aberturas falharam no leitor web                             | Falha do leitor não prova indisponibilidade do serviço      |
| Leilões e regionais                             | Pesquisa de documentação pública; resultados insuficientes           | Ausência de resultado não prova inexistência de parceria    |

Links e contexto completos em [pesquisa-integracoes.md](pesquisa-integracoes.md). Nenhum exemplo JSON ou fixture foi apresentado como anúncio coletado. Nenhuma tentativa de CAPTCHA, rotação de identidade, conta, proxy ou endpoint interno foi executada.

## Limites e próximo marco

Não houve carga de 1.000/10.000/100.000 registros, medição de infraestrutura, execução em múltiplos usuários, nova validação de navegador ou integração remota real. O custo calculado não é orçamento contratado. A arquitetura de conectores permanece proposta até existir fonte aprovada. O próximo marco verificável é obter uma fonte autorizada e produzir evidência autenticada limitada, sem usar banco de uso.
