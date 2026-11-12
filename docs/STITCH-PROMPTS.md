# CarRouter — referência Stitch e prompts

## Escopo implementado

Referência: `stitch_plataforma_visual_carrouter.zip`, SHA-256 `b1725b4b8da1ab8abb1b8783448652d1d4f9cbc0e315722e23badb7d8394510a`. O anexo contém uma tela Meus Radares, não o aplicativo completo. HTML, screenshot e DESIGN.md foram inspecionados como dados, sem executar scripts do anexo.

Aplicação inicial: `/radares`, detalhe `/radares/[id]` e formulário de criação/edição. Após o QA, o shell e a identidade foram unificados também em `/buscar`, `/salvos` e ferramentas do catálogo. Navegação superior, grafite/vinho, tipografia Syne + Plus Jakarta Sans, cartões com amostra de preços e fotos reais e painéis explicativos. Fontes locais, com licença OFL e proveniência em `src/fonts/SOURCES.json`; sem CDN ou scripts da referência.

As demais telas adaptam a identidade da única referência recebida, preservando seus componentes e fluxos reais; não são telas adicionais desenhadas pelo Stitch. “Mais ferramentas” e busca global do catálogo foram preservados, com menu móvel acessível. Não foram reproduzidos Porsche fictício, avatar/conta, fontes não integradas, números ilustrativos, FIPE, frequência de 35 minutos, alegações de tempo real ou quedas de preço sem evento persistido. A média é aritmética dos anúncios confirmados com preço positivo da amostra, não avaliação de mercado. As fotos vêm dos próprios anúncios. Radares pausados são mostrados pausados.

## Instrução comum para novas telas no Stitch

Crie uma tela do CarRouter para acompanhar ofertas de veículos. Preserve a identidade grafite e vinho: fundo #111317, cartão #1a1c20, superfícies internas #0c0e12, bordas #333539, texto #e2e2e8, secundário #aaa9b3, botão vinho #8b1e2d com texto branco, destaque rosa #ffb3b4, confirmação #7dd9a6 e pausa/revisão #fdba45. Use Syne nos títulos e Plus Jakarta Sans no corpo, espaçamento múltiplo de 8, raio 8px nos cartões e 4px nos botões. Topo com CarRouter e links Buscar carros, Meus radares, Salvos e Configurações. Navegação móvel acessível, foco visível, contraste AA, controles de pelo menos 44px e nenhuma rolagem horizontal em 390px. Não invente integrações, dados, pessoas, notificações ou promessas de tempo real. Diferencie estado vazio, carregamento, falha e dados históricos.

## Prompt — Meus Radares

Usando a instrução comum, desenhe Meus Radares Automotivos. Hero com descrição breve e botão Novo radar. Filtros Todos, Monitorando e Pausados com contagens provenientes dos dados. Desktop: coluna principal de cartões verticais e lateral com explicação do monitoramento e contagem de radares. Cada cartão tem status real, nome, ano/localização dos critérios, número de anúncios confirmados, faixa e média dos preços positivos da amostra, até três fotos reais com preço/cidade/km, última consulta, Abrir radar, Editar, Excluir e Pausar somente quando habilitado. Não ofereça reativação que não exista. Mostre correspondências em revisão separadamente e cobertura parcial. Use dados ilustrativos explicitamente marcados apenas no protótipo; a implementação usará registros persistidos. Não exiba frequência, número de execuções ou configurações técnicas ao criar um radar. Não afirme que a fonte inteira foi varrida.

## Prompt — Detalhe do radar

Usando a instrução comum, desenhe o detalhe de um radar. Cabeçalho com Voltar, nome, estado real e critérios. Aba de ofertas correspondentes e aba de correspondências em revisão, com contagens. Ofertas em cartões com foto original, título, preço anunciado, ano, km, cidade/UF, fonte, observação e link do anúncio original. Novidade ou queda de preço só aparecem quando existe evento persistido deste anúncio e preço; primeira consulta não é novidade. Filtros locais por texto, fonte, cidade, ano mínimo/máximo, preço máximo, km máximo, tipo de evento e ordenação, com limpar filtros e estado sem resultados. Painel lateral com critérios, cobertura/última consulta e situação do e-mail. Se a fonte falhou, preserve os resultados anteriores identificando-os como históricos. Não una carros diferentes por foto ou atributos semelhantes. Coluna única no celular.

## Prompt — Criar e editar radar

Usando a instrução comum, desenhe um formulário acessível com busca salva e nome do radar. A plataforma define a cadência; o usuário define o carro que procura. Explique que novas ofertas confirmadas podem gerar resumo com o monitoramento habilitado, que a primeira consulta estabelece a base e que a detecção depende de consultas periódicas e disponibilidade das fontes. Se o ambiente estiver desabilitado, avise que o radar será salvo pausado. Não adicione seletor de frequência, quantidade de execuções, chaves de API ou opções de envio inexistentes. Tenha fechamento por botão, validação de campos e estado de salvamento sem submissão duplicada.

## Atualização aprovada: Salvos e Comparar

A solicitação posterior de Carlos substituiu a navegação por Buscar carros, Meus radares, Salvos, Comparar e Configurações, sem Mais ferramentas. Títulos e corpo agora usam Plus Jakarta Sans local; o grafite/vinho foi preservado. O catálogo anterior continua em Configurações.

Prompt Salvos: desenhe uma lista de interesse automotiva grafite/vinho com fotos reais, preços anunciados legíveis, busca simples por texto, ordenação por consulta recente/preço, seleção de até quatro e botão Comparar. Sem gráficos agregados ou cadastro manual; estados vazio, erro e sem resultados honestos. Não invente novidades ou quedas.

Prompt Comparar: desenhe uma tabela editorial com até quatro anúncios salvos, fotos originais, preços, versão, ano-modelo, km, motor, câmbio, combustível, cidade/UF, fonte e data. Permita mostrar diferenças, adicionar/remover da seleção, abrir detalhe/histórico e link original. Identifique desconhecidos. Menor preço é só da seleção; não avalia compra ou venda. No celular, tabela com rolagem própria e rótulos fixos, sem alargar a página. Contraste AA nos textos e controles de 44px.
