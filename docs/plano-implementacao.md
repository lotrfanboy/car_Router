# Plano de implementação e pontos de aprovação

21/10/2026. A investigação não comprovou ainda uma fonte externa pronta com licença e funcionamento testado para o CarRouter. A etapa independente foi desenvolvida; a missão de aquisição sustentável de anúncios continua pendente de autorização/fornecedor.

## Entrega desta branch

- Auditoria da arquitetura e do fluxo existente, sem substituir a aplicação.
- Pesquisa das fontes prioritárias, complementares, regionais, leilões e fornecedores, com limitações explícitas.
- Modelo financeiro com três volumes e sensibilidade de frequência.
- Histórico de preços transacional utilizado pelo cadastro/edição existentes; leitura por API.
- Migração aditiva com baseline honesta para anúncios anteriores e teste de preservação.
- Testes HTTP de histórico e ajuste do executor de testes para limpar SQLite após encerramento dos workers no Windows.

Evidência de execução em `evidencias-integracoes.md`. Não existe conector externo, importador substituto, seed de demonstração, chamada comercial autenticada ou publicação em produção nesta branch.

## Ordem recomendada

1. **Qualificar parceiro de estoque autorizado.** Escolher lojista/gestor e obter contrato técnico e autorização de dados/fotos para o CarRouter. Estoque que o lojista possui diretamente é um começo de abrangência limitada, mas mais controlável. Esforço de qualificação depende da resposta externa, sem prazo garantido.
2. **Negociar Webmotors canais e avaliar Carros.com/CarroSP.** Pedir escopo de anúncios de terceiros, não compra de plano para publicar anúncios. Medir cobertura BR/regional e negociar exibição/retensão. Não enviar mensagens externas sem instrução explícita do usuário.
3. **ReefAPI Webmotors: prova condicionada.** Contrato documentado é mais específico que páginas genéricas de agregadores; direitos ainda não resolvidos. Solicitar declaração de método permitido, autorização da origem e aceitação expressa deste caso de uso antes de executar chamadas com conta comercial.
4. **CarAPIs: somente após resolver disponibilidade e contrato.** OLX Brasil/Facebook/iCarros/Mobiauto consultados estão sob demanda; exigir amostra, fontes habilitadas, OpenAPI efetivo e exceção aplicável à cláusula concorrencial. Não pagar para descobrir que a cobertura brasileira não existe.
5. **Facebook/OLX global e leilões:** prosseguir via parceria; não construir scraper sem autorização. Leilões exigem domínio de preço/lote próprio e ficam depois do piloto de classificados.

## Proposta concreta para aprovação: prova técnica ReefAPI/Webmotors

**Status:** candidata documental, não integração comprovada. [Endpoint e custos por ação](https://reefapi.com/docs/webmotors); [termos](https://reefapi.com/terms). A página do fornecedor inclui resposta capturada por ele; nenhuma chamada autenticada foi executada pelo CarRouter.

**Dados esperados:** marca, modelo, versão, anos, quilometragem, preço BRL, URL, fotos e localização; detalhe e referência quando disponíveis. Conferir campos ausentes e licença de foto na amostra.

**Custo comprovado:** tarifa pública por ação de dois créditos em busca/detalhe; não equivale a custo faturado. **Prova estimada:** duas buscas de 20 + até 20 detalhes repetidos uma vez no dia seguinte = até 84 créditos, sem chamadas extras; a franquia anunciada é 1.000 créditos iniciais. Teste sem compra, limite de 100 créditos e teto de gasto **zero**, salvo nova aprovação. Preço de operação é calculado separadamente em `comparativo-custos.md`.

**Condições obrigatórias:** usuário aprovar fonte e uso de conta/chave; fornecedor confirmar direitos e método compatível com a missão. Não basta a autorização do usuário para substituir autorização da fonte. Não contratar serviço automaticamente nem aceitar risco contratual sem decisão expressa.

**Arquitetura da prova:** executar consulta limitada no servidor e registrar evidências sanitizadas separadas do banco de uso. Sem conector de produção antes do resultado. Após aprovação da integração, normalizador para Vehicle, identidade externa e atualização transacional, preservando favoritos/notas e a proveniência manual.

**Riscos:** direitos de origem, atualização lenta, anúncio fora do recorte, teto de resultados, schema instável, preços inválidos, campos ausentes e disponibilidade sem SLA. Acesso a API intermediária não comprova licença da origem.

**Esforço estimado de engenharia:** 1–2 dias para prova e relatório técnico, mais 24–48 horas entre observações reais; se aprovada e com contrato estável, 4–7 dias para primeiro conector, identidade/replay, execução e testes. Não inclui espera comercial, autenticação/multiusuário ou escala de 100 mil. São estimativas, não prazo já cumprido.

**Próxima ação concreta:** decisão do usuário sobre esta prova e obtenção da confirmação contratual do fornecedor. Depois, configurar chave no ambiente local seguro; não enviar token pelo chat nem versionar. Se o fornecedor não comprovar direitos/método permitido, abandonar essa candidata e avançar parceria direta.

## Critérios de aceite do primeiro feed

- Contrato permite o caso de uso comercial, exibição de anúncios e fotos, histórico e retenção; limites e cancelamento explícitos.
- Pelo menos 20 veículos BR reais conferidos, duas páginas, identificadores e moedas corretos; métricas de completude registradas.
- Duas observações com intervalo real de 24–48h; mudanças e remoções verificadas quando ocorrerem. Se nenhuma ocorrer, evidência de detecção permanece pendente, não “aprovada” por simulação.
- Orçamento medido compatível com teto aprovado, quota respeitada e fonte desativável sem corromper catálogo.
- Replay não duplica anúncio/preço; falha parcial permite recuperação; edição manual tem política definida.
- CRUD, favoritos, filtros, detalhes e comparação preservados; nenhum teste altera banco de uso.

## Aprovações ainda necessárias

| Decisão                              | Por que depende do usuário         | Trabalho que pode continuar sem ela                 |
| ------------------------------------ | ---------------------------------- | --------------------------------------------------- |
| Fonte do piloto e uso de conta/chave | Exigência expressa da missão       | Pesquisa e base independente concluídas nesta etapa |
| Contato com fornecedores/lojas       | Mensagem externa exige instrução   | Roteiro de perguntas abaixo pronto                  |
| Contrato, pagamento e teto mensal    | Compromisso financeiro/comercial   | Cálculos e comparação documentados                  |
| Risco contratual e licença de origem | Não resolvidos pelo acesso técnico | Confrontar proposta com critérios publicados        |
| Integração específica                | Missão exige aprovação prévia      | Desenho técnico e testes internos documentados      |
| Deploy ou migração destrutiva        | Exigência expressa da missão       | Branch e migração aditiva testáveis sem produção    |

## Perguntas prontas para qualificação comercial

1. A API permite pesquisar anúncios de terceiros no Brasil ou apenas estoque de contas autorizadas? Quais fontes e regiões estão ativas hoje?
2. Há licença expressa para o CarRouter exibir anúncios/fotos e histórico de preços aos seus usuários? Há cláusula de concorrência, redistribuição ou obrigação de remover conteúdo?
3. Qual origem/autorização dos dados e qual método de coleta? Existe uso de CAPTCHA, contas não autorizadas ou contorno de bloqueios? Se sim, não serve ao escopo.
4. Qual OpenAPI, versão, autenticação, ambiente de teste e formato de amostra? Campos e moedas, IDs estáveis, preço original, datas, paginação e filtros?
5. Qual cobertura mensurável de anúncios ativos, atraso de descoberta/alteração e mecanismo de remoção? Há garantia/SLA e compensação?
6. Implantação, mensalidade, mínimo, créditos/resultados, detalhes, erros, exportação, quota, overage, reajuste, moeda, impostos e cancelamento?
7. Cotar separadamente 1 mil, 10 mil e 100 mil anúncios com uma atualização/dia e quatro/dia; indicar volume real de descoberta além dos acompanhados.
8. O que acontece ao encerrar o contrato: retenção, histórico, fotos, URLs, backups e atendimento de remoção?

## Respostas objetivas à missão

- **Como obter anúncios reais?** Via feed/API com licença de parceiros ou estoque autorizado; ofertas intermediárias exigem prova e contrato. Nenhum feed está ativado nesta etapa.
- **Quais permitem uso comercial?** Não há fonte comprovada para o CarRouter ainda. CarAPIs permite alguns usos de negócio, mas impõe restrições que precisam ser resolvidas; outros exigem proposta específica.
- **Quais dependem de parceria?** Portais oficiais para consulta ampla e qualquer feed de lojas/gestores; detalhes na matriz.
- **Quais são economicamente inviáveis?** Não é possível concluir em absoluto sem cotação e margem. Polling individual frequente pode elevar muito o custo; fontes indisponíveis não ficam viáveis pagando plano genérico.
- **Primeira integração?** Piloto de estoque diretamente autorizado; ReefAPI/Webmotors apenas como prova condicional se direitos forem confirmados.
- **Custo MVP?** Cotação pendente no caminho recomendado; cenário ilustrativo intermediário US$ 57,19–97,19/mês equivalente com infraestrutura estimada, anual antecipado, sem impostos e sem licença comprovada. Não é orçamento contratável.
- **O que foi desenvolvido?** Histórico local transacional de preço e consulta por API, migração de preservação, testes e documentos.
- **O que falta?** Aprovação de fonte, direitos, credencial e validação real; missão não deve ser declarada concluída comercialmente antes disso.
