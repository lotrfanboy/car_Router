# Revisão OLX com documentos primários — 04/11/2026

## Evidência nova e diferença para a investigação anterior

A pesquisa anterior inspecionou a extração de um pacote de catálogo sem obter os PDFs originais. Nesta fase foram baixados os documentos públicos oficiais, conferidos os hashes e renderizadas/inspecionadas suas páginas relevantes. Isso permite uma revisão humana fundamentada de duas descrições **completas** que já estavam salvas, sem importar o catálogo técnico, substituir IDs ou criar uma regra por prefixo.

1. [Inmetro PBE 2016](https://www.gov.br/inmetro/pt-br/assuntos/regulamentacao/avaliacao-da-conformidade/programa-brasileiro-de-etiquetagem/tabelas-de-eficiencia-energetica/veiculos-automotivos-pbe-veicular/veiculos-leves-2016/@@download/file), página 22/44: a tabela separa marca VOLKSWAGEN, modelo Novo Passat e versão Highline, motor 2.0-16V. SHA-256 dos bytes `7d81d15d864e080f3fcf1e1da3a276581df3c3208492c243cf1dc391cc50e50d`, igual ao declarado no pacote local anterior.
2. [Volkswagen, ficha Nivus](https://vw-digital-cdn-br.itd.vw.com.br/assets/newsroom-cdn-br-ps/00f45826da9cda0f51129a1f7a2792eb.pdf), página única, dados oficiais abril/2020: Nivus 1.0 TSI automático, combustíveis gasolina/etanol e variante Highline 200 TSI. SHA-256 `d2cc8d7e1c5e73174d45fa862cfdf596cda71e0619c166445215c339f5af2ab6`.

Com essa evidência, o cadastro de revisões exatas passa de 40 para 42 descrições observadas. Os dois novos registros são `Volkswagen / Passat Highline 2.0 TSI 220cv Tip.` → família Passat e `Volkswagen / Nivus Highline 1.0 200 TSI Flex AUT` → família NIVUS. A conclusão de família é uma revisão do CarRouter combinando o atributo estruturado salvo com o documento primário; **não** é um crosswalk fornecido pela OLX.

Cada registro retém URL/ID/data do anúncio já observado, hash do conteúdo de identidade e evidência adicional com URL/hash/data/localizador do PDF. Os originais e renderizações ficam em `validation-private/followup-20261104/official-pdfs/`, ignorado pelo Git.

## Limites preservados

- Só vale a igualdade do rótulo completo dentro da marca; títulos e prefixos não confirmam identidade.
- Os novos registros são `labelOnly`: não se aplicam se aparecerem IDs de marca/modelo/versão não revisados.
- A relação confirma a família, não a equivalência técnica da abreviação Tip., potência, versão específica, câmbio, configuração ou ano do anúncio. O ciclo PBE e a data da ficha não viram ano-modelo.
- Nenhum alvo remoto Gecko/OLX foi criado. Nenhum ID existente foi substituído. Não foi ativado o pacote alternativo de catálogo.
- Passat CC, Passat Variant e descrições não revisadas não foram aprovados por semelhança. BMW GT e Mercedes Kompressor continuam pendentes nos seus respectivos escopos.

## Reprodução sem rede ou banco real

O ensaio usa os 56 registros já salvos na fixture, com o mesmo normalizador e filtros da aplicação:

| Fonte | Confirmados | Incertos | Incompatíveis |
| --- | ---: | ---: | ---: |
| OLX, 44 | 23 | 0 | 21 |
| Webmotors, 12 | 12 | 0 | 0 |
| Total, 56 | 35 | 0 | 21 |

Antes havia 12 confirmados, 24 incertos e 20 incompatíveis. As 23 descrições Passat Highline passam a ter família reconhecida; o Nivus 2022 passa a ser comprovadamente diferente do Passat. As exclusões por ano/localização/preço continuam sendo aplicadas independentemente do reconhecimento de família.

Foi corrigida também uma falha geral de conflito: uma revisão positiva não pode suplantar uma revisão negativa do mesmo alvo, uma ambiguidade ou uma revisão pendente do mesmo rótulo. Nesses casos, nem o fallback de modelo nativo/versão pode devolver uma identidade confirmada. Uma negativa de outra família não invalida uma positiva consistente. Testes controlados cobrem esses casos; não se inventou um conflito nos dados reais.

## Duplicidade

Não há fusão entre plataformas por título, foto, ano, preço, quilometragem ou cidade. Os quatro anúncios semelhantes de Joinville permanecem quatro identidades e históricos próprios. Diferença de preço entre IDs não vira evento de queda. A revisão de marca/modelo não comprova identidade do veículo.

O mecanismo é geral e baseado em dados revisados; duas descrições adicionais resolvem os sintomas observados nessa busca. Para descrever cobertura universal OLX ainda falta um catálogo/crosswalk abrangente verificável. Não é necessário gastar um crédito para reproduzir esta correção.
