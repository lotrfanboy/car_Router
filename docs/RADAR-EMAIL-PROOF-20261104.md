# Envio automático — prova isolada e limite da prova real

## O que foi testado agora

Os testes usam o código real de CLI, autenticação HTTP do tick, consulta, comparação com a base, persistência, criação de avisos, fila de digest, envio e conciliação. Somente as fronteiras de coleta e Resend são simuladas, com SQLite temporário, endereços `example.test`, chave fictícia e bloqueio de rede externa. Os IDs acrescentados às fixtures começam por `OFFLINE-NEW-`; não são anúncios novos reais e não entram no banco do usuário.

O teste já existente percorre três radares: primeira consulta sem e-mail, segunda com um novo confirmado por radar e uma queda de preço conhecida, terceira com confirmação de entrega e pausa pelo limite. O digest inclui só os novos confirmados, exclui incertos e não trata a base ou a queda conhecida como nova oferta. Ticks repetidos não duplicam mensagens.

Foram acrescentados dois cenários completos com um Audi controlado:

1. **Resultado incerto após o POST:** o provedor simulado registra a solicitação mas devolve HTTP 500. A entrega local vira `unknown`, com uma tentativa, sem ID de provedor e sem data de entrega. Mesmo um pedido explícito de entrega, conciliação e novo tick não repetem o POST nem a consulta. O radar fica pausado após o limite. Esse caso exige conferir o resultado no provedor antes de qualquer ação manual.
2. **Aceito ainda não é entregue:** o POST retorna ID e a consulta de status inicialmente retorna `sent`; permanece `accepted` e `deliveredAt=null`. Só depois de o status simulado informar `delivered` a entrega é confirmada. Isso funciona com o radar pausado e usa apenas leitura de status, sem outro envio ou coleta.

Nos dois casos, destinatário único fictício, conteúdo controlado, uma mensagem por execução elegível, uma tentativa e nenhuma reserva paga. Não houve POST real para Resend.

## Estado real preservado

O ciclo real autorizado do Audi já concluído consumiu um crédito e retornou cinco confirmados entre cinquenta anúncios. Nenhuma novidade confirmada foi identificada: nenhum digest real foi criado ou enviado. As duas entregas reais anteriores são testes, não prova de um alerta automático originado por um anúncio novo. Não foram reenviadas ou alteradas.

O envio usa Resend. O Gmail configurado é destinatário do proprietário; não há integração Gmail SMTP/OAuth validada por esse envio.

## O que falta para comprovar em operação

Não há um evento real elegível pendente que permita enviar um digest automático verdadeiro sem fabricar novidade. Não se deve clonar anúncio no banco real, apagar a base ou mudar a classificação histórica para forçar um e-mail.

Uma próxima prova real exige **uma nova consulta** do Audi A4 2016+ no Paraná, uma página OLX, custo esperado de um crédito conforme o último preço verificado. O preço/saldo devem ser conferidos novamente e a autorização obtida antes de coletar; não foi executada nesta fase. Só poderá sair um resumo para o proprietário se aparecer novidade confirmada. Nem uma nova consulta garante que haverá novidade. Depois, a confirmação de entrega usa GET no Resend, sem repetir a coleta ou o envio.

Recorrência e envio automático persistentes continuam desligados. Nenhuma compra, assinatura, terceiro destinatário, commit, push ou deploy foi feito.
