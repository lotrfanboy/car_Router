# Radar interno e validação limitada

O cron Supabase existente (`radar-automotivo-tick`, a cada 30 minutos) chegava ao aplicativo, mas o fluxo inteiro era interrompido quando o e-mail estava indisponível. Também não havia radares cadastrados. O modo antigo dependia de comparação de preço entre versões confirmadas, insuficiente para acompanhar novidades sem versão obrigatória.

## Comportamento

- Canais independentes: aplicativo, e-mail ou ambos. Sem configuração de e-mail, o canal interno funciona; envio externo não é declarado como entregue.
- Modos: novidades/queda de preço e desconto sobre amostra comparável. Radares antigos mantêm os defaults de desconto/e-mail.
- A primeira resposta bem-sucedida de cada fonte estabelece sua base inicial. Seus anúncios aparecem como encontrados na primeira consulta, sem e-mail e sem alegar publicação recente.
- Depois da base, IDs inéditos são novos para aquele radar; uma queda de pelo menos 1% em relação ao preço observado anterior produz um evento. A chave persistente por radar, busca, anúncio e preço impede duplicação em novas execuções.
- Correspondências incertas aparecem identificadas. Incompatíveis e anúncios sem preço válido não produzem aviso; o resumo informa as exclusões. Não se presume confirmação de versão ausente.
- Falha de fonte não estabelece base e não apaga observações. Página parcial não significa que anúncios ausentes foram vendidos ou removidos.
- E-mails têm limite de dez tentativas por execução. Ausência de configuração, limite e resposta sem confirmação são estados explícitos; não há reenvio automático ambíguo.
- Limite opcional de tentativas (`runsRemaining`) pausa automaticamente ao chegar a zero, inclusive após falha. Edição/pausa concorrente impede persistir eventos com configuração desatualizada.

## Exemplo criado idempotentemente

- Busca: `example-bmw320i-2016-pr-search`.
- Radar: `example-bmw320i-2016-pr-radar`.
- BMW 320i, ano mínimo 2016, sem máximo, sem versão obrigatória, sem limite de preço/quilometragem.
- Paraná inteiro, cidades vazias: localização reutilizada da busca já existente `cmvkc8qkb00001gi1i7k99jho`, não uma nova preferência inferida.
- OLX somente, canal interno, modo novidades, uma tentativa. Nenhum radar extra Corolla/Gol foi necessário.
- Criado pausado para ativação somente após deploy confirmado e observação da execução nativa do cron. Depois da tentativa, deve permanecer pausado; consumo recorrente adicional precisa de limite autorizado.
- Antes da validação, o livro de reservas registrava Gecko 3 e Reef 6 créditos. Limites locais já existentes: 10/dia por provedor, 20 Gecko/40 Reef no total. A coleta OLX tem preflight que exige plano gratuito e custo de uma extração igual a um crédito antes de reservar. Nenhuma recarga, assinatura, credencial ou permissão adicional foi criada.

## Preservação e verificação

Migração aditiva `20261023024810_radar_internal_events` aplicada no Supabase e reproduzível no SQLite. Mantém buscas, catálogo, histórico e cron existentes. Novas tabelas têm RLS habilitada e nenhum acesso de Data API concedido. O startup agora verifica também as colunas/tabelas de alertas.

Testes offline cobrem base por fonte, repetição, novos anúncios, queda de preço, falha/recuperação de fonte, incerteza, concorrência, execução única, e-mail indisponível e limite de envio. O teste de migração preserva dados anteriores e verifica chaves e relações. O roteiro `scripts/browser_radar_alerts.py` usa respostas interceptadas e verifica desktop/mobile sem coletar anúncios nem enviar e-mails.

A evidência final do cron, do deploy, dos avisos persistidos e do consumo observado é registrada no relatório da tarefa. Testes offline não comprovam entrega de e-mail nem esgotamento de todos os anúncios dos portais. O envio externo continua bloqueado pela ausência de `RESEND_API_KEY`, `RADAR_EMAIL_FROM` e `RADAR_EMAIL_TO`; não foi criado um destino de teste.
