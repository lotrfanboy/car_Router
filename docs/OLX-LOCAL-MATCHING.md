# Classificação local das observações OLX

A coleta limitada de 03/11/2026 gravou três páginas OLX, com 150 anúncios, no SQLite local. Os seletores de busca já tinham as famílias do catálogo nativo, mas as descrições completas recebidas da OLX não tinham os vínculos de leitura. A página do Audi A4 também continha outros modelos. Isso deixava resultados claramente diferentes como incertos e mantinha esses avisos históricos na tela do radar.

`src/data/olx-model-observations.json` registra 40 descrições estruturadas exatas revisadas a partir dessas observações já salvas. Cada registro conserva o anúncio público de origem, horário de observação e SHA-256 da identidade sanitizada. O hash cobre os campos, na ordem documentada no arquivo, antes da anotação da família. Nenhuma chave, contato de vendedor, fotografia ou dado de conta é incluído.

São 38 vínculos de marca/modelo comercial confirmados por descrição exata. Duas descrições ficam pendentes: BMW GT e Mercedes Kompressor, cuja relação com as famílias nativas não foi estabelecida pelos dados locais. Não há regra geral para cortar uma descrição no prefixo, confiar no título ou inferir uma versão técnica. Uma descrição não revisada continua incerta. Os vínculos `labelOnly` não se aplicam quando aparecem IDs de fonte que a evidência não forneceu; esses casos exigem revisão própria.

O catálogo aplica esses vínculos depois de criar os pais canônicos. Isso funciona mesmo sem o pacote técnico completo. Versões, motorização e transmissão não são confirmadas por esses vínculos, e as comparações que exigem uma versão técnica continuam sujeitas às restrições existentes. Os contratos de consulta e os limites de créditos não mudaram.

As buscas e os anúncios são reclassificados ao ler. Os avisos do radar usam a mesma classificação atual e omitem itens incompatíveis com o modelo, ano ou estado do radar. O campo `recordedMatchStatus` conserva o estado original na projeção, e os registros/payloads gravados não são reescritos nem apagados. Isso corrige a exibição dos avisos antigos sem criar eventos novos, inventar observações de preço ou disparar e-mails.

Resultados esperados sobre as 150 observações originais:

| Radar                             | Confirmados no recorte | Incertos | Incompatíveis |
| --------------------------------- | ---------------------: | -------: | ------------: |
| BMW 320i, SC, 2018+               |                     39 |   1 (GT) |            10 |
| Audi A4, PR, 2016+                |                      5 |        0 |            45 |
| Mercedes-Benz C180, SP, 2015–2020 |                     30 |        0 |            20 |

Os 108 avisos históricos de base inicial permanecem armazenados. A projeção mostra 40 BMW (39 confirmados e um incerto), cinco A4 e 30 C180. Não são anúncios recém-publicados: foram observados na primeira verificação.

Os testes reproduzem os 150 registros, verificam os hashes, bloqueiam IDs contraditórios e descrições inéditas, preservam os avisos no banco temporário e exercitam o alerta para um A4 novo. Os transportes são simulados: um Q3 e um modelo desconhecido não entram no resumo, e nenhuma mensagem real é enviada. Novas descrições requerem nova evidência/revisão; esta correção não completa todo o catálogo OLX nem ativa um agendador.
