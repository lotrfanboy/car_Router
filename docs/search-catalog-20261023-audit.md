# Catálogo de critérios de busca — auditoria de 23/10/2026

A fonte dos seletores passa a ser a árvore completa de marcas/modelos retornada pela integração Webmotors. O catálogo técnico Inmetro permanece disponível para aliases antigos, classificação e comparação dos anúncios; suas versões, carrocerias, portas e sufixos de publicação não se tornam filtros remotos.

## Aquisição e integridade

- Endpoint: `POST https://api.reefapi.com/webmotors/v1/makes_models`, corpo `{"vehicle_type":"car"}`.
- Retorno observado em **2026-10-23T17:43:47.415Z**: `ok=true`, `stop_reason=complete`, **136 marcas e 1.261 modelos**. Uma requisição upstream e um crédito informado pelo fornecedor.
- A resposta contém nomes, sem IDs de marca/modelo. Os IDs internos são hashes estáveis com escopo; nenhum deles é enviado como se fosse ID da fonte.
- Resposta pública original: [`reef-makes-models-20261023.json`](../src/data/evidence/reef-makes-models-20261023.json), **17.953 bytes**, SHA-256 `9f011baae24c7304c1e74a183c517403db522be81a121975b229b2770da45390`.
- Snapshot normalizado: [`search-catalog.json`](../src/data/search-catalog.json). O importador [`import-search-catalog.mjs`](../scripts/import-search-catalog.mjs) roda somente offline, confere sucesso, hash, tamanho, tipo de veículo, completude e todas as contagens antes de escrever. Não consulta APIs nem lê credenciais.

Completude significa todas as folhas da resposta deste fornecedor nessa data. Não significa todos os veículos existentes no mundo, nem que todos tenham anúncios disponíveis agora.

## Resultado da junção completa

| Medida                                               |         Quantidade |
| ---------------------------------------------------- | -----------------: |
| Marcas/modelos/versões técnicos auditados            | 63 / 1.113 / 6.112 |
| Famílias com aliases explicitamente revisados        |                188 |
| Famílias técnicas após projeção                      |                785 |
| Famílias técnicas ligadas a um alvo nativo           |                528 |
| Famílias técnicas mantidas somente internamente      |                257 |
| Marcas/modelos internos após junção                  |        140 / 1.512 |
| Marcas comerciais oferecidas no seletor              |                135 |
| Modelos comerciais oferecidos no seletor             |              1.255 |
| Alvos nativos de consulta preservados                |              1.261 |
| Grupos de rótulos duplicados normalizados no seletor |                  0 |

Os 257 registros técnicos sem alvo aprovado não são oferecidos como critérios Webmotors. A lista completa está no [relatório estruturado](search-catalog-20261023-audit.json). A preservação técnica não representa aprovação de uma consulta remota. As 6.112 versões continuam internamente, sem exigir correspondência de versão para incluir um anúncio do modelo correto.

## Equivalências e limites

O [registro revisado](../src/data/commercial-models.json) contém aliases explícitos por marca, com fontes para as novas relações. A3 inclui Sedan/Sportback/Cabriolet e o erro de transcrição Spotback. A4/A5 e outras famílias Audi, Cruze, Focus, Fiesta, City, Etios, Yaris, Defender, Master, Ranger e Hilux agregam as carrocerias/configurações revisadas. S/RS, motores Mercedes distintos, Ka/Ka+, Onix/Onix Plus, Yaris/Yaris Cross/GR Yaris e Hilux/Hilux SW4 permanecem distintos. Não existe regra de cortar o nome na primeira palavra ou apagar um sufixo desconhecido.

Seis famílias possuem dois alvos nativos preservados: Jaguar XJ-S/XJS; Lexus IS250 F-SPORT/IS 250 e RX350 F-SPORT/RX 350; Corvette/Corvette Grand Sport; Oroch/Duster Oroch; e Jeep sob as marcas históricas Willys/Willys Overland. Essas duas marcas se tornam uma marca comercial, conservando o `make` original em cada consulta. Jeep, Ford, Chery/CAOA Chery e Changan/CAOA Changan não são fundidas por semelhança ou propriedade societária.

Alguns nomes nativos ainda podem representar derivados comerciais ou gerações, por exemplo Discovery 2/3/4, T4 Expedition, DBX707 e Song Plus Premium. Permanecem como a fonte os define até existir uma equivalência revisada. Nos técnicos Mercedes, `EQE 300` contém registros SUV, enquanto a fonte oferece `EQE 300` e `EQE 300 SUV`; não há alias global que colapse esses nomes. Sufixos `+`, versões AMG não comprovadas e modelos sem alvo nativo continuam pendentes. Essa limitação é de conciliação técnica, não de folhas omitidas do snapshot de busca.

## Critérios de validação

1. Cada alvo referencia marca, modelo e evidência válidos; a relação de parentesco é conferida pelo schema.
2. Cada uma das 1.261 folhas originais aparece em um alvo. Pontuação de nomes externos é preservada: XJ-S e XJS não são apagados por normalização.
3. IDs reais, quando disponíveis em outra evidência, prevalecem; nomes completos nativos podem classificar o modelo quando não existe conflito com um ID conhecido. Descrições livres desconhecidas não viram equivalência por prefixo.
4. O seletor lê apenas marcas/modelos com alvos confirmados, sem rede nem créditos. Os endpoints antigos de versões/configurações retornam 400 explicando que versões são filtradas nos resultados.
5. Migrações de critérios salvos removem versão, portas e configuração da coleta e preservam os campos originais dos anúncios. O filtro local de versão atua sobre os registros carregados, sem alegar cobertura de todas as páginas do portal.
6. A revisão do snapshot e a revisão comercial participam da invalidação de cache. A resolução mantém índices por snapshot, sem varrer todo o catálogo técnico para cada anúncio.

A validação offline cobre a árvore inteira, aliases, pais/evidências, IDs conflitantes, controles negativos e preservação dos alvos. Ela verifica o contrato de tradução; não substitui a validação das respostas e da paginação de cada busca real.
