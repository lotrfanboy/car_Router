# Meus radares e ofertas

`/radares` apresenta cartões clicáveis, estado real, critérios resumidos e a quantidade de ofertas confirmadas nos avisos disponíveis. O histórico de avisos da API permanece limitado às 50 entradas mais recentes por radar; a página de detalhe calcula as ofertas a partir dos resultados da busca vinculada, sem esse limite de avisos. As duas quantidades podem diferir após consultas posteriores.

`/radares/[id]` e `GET /api/radars/[id]` leem as consultas já armazenadas. Reutilizam a classificação atual e a recuperação de consultas anteriores quando uma fonte falha. Resultados recuperados são identificados como históricos. Anúncios incompatíveis não entram na página; correspondências incertas ficam em uma aba separada e não recebem selos de oportunidade confirmada.

Os filtros de título/versão, fonte, cidade, ano, preço, km, evento e ordenação são locais à página e não mudam a busca nem consultam fornecedores. Preço, disponibilidade e km continuam sendo informações retornadas pela fonte; a tela não corrige silenciosamente dados suspeitos. Links públicos são conferidos antes de oferecer o acesso ao anúncio original.

Um selo de novidade exige aviso persistido `new_listing` para aquele anúncio e preço. Uma queda exige aviso `price_drop`, preço anterior maior que o preço registrado e correspondência confirmada. `isNew`, diferença de preço no payload e a data da primeira coleta não bastam. A consulta inicial nunca é apresentada como anúncio recém-publicado. A ausência de um anúncio numa consulta parcial não comprova sua indisponibilidade.

## Política de criação

O formulário normal envia apenas `experience: "managed"`, nome e busca. O servidor define o modo `new_listings`, canal `both` e intervalo de 24 horas. O intervalo continua sendo uma decisão interna desta implementação, sem garantia de detecção instantânea.

O MVP ainda exige um limite de execução no servidor. `RADAR_MANAGED_RUN_LIMIT` é uma opção operacional de 1 a 100 tentativas por **novo radar**, sem renovação automática. Valor ausente, inválido ou fora do intervalo significa zero: o radar é salvo pausado. Não configurar essa variável como parte de uma alteração visual e não usá-la para ampliar um orçamento aprovado pelo usuário.

A criação só solicita monitoramento quando há limite, infraestrutura habilitada e contato recente do agendador. Ela não instala agendador, não executa consulta, não envia e-mail e não ativa flags de integração. Edições de nome/busca preservam a cota e o estado; não reativam radares pausados. A pausa preserva o saldo restante. O contrato operacional anterior da API continua disponível para compatibilidade, mas seus controles de frequência e quantidade não aparecem no fluxo comum.

O agendador e o envio continuam sujeitos às flags existentes. Quando o saldo chega a zero o radar pausa; esconder essa restrição do formulário não implementa monitoramento contínuo. Para disponibilizar esse produto será necessário definir e autorizar orçamento, renovação de cotas e política de execução da plataforma. Isso não foi ativado nesta manutenção.

## E-mail e diagnóstico

O painel de diagnóstico e o componente de situação/teste de e-mail foram preservados em `/configuracoes#radares`. O detalhe distingue entregas do próprio radar de testes gerais. A confirmação de um e-mail de teste não é apresentada como alerta automático desse radar. O fluxo existente envia resumos de novos anúncios confirmados após a base inicial; quedas de preço permanecem no aplicativo.

Os testes `radar-detail.test.ts` usam SQLite descartável e os 150 registros sanitizados já salvos, sem rede externa. Cobrem projeção por radar, incerteza, filtros, recuperação após falha, 404, evidência de eventos e preservação de pausa/cota nas preferências.
