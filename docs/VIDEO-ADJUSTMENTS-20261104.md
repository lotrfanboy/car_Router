# Ajustes dos vídeos — 4 de novembro de 2026

## Entrega

Implementação validada primeiro em dois snapshots locais, sem copiar `.env`, sem migrações, commit, push ou deploy. Abrir a aplicação principal em http://127.0.0.1:3000. Servidor principal preservado; aplicação do patch usa atualização de arquivos com verificação de hashes e backup dos originais.

| Pedido | Resultado e verificação |
| --- | --- |
| Fotos do computador e URL | Botão abre seletor de arquivo, mantém URL. JPEG/PNG/WebP até 8 MB, limite no servidor e assinatura do formato, arquivo UUID local, sem exclusão automática. Criado um registro fictício no QA, salvo por arquivo, reaberto, editado por URL local e reaberto após reiniciar somente QA. Bytes idênticos à imagem sintética; uma foto, um preço no histórico. Corrigido erro de `new URL` que quebrava o detalhe para caminho relativo. |
| Cadastro manual | Seletores marca/modelo/versão com catálogo disponível e fallback manual honesto; anos por seleção; dinheiro e km brasileiros; validação numérica; estado antes de cidade, troca de UF limpa cidade; origem opcional, padrão Cadastro manual. VW → Passat e cidades SC → PR exercitados no navegador. Não há catálogo completo de versões comprovadas. |
| Salvar oferta no radar | Mesmo salvamento da busca disponível nos cards. Um anúncio foi salvo somente no QA e permaneceu Salvo após recarregar. Nenhuma consulta externa é necessária. |
| Ativar e pausar | Controles na lista e detalhe. Ativação exige infraestrutura liberada, canal de e-mail quando aplicável e saldo de execuções já autorizado. Não repõe limite nem autoriza gasto ilimitado. QA retornou 409 com mensagem legível e permaneceu pausado; testes cobrem caminho habilitado com mocks. Nenhum radar real foi ativado. |
| Financiamento | Entrada, prazo e taxa mensal explícita; parcelas Price e ajuste de centavos na última. Compra de R$1.000, 12 meses, 1%: R$88,85 e última R$88,84, total R$1.066,19; cenário 0% também conferido. Ferramenta Compra e revenda preservada. Não inclui CET/IOF/tarifas/seguro. |
| Dashboard e configurações | Indicador mensal de consultas armazenadas e distribuição por dias do mês UTC, sem fingir conta autenticada. Modelos e consultas recentes preservados. Painéis técnicos redundantes substituídos por atividade e atalhos úteis; diagnóstico e metodologia continuam acessíveis em Configurações. Panorama antigo do catálogo permanece em /catalogo/visao-geral. |
| Navegação | Hover/foco com sublinhado e página atual distinta; transições respeitam redução de movimento. Menu móvel exercitado. |
| Filtros de pesquisa | Rolagem própria no desktop, layout normal no celular. Km mínimo e máximo, preço máximo com formato brasileiro. Intervalo inválido é rejeitado antes da gravação/consulta. Km desconhecido permanece incerto; fora da faixa é incompatível. |
| FIPE | Arquitetura revista conforme diretriz posterior: somente base mensal local por importação explícita, com origem/competência. Sem API por clique ou varredura integral. Ver FIPE-LOCAL-MONTHLY.md. Falta tabela completa autorizada e seu formato. |

## Provedores e comparações

Revisadas as documentações públicas https://reefapi.com/docs/webmotors e https://geckoapi.com.br/docs/. Reef documenta `mileage_min`; o filtro foi encaminhado à Webmotors e conferido também localmente. OLX continua com conferência local de km, sem inventar parâmetro remoto. Outros filtros documentados (combustível, câmbio etc.) não foram adicionados sem contrato de equivalência entre fontes. Não houve nova coleta paga nesta rodada.

Auditado o cálculo real de comparáveis: marca/modelo/versão/UF, ano ±1, km até 20 mil ou 25%, observações até 7 dias, mínimo 5, exclusão de próprio anúncio/URLs repetidas, IQR e dispersão. Combustível, câmbio e motor divergentes conhecidos são excluídos; ausentes são declarados como limitação. Média dos portais e mediana do catálogo manual continuam diferenciadas. Estes cortes são regras do produto, não parâmetros cientificamente validados.

Anúncios semelhantes do vídeo não foram mesclados: IDs, localidades e URLs de foto diferem; isso não prova nem descarta que representem o mesmo carro. A comparação exclui possíveis duplicatas entre portais conservadoramente e explica essa exclusão, preservando cada registro. A normalização OLX continua limitada pela cobertura comprovada do catálogo; incerteza não é convertida em confirmação para melhorar números.

## Validação

- Regressão integral: 475 testes em 50 arquivos passaram. Lint, TypeScript e build passaram; testes offline com rede externa bloqueada e bancos temporários.
- Upload, criação, edição por URL, reabertura e reinício do QA, sem repetir submissões de resultado incerto.
- Navegador: simuladores, seletores, formato e rejeição dos filtros, salvar card e persistência, bloqueio de ativação, dashboard, Configurações, FIPE local e menu móvel.
- Largura móvel CSS 390 px sem transbordamento horizontal nos estados conferidos. Auditoria dos textos visíveis: dashboard 106, Configurações 75, formulário 49, FIPE 18; sem falhas nos limites de contraste calculados (4,5:1 normal, 3:1 texto grande), acompanhada de revisão visual. Não equivale a certificação de acessibilidade completa.
- FIPE local: amostra individual explicitamente identificada no QA; percurso completo sem nova chamada externa. Importação da tabela integral e atualização mensal automática não foram validadas por falta de fonte/formato/licença.

## Preservação, dados e custos

O patch foi retomado após conferir checkpoint, processos, arquivos e hashes das 31 tabelas. Inicialmente o banco principal estava idêntico; durante o trabalho apareceram 50 anúncios/preços, uma busca/consulta, um radar AUDI NE PAE e uma reserva Gecko de 1 crédito em 22:39:11Z. Não há trilha de autoria suficiente para atribuir essas ações; não foram operações deste teste QA. Todos os registros originais permanecem; somente um hash de lock de orçamento mudou. Os cinco radares principais estavam pausados com limite zero na conferência.

Nesta rodada, as ações do agente usaram zero créditos de anúncios e enviaram zero e-mails. Houve quatro leituras públicas individuais BrasilAPI para investigar o formato, antes da diretriz mensal; foram descontinuadas como estratégia de runtime. No QA: um veículo fictício, um preço, uma foto, um radar pausado sem saldo e um salvamento de anúncio já existente. Nenhum desses registros foi copiado ao banco principal. As fixtures foram preservadas para auditoria.

Backups: banco SQLite e arquivos auxiliares conforme README, `validation-private/manual-images` para fotos e `validation-private/fipe-reference` para competências. Não apagar fotos antigas automaticamente: a remoção do vínculo não apaga arquivos/histórico.

## Limites restantes

1. Recorrência real e e-mails automáticos permanecem desligados. Dependem de plano de frequência, destinatário e teto financeiro aprovado; não confundir teste de e-mail com prova de alerta novo real.
2. FIPE: confirmar fonte autorizada, direitos e formato; preparar conversão e atualização por nova competência. Não contratar nem varrer BrasilAPI.
3. Cobertura geral de versões OLX e identidade entre anúncios exigem evidência adicional. Sem fusão destrutiva, sem afirmar cobertura total ou carro único.

## Fechamento no checkout principal

Aplicados 45 arquivos com verificação de hashes e backups. Lint e TypeScript passaram também no checkout principal. A checagem revelou cópias de código em `validation-private` sendo incluídas pelo TypeScript: essa pasta agora fica fora do escopo de TypeScript e ESLint, mantendo seus arquivos intactos. Corrigido e conferido no navegador o link `Ver situação`, que abre e posiciona o diagnóstico recolhido.

Build final no snapshot isolado passou. Conferência na porta 3000 confirmou dashboard com dados reais (6 salvos, 1 cadastro manual, 11 consultas no mês, 5 radares pausados), formulário com Arquivo do PC/URL e diagnóstico. FIPE principal retornou 503 com mensagem de base mensal ausente, sem API externa. Os números são uma fotografia da verificação, não valores fixos no código.

Servidor QA encerrado com identidade conferida (root 75328, filho 41088); dados e fotos QA preservados. Servidor principal root 71996/filho 3412 permaneceu na porta 3000. Nenhum teste, build ou envio ficou pendente. A recorrência e a importação integral FIPE continuam bloqueadas pelas dependências descritas acima.
