# CarRouter — situação local em 4 de novembro de 2026

## Três entregas

| Entrega | Resultado | Limite restante |
| --- | --- | --- |
| Front Stitch | Meus Radares, detalhe e formulário; shell e identidade unificados também em Buscar, Salvos e ferramentas do catálogo. Fontes locais e fotos reais. | Referência era uma tela, não um redesign de todos os módulos. |
| Monitoramento real | Um ciclo Audi A4 2016+ PR, uma página OLX, um crédito, persistência e comparação reais. | Sem novidade confirmada: nenhum resumo elegível; entrega automática real ainda não comprovada. Recorrência desligada. |
| Normalização | Correspondências exatas revisadas com fontes oficiais para Passat Highline e Nivus Highline; replay Passat: 35 confirmados, zero incertos e 21 incompatíveis. Conflitos de revisão ficam ambíguos. | BMW GT continua em revisão. Descrições OLX ainda não revisadas exigem catálogo/crosswalk verificável; não há alegação de cobertura universal. |

## Verificação

- 433 testes em 40 arquivos passaram na cópia isolada, em série, com bancos temporários e rede externa bloqueada. Abrangem normalização, filtros, duplicação por identidade da fonte, recuperação histórica, orçamento, scheduler e e-mails simulados. Sem gasto ou envio nesses testes.
- Typecheck, lint sem avisos e build passaram na cópia isolada. O build usou banco descartável, chaves vazias e automação desligada.
- Uma rodada anterior com dois workers terminou 409 testes e sofreu encerramento inesperado de worker nativo Windows. A rodada final em série concluiu todos os 433. Não é falha de asserção ocultada.
- Chrome: contagens reais Mercedes 30, Audi 5, BMW 39 confirmados e 1 BMW em revisão; três pausados e zero monitorando. Filtro Monitorando fica vazio. Cartões abrem detalhes.
- Audi: pesquisa Avant retorna 2; teto R$ 150 mil retorna 2; filtro Quedas de preço retorna zero. Nenhum evento fictício aparece.
- Versão móvel medida em 390 CSS px, sem overflow horizontal. Menu abre/fecha e Escape devolve foco ao acionador. Formulário tem só busca e nome, sem frequência/cota; foi inspecionado sem criar registros novos. Override do viewport restaurado.
- Um aviso do HMR CSS do Next durante alterações foi identificado em `mini-css-extract-plugin/hmr`; recarga completa usada para inspeção final. Nenhuma alteração no fornecedor.
- Hashes dos onze conjuntos de dados antes/depois da validação visual são idênticos ao estado após o ciclo autorizado: 4 buscas, 5 consultas, 208 anúncios, 209 preços, 3 radares, 4 execuções, 108 avisos, 152 observações, 3 estados de fonte, 2 entregas anteriores e 6 reservas de fornecedor.

## Operação local

O processo existente em `http://127.0.0.1:3000` foi preservado. Abra `/radares` para conferir a entrega. Se precisar iniciar depois de encerrar o servidor, use `npm run dev` na raiz do projeto com o `.env` local já preenchido; `INICIAR-LOCAL.cmd` intencionalmente remove chaves dos provedores do processo.

Não existe monitoramento recorrente habilitado: scheduler e envio automático permanecem false, nenhum radar habilitado, cota zero e próxima execução nula. Habilitar recorrência precisa de frequência e teto financeiro definidos. O emissor usa Resend; o endereço Gmail do proprietário é destinatário, não configuração Gmail SMTP/OAuth.

Não houve commit, push, deploy, migração de produção, cópia de credenciais ou exclusão dos dados reais. Alterações anteriores foram mantidas; aplicação Stitch teve verificação de hashes e backup privado dos arquivos anteriores.

## Evidências e continuidade

- Prompts e diferenças da referência: `docs/STITCH-PROMPTS.md`.
- Ciclo, custo, duração e limite do e-mail: `docs/RADAR-REAL-CYCLE-20261104.md`.
- Normalização e catálogo faltante: `docs/NORMALIZATION-AUDIT.md` e `docs/OLX-OFFICIAL-CATALOG-RESEARCH.md`.
- Evidências ignoradas pelo Git: `validation-private/audi-one-cycle-20261104/` e `validation-private/stitch-20261104/`.
- Não repetir o operador de ciclo: journal marcou execução concluída. Leituras de status confirmam a pausa; não é necessário novo crédito para conferir.

## Complemento após a entrega inicial

A revisão anterior de 24 incertezas Passat foi aprofundada em `docs/OLX-REVIEW-20261104.md`. Os PDFs originais foram agora baixados e conferidos; duas descrições completas tiveram a família revisada. O pacote inteiro de catálogo não foi ativado, os IDs das buscas não mudaram e nenhum anúncio foi unido ou excluído.

Foram acrescentados ensaios de envio automático com resultado incerto e aceitação sem entrega, descritos em `docs/RADAR-EMAIL-PROOF-20261104.md`. Nenhuma consulta paga ou mensagem real adicional foi feita.

## QA e proposta de produto

QA de pesquisa no frontend novo e correções: `docs/USER-QA-20261104.md`. Lint e build finais passaram após os ajustes de toque; TypeScript incluído no build. A proposta de MVP e o inventário das duas bases/comparadores estão em `docs/MVP-PRODUCT-REVIEW-20261104.md`. Nenhuma funcionalidade foi removida por essa proposta.

## Nova jornada de anúncios salvos

Implementação posterior aprovada: Salvos simples e comparador visual ligados aos anúncios reais da busca; navegação sem Mais ferramentas e tipografia atualizada. Catálogo anterior preservado em Configurações. **437 testes / 41 arquivos**, lint, TypeScript e build aprovados. Relatório e limites: `SAVED-COMPARISON-20261104.md`. Nenhum crédito ou e-mail adicional.
