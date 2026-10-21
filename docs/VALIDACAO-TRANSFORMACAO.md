# Validação da transformação

Ambiente: Linux, Node.js 24.19.0, npm 11.9.0, Next.js 16.4.2, Chromium 154. Data: 21/10/2026 (America/Sao_Paulo).

## Linha de base, antes das alterações

Código remoto efetivamente examinado: commit `5626b17`. O checkout inicial da sessão estava desatualizado; a validação abaixo refere-se à aplicação Next.js real, obtida antes da implementação.

| Comando | Resultado observado |
| --- | --- |
| `npm ci --no-audit --no-fund` | 461 pacotes instalados pelo responsável pela implementação; cache temporário devido à restrição de escrita no diretório pessoal |
| `DATABASE_URL=file:/tmp/car-router-baseline.db npm run setup` | Cliente Prisma gerado e migrações aplicadas pelo responsável pela implementação |
| `DATABASE_URL=file:/tmp/car-router-baseline.db npm run typecheck` | Aprovado, sem diagnóstico |
| `npm run lint` | Aprovado, sem diagnóstico |
| `npm test` | 38 testes aprovados em 5 arquivos; 23,61 s |
| `DATABASE_URL=file:/tmp/car-router-baseline.db npm run build` | Aprovado: compilação Webpack, TypeScript e geração das páginas concluídos |

As quatro migrações existentes são aplicadas em SQLite temporário. Os testes Vitest usam diretório temporário próprio, removido pelo script após encerrar os processos. Os provedores de anúncios são simulados nos testes; não foram feitas consultas reais aos provedores.

## Cobertura existente identificada

- Validação, normalização, filtros, ordenação e diferença frente à referência manual.
- Persistência, favoritos, CRUD e reconexão ao SQLite.
- Histórico apenas nas alterações reais de preço, rollback e baseline de migração aditiva.
- Guarda de origem e rejeição de entradas inválidas.
- Descoberta: URLs e localidades válidas, qualidade dos resultados, unidade monetária, busca salva sem custo, observações e cooldown, falhas parciais, limites de orçamento, restrição ao plano gratuito e exclusão de execuções concorrentes.

## Lacunas identificadas na linha de base

O roteiro original de navegador exercitava 390 e 1440 px, cadastro/edição/exclusão, favoritos, comparação, filtros e persistência após reinício. Não cobria as páginas analíticas novas, simulação, histórico na interface, tamanhos intermediários, erros de rede, filtros por URL ou busca salva. O roteiro foi ampliado para os fluxos registrados abaixo.

Não há medição de campo de Core Web Vitals, auditoria formal WCAG, teste de carga nem máquina Windows disponível. Nenhum resultado desses itens deve ser inferido de build ou testes unitários.

## Navegador na linha de base

O roteiro original `scripts/browser_check.py` passou integralmente contra o build de produção da linha de base: CRUD, persistência após recarregar e reiniciar o servidor, filtros combinados, ordenação, favoritos, comparação com dois/três veículos, referência manual, registro ausente e menu mobile. Nenhuma exceção JavaScript foi registrada. Os seis screenshots foram salvos em `/tmp/radar-baseline-screenshots`, sem substituir as imagens versionadas. O banco temporário do roteiro foi removido ao final.

## Resultado final

| Verificação | Resultado observado |
| --- | --- |
| `DATABASE_URL=file:/tmp/car-router-final-validation.db npm run setup` | Aprovado; geração do cliente e cinco migrações aplicadas a SQLite isolado |
| `npm test` | 94 testes aprovados em 7 arquivos; 24,13 s |
| `npm run lint` | Aprovado, sem diagnóstico, após a correção final do tratamento de rede |
| `DATABASE_URL=file:/tmp/car-router-final-validation.db npm run typecheck` | Aprovado, sem diagnóstico |
| `DATABASE_URL=file:/tmp/car-router-final-validation.db npm run build` | Aprovado no código final, incluindo a reserva de altura do skeleton; compilação 10,6 s e TypeScript 10,0 s, com geração e rastreamento concluídos |
| `python scripts/browser_check.py` | Aprovado integralmente em 66,304 s no build funcional anterior ao ajuste isolado do skeleton; 16 grupos de verificações, 14 capturas, nenhuma exceção JavaScript não tratada |
| Verificação dirigida de CLS no build final | Seis navegações, três em 390×844 e três em 390×1000, sem injeção de CSS: CLS 0 em todas, sem overflow |

O roteiro usa uma porta livre em `127.0.0.1`, banco temporário próprio e chaves de provedores explicitamente desabilitadas. As cinco migrações são aplicadas novamente nesse banco. O banco começa vazio; quatro registros claramente identificados como teste são cadastrados pela interface. Treze registros adicionais, exclusivos da etapa de paginação, são criados pela API e removidos em seguida. O diretório do banco e o servidor temporário são encerrados ao final. Nenhuma consulta real aos provedores foi executada e nenhuma fixture foi incorporada ao produto.

## Fluxos finais exercitados no navegador

- Estado vazio verdadeiro, cadastro, edição, exclusão com cancelamento, registro ausente e persistência após recarregar e reiniciar o processo do servidor.
- Digitação rápida sem perda de caracteres, checkbox de favorito com estado imediato, filtros combinados, URL compartilhável, retorno do detalhe ao catálogo e manutenção dos filtros após recarregar.
- Cards, lista e tabela; ordenação por preço; paginação real de 13 resultados em duas páginas, preservando filtros e ordenação na URL.
- Favoritos persistentes; criação, abertura e remoção de filtros salvos; atualização simultânea da gestão e do menu de buscas salvas, sem recarregar a página.
- Comparação com quatro veículos, limite da seleção, remoção e exibição somente das diferenças; revisão visual da linha de diferença para a referência manual.
- Histórico efetivo após uma alteração de preço e simulador com resultado que muda ao editar a hipótese de venda.
- Mercado com contagem e mediana verificadas, filtros, CSV restrito à amostra filtrada e navegação de um grupo até seus anúncios.
- Busca nos portais salva sem iniciar consulta; integrações indisponíveis informadas; contador de chamadas de execução externa igual a zero.
- Falha de rede simulada com mensagem em português e recuperação pelo botão de tentar novamente, confirmada pela renderização dos três registros restantes.
- Imagem associada ao cadastro com domínio de origem, ampliação, fechamento e retorno do foco; uso da imagem na home e fallback visível após falha da URL. A imagem dessa etapa é um SVG textual **TEST ONLY**, servido por interceptação do navegador em `example.org`; nenhuma fotografia externa é baixada nem apresentada como anúncio real. O campo é restaurado depois.

Nove rotas foram verificadas em **390, 768, 1280 e 1440 px**, totalizando **36 combinações sem overflow horizontal da página**: home, radar, mercado, comparador, favoritos, busca externa, configurações, cadastro e detalhe. Tabelas que precisam de rolagem horizontal permanecem em seus próprios contêineres.

## Correções confirmadas durante a validação

O navegador identificou e confirmou a correção da sincronização imediata dos campos de filtro com a URL, da atualização conjunta dos dois controles de buscas salvas, do texto de rede exposto em inglês e do overflow mobile de uma legenda visualmente oculta da tabela de mercado. A revisão visual também corrigiu a compressão da frase de referência na tabela comparativa. O último roteiro completo passou depois dessas alterações.

As esperas do próprio roteiro foram ajustadas para aguardar a URL efetiva de navegação e selecionar o alerta da aplicação sem confundi-lo com o anunciador de rotas do Next.js.

## Evidências geradas

O diretório ignorado pelo Git `test-results/screenshots` contém `validation-report.json`, o CSV filtrado de teste e as 14 capturas da rodada aprovada. O relatório JSON registra as verificações, zero exceções, zero consultas externas e as observações locais de desempenho. Principais imagens:

| Tela | Arquivo |
| --- | --- |
| Home vazia | `01-dashboard-vazio.png` |
| Home com registros de teste | `11-dashboard-populado.png` |
| Detalhe e simulador | `02-detalhes-teste.png` |
| Comparação com quatro veículos | `04-comparacao-teste.png` |
| Radar mobile | `08-radar-390.png` |
| Radar desktop | `08-radar-1440.png` |
| Mercado mobile | `10-mercado-390.png` |
| Mercado desktop | `09-mercado-1440.png` |

## Desempenho observado e limites

Os observadores de desempenho do Chromium registraram LCP entre **372 e 2.088 ms** e CLS entre **0,00255 e 0,16205** durante as 14 capturas, antes do ajuste específico descrito abaixo. São observações oportunistas em execução local, com registros sintéticos, incluindo navegação cliente e mudanças de viewport; não constituem benchmark padronizado de cada tela, percentil de campo ou comprovação de Core Web Vitals. As capturas e o JSON dessa rodada foram preservados como evidência histórica funcional. INP não foi medido.

### Investigação e correção do CLS mobile

Uma investigação dirigida em banco temporário com três registros identificou uma única fonte de deslocamento: `footer.app-footer`. Enquanto o skeleton carregava, o rodapé ocupava um retângulo de 358×149 px no fim da viewport; ao chegar o catálogo, saía da área visível. Em 390×844 seu início era y=695; em 390×1000, y=851. O `PerformanceObserver` registrou esses nós e seus retângulos anteriores/atuais.

Foram comparados três pares de controle/proposta em cada altura. O controle reproduziu CLS **0,1620549277** em 390×844 e **0,1367743590** em 390×1000, em todas as repetições. A regra `.loading-skeleton { min-height: calc(100dvh - 100px) }`, inicialmente injetada antes do primeiro paint, manteve espaço para o conteúdo e produziu **CLS 0 nas seis execuções**, sem overflow. Depois disso, a regra foi incorporada ao CSS da aplicação.

O build final foi refeito e a verificação dirigida foi repetida **sem qualquer injeção de CSS**: três navegações em cada altura, **CLS 0 nas seis**, sem overflow. A suíte funcional inteira não foi repetida após essa única mudança de altura do estado de carregamento; o build e o caso diretamente afetado foram validados. Esses resultados locais confirmam a correção do deslocamento observado, mas não substituem medição de campo ou verificações em outros dispositivos.

Dados brutos: [controle e proposta](screenshots/transformacao/cls-investigation.json) e [CSS compilado final](screenshots/transformacao/cls-final.json).

Não foram executados testes de carga, auditoria formal de acessibilidade, validação em Windows ou homologação de respostas atuais dos provedores externos. A navegação por controles semânticos, o menu mobile e a devolução de foco do diálogo foram exercitados, mas não substituem auditoria WCAG. As consultas reais aos portais permaneceram desativadas durante toda a validação.
