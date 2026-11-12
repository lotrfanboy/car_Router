# Ciclo real limitado — Audi A4, Paraná, 2016+

Executado em 2026-11-04, somente no SQLite local. Autorização: até um crédito adicional, um resumo para o proprietário somente se houvesse novidade confirmada; sem recorrência.

- Radar `cmw10ogoq00042guojg8vac8x`; execução `cmw20hfxr0000houolxqc9c62`.
- Uma consulta OLX estadual, HTTP 200. Extração: 7.316 ms; fonte, incluindo normalização/persistência: 13.324 ms; ciclo: 13.912 ms. Medição única, não benchmark.
- 50 anúncios recebidos e armazenados na consulta; 5 confirmados, nenhum incerto e 45 incompatíveis.
- Cobertura parcial de uma página. Ausência nessa página não comprova remoção do anúncio.
- Nenhuma novidade ou queda de preço em relação à base. Nenhum e-mail criado ou enviado.
- Saldo Gecko gratuito 44 → 43, exatamente um crédito. Reserva local acumulada Gecko 4 → 5; Reef continuou 2. Sem compra, assinatura ou outra consulta paga.
- Após execução: radar desabilitado, cota zero, próxima execução nula. Flags persistentes de scheduler e e-mail continuaram false. Outros radares não foram ativados.

Isso valida consulta real, classificação, comparação com a base e gravação da execução. Não comprova entrega de um alerta automático real porque não houve novidade elegível. Os e-mails de teste anteriores não equivalem a esse alerta. O caminho completo com novidades e entrega está coberto por testes isolados com provedores simulados; continua faltando um evento real elegível para comprovar entrega nessa integração em operação.

Evidência privada ignorada pelo Git: `validation-private/audi-one-cycle-20261104/preflight.json` e `state.json`, contendo antes/depois, orçamento, tempos e resultados. O processo operador apresentou saída nativa Windows `-1073741819` depois de gravar `completedAt` e os resultados. A execução não foi repetida: uma leitura independente confirmou journal concluído, execução `ok`, saldo/reservas e radar pausado. O encerramento nativo exige investigação separada se voltar a ocorrer; não altera o resultado já persistido.

## Limite da normalização geral

A marca estruturada é reconhecida de forma geral e descrições completas já verificadas são mapeadas para famílias comerciais. Identidades desconhecidas continuam em revisão, sem aprovação por título/prefixo. Ofertas são deduplicadas por identidade da fonte; sem junção automática de anúncios semelhantes de plataformas distintas.

A amostra Passat salva pelo usuário continua com 12 confirmados, 24 em revisão e 20 incompatíveis. Os 24 casos não têm correspondência completa verificada no catálogo disponível. O pacote de catálogo local alternativo não cobre essas descrições e altera IDs que as buscas existentes usam; não foi importado. Ver `OLX-OFFICIAL-CATALOG-RESEARCH.md` e `NORMALIZATION-AUDIT.md`.

Para fechar esses casos é necessário um export autorizado do catálogo oficial OLX, sem segredos, com IDs, hierarquia marca/modelo/versão, descrições completas, data e origem verificável, ou um crosswalk equivalente revisado. Autorizar consumo de créditos de coleta não fornece esse catálogo. Os anúncios originais e históricos foram preservados.
