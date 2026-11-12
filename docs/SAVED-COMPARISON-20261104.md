# Buscar, Salvar e Comparar — entrega de 04/11/2026

## Resultado

O comparador principal usa os anúncios reais salvos da busca, sem cadastro manual. `/comparar` e o endereço anterior `/comparar-anuncios` usam o mesmo componente e a mesma seleção persistida por fonte e ID. Não houve conversão de anúncios para Vehicle nem mistura das duas bases.

Salvos foi redesenhado: busca local por modelo/cidade/fonte, três ordenações, contagem simples, cartões com fotos originais, seleção até quatro e ação Comparar. Os filtros e gráficos agregados anteriores saíram dessa tela; nenhum anúncio ou preço foi excluído.

A comparação apresenta fotos, preço anunciado, versão, ano-modelo, km, motor, câmbio, combustível, localização, anunciante, fonte e última consulta. Há filtro de diferenças, adicionar/remover seleção, detalhe/histórico e link original. Valor desconhecido fica explícito. A média só aparece se o backend considerar a base suficiente. “Menor preço desta seleção” compara apenas os valores escolhidos, sem afirmar melhor compra ou equivalência entre versões.

## Navegação, legado e tipografia

- Navegação principal: Buscar carros, Meus radares, Salvos, Comparar e Configurações. Não existe menu Mais ferramentas nem busca global que leve ao cadastro manual.
- Em Configurações → Dados anteriores do catálogo ficam os acessos aos cadastros, favoritos, comparador antigo, análises e visão geral. O comparador manual anterior foi preservado em `/catalogo/comparar`; seus links internos foram ajustados.
- Fonte local Plus Jakarta Sans em títulos e corpo, com pesos e espaçamento mais naturais. Identidade grafite/vinho, ícone e cores preservados. Fontes/licenças anteriores continuam no projeto; não houve nova dependência ou CDN.

## Contraste e acessibilidade

O preço tinha cor #17191c em superfície escura; agora usa #eef0f3. O quadro de limitações usava fundo claro e texto herdado do escuro; agora o par é #302719 / #f4d9a5. Placeholders de imagem, referência pendente e erros também receberam pares explícitos de fundo/texto.

Medição pelo estilo computado no navegador, fórmula de luminância/contraste WCAG e limiares de 4,5:1 para texto normal e 3:1 para texto grande:

| Tela/estado | Elementos medidos | Menor razão encontrada | Falhas nos elementos medidos |
| --- | ---: | ---: | ---: |
| Comparador QA | 61 | 8,53:1 | 0 |
| Salvos QA | 49 | 7,56:1 | 0 |
| Detalhe QA, incluindo limitações | 17 | 7,34:1 | 0 |
| Erro controlado de carregamento | 5 | 9,30:1 | 0 |
| Comparador real, três Up | 78 | 8,53:1 | 0 |
| Detalhe real Up High 81482572 | 17 | 7,34:1 | 0 |

Preços nos cartões/detalhe/comparação: **14,94:1**. Foram conferidos rótulos dos controles, estados vazios, região da tabela com foco e rolagem por teclado, navegação móvel e controles de remoção. Esta verificação não equivale a auditoria integral WCAG, leitor de tela ou todas as combinações de estados. Não foram instaladas ferramentas de terceiros para isso.

## QA concluído

- Banco isolado próprio e credenciais fictícias; chamadas externas de fetch interceptadas. Fixtures de anúncios públicos previamente salvos e cadastros manuais fictícios. Nenhum `.env` real copiado.
- Salvos vazio e Comparar vazio; nenhum gráfico, dado ilustrativo ou referência inventada.
- Retomar a consulta Passat já persistida, salvar duas ofertas, abrir Salvos e comparar. Nenhuma nova coleta.
- Busca local sem resultado e limpar; ordenar por menor preço; seleção restaurada após recarga; filtro apenas diferenças; detalhe e retorno à comparação. Endpoint do histórico respondeu 200 no QA.
- Mais três anúncios salvos no QA: cinco disponíveis, quatro selecionados e quinta opção desabilitada.
- GET de salvos retornou 503 controlado somente no QA: alerta e Tentar novamente. Retorno a 200 recuperou os quatro selecionados. O código temporário de simulação foi restaurado, nunca aplicado ao projeto principal.
- Menu móvel abre, navega e fecha. Salvos e comparação medidos em 390 CSS px, documento de 373 px, sem overflow horizontal da página. Tabela tem rolagem própria. Na comparação real: contêiner 332 px, conteúdo 885 px; após rolagem 45,33 px o rótulo permaneceu em x=20,89 px graças à coluna fixa. Viewport restaurado.
- Configurações abriu os cinco links do legado; comparador anterior abriu com os cadastros fictícios preservados.
- Servidor principal: três Volkswagen Up já salvos e selecionados apareceram no comparador novo com fotos reais e preços de R$64.900, R$49.900 e R$62.000. Nenhum registro ou seleção principal precisou ser alterado. Detalhe real do High Up abriu, contraste conferido e retorno manteve os três.

## Verificações de código e limites

**437 testes em 41 arquivos aprovados** pelo runner do projeto, com bancos temporários e rede externa bloqueada. Quatro testes novos cobrem busca sem acentos, preço ausente ao ordenar, preservação de anúncios semelhantes e recência por observação. Lint e build finais passaram; TypeScript incluído no build. A última alteração foi visual, para limitar altura das fotos e fixar rótulos da tabela; o build foi refeito após esse ajuste.

Uma tentativa inicial de Vitest direto omitiu o diretório temporário exigido pelos testes e não é a validação final; foi corrigida usando `npm test`. O sandbox também bloqueou cache/geração; a execução autorizada na cópia isolada concluiu. Uma validação duplicada foi cancelada antes de continuar, sem alterar o servidor principal.

Sem novos créditos, e-mails, cron, commit, push, deploy, migração ou exclusão de dados reais. Evidências: `validation-private/saved-journey-20261104/`, incluindo hashes antes/depois, logs, razões de contraste e screenshots. O ambiente de QA é temporário; o processo principal em 3000 permanece.

Limites: Chrome desktop e viewport móvel, sem aparelho físico/Safari/Firefox; links externos foram preservados, não testados por navegação ao portal. Não houve nova chamada real de fornecedor. O envio automático com novidade real e a operação recorrente continuam fora desta entrega e desabilitados.

As três referências enviadas foram lidas pela Library; a materialização local pelo helper oficial falhou no Windows por ausência de `os.setxattr`. Não se contornou a restrição nem se usaram bytes sem metadados. Os problemas relatados foram confirmados diretamente nos estilos e nas páginas reais. Capturas adicionais sofreram timeouts intermitentes do Chrome; a captura final do comparador com três Up reais foi salva e inspecionada.


## Atualização posterior: preservar a riqueza do catálogo

Carlos corrigiu a proposta de simplificação: manter inclusão manual e recursos ricos, integrando anúncios salvos e cadastros sem misturar entidades. O painel e o comparador visuais desta decisão estão implementados e documentados em [COLLECTION-COHESION-20261104.md](./COLLECTION-COHESION-20261104.md). A retirada dos recursos manuais da jornada deixou de ser a decisão vigente.
