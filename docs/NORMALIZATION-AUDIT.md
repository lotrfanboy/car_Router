# Normalização e anúncios possivelmente relacionados

## Causa constatada com os dados locais

O catálogo técnico empacotado está vazio. O catálogo nativo de busca contém 136 marcas e 1.261 modelos Webmotors; ele dá identidade aos modelos comerciais curtos, sem fornecer o catálogo técnico completo da OLX. Os dados OLX salvos usam descrições técnicas completas no campo estruturado `vehicle_model`. As correspondências exatas já revisadas cobrem uma parte dessas descrições. A normalização não usa o título para fabricar a identidade faltante.

Havia também um defeito geral independente: uma marca canônica literal podia deixar de receber identidade quando seu modelo técnico não resolvia. O resolvedor agora reconhece essa marca estruturada separadamente, para todas as marcas do catálogo. Não extrapola para IDs de fornecedor desconhecidos, não altera nomes originais nem confirma modelos por esse reconhecimento.

## Auditoria offline reutilizável

```sh
node scripts/audit-listing-normalization.mjs observacoes-sanitizadas.json --output revisao.json
```

Entrada: array de anúncios, `{ listings: [...] }` ou `{ sources: [{ listings: [...] }] }`, contendo somente campos públicos já salvos. Não passar `.env`, respostas de autenticação nem contatos. A ferramenta lê apenas arquivos; não importa banco, não carrega credenciais, não faz chamadas de rede e não modifica código, catálogo ou anúncios. Recusa sobrescrever um relatório existente.

O relatório serve para **revisão**: lista todas as descrições estruturadas, marcas conhecidas, candidatos do catálogo, IDs presentes e exemplos públicos. Os candidatos usam o maior rótulo completo no início do campo estruturado com limite de palavra; isso não aprova uma correspondência. Variantes como Passat CC e BMW GT continuam precisando de decisão fundamentada. Títulos não são usados. A ferramenta não contém condições específicas para Passat nem outro veículo.

O relatório também separa repetição do mesmo ID/URL de anúncios possivelmente relacionados. Marca/modelo sugerido, ano, km e cidade/UF coincidentes geram apenas um grupo não verificado. O preço permanece associado a cada anúncio e não vira histórico de queda. Nada é ocultado, fundido ou excluído.

## Evidência do vídeo

Na busca salva havia 44 IDs OLX e 12 Webmotors distintos. O grupo de Joinville/2018/80.000 km contém os IDs OLX `1520526918`, `1520527849`, `1534811679` e `1533958879`. Os três primeiros têm R$ 144.900 e o quarto R$ 144.500; as URLs de imagem são diferentes. Há também grupos com atributos coincidentes entre OLX e Webmotors. Isso não comprova identidade do veículo, foto idêntica em pixels nem variação histórica de preço. Não é uma duplicação de chave React nem repetição do mesmo ID no resultado salvo.

## Próximo passo estrutural

Para resolver modelos OLX de forma geral, é necessário incorporar um catálogo/crosswalk de origem verificável que cubra suas descrições técnicas, com marca, modelo comercial, variantes, IDs e proveniência. O caminho é importar e validar essa base em revisão versionada, registrar conflitos/pendências, reproduzir todos os dados salvos e manter testes para famílias próximas e IDs divergentes. Usar um prefixo textual como aprovação automática esconderia variantes e falsos positivos. Acrescentar somente os rótulos do Passat repetiria a limitação anterior.

Sem uma base adicional verificável, o código mantém os modelos desconhecidos incertos. Esse é um bloqueio de cobertura de dados, não de presença das chaves de API. Nesta manutenção não foram buscados dados novos, concedidos créditos nem ligados agendador/e-mail.

Deduplicação de veículos entre plataformas é uma etapa separada: uma relação confirmada requer identificador ou evidência verificável do mesmo veículo/anunciante. IDs dos anúncios e históricos por origem devem ser preservados mesmo após essa confirmação. Similaridade pode ajudar a revisão; não deve deduplicar contagens, comparáveis ou alertas como se fosse identidade comprovada.

## Continuação da pesquisa oficial e pacotes locais

Foram encontrados dois ZIPs de catálogo em Downloads após esta primeira análise. O conteúdo canônico passou no dry-run, mas não resolveu as descrições OLX pendentes; uma ativação direta também trocaria os IDs das buscas existentes. Nenhum pacote foi ativado. Consulte [pesquisa de fontes, ensaio completo e próximo insumo necessário](OLX-OFFICIAL-CATALOG-RESEARCH.md) para a atualização e a especificação do export oficial sanitizado necessário.
