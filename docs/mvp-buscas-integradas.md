# MVP pessoal: buscas integradas

## Atualização: OLX sem link manual

O formulário agora usa apenas carro e cidade/UF; não exige URL OLX. `olx-search.ts` monta uma URL com UF, região interna e cidade, palavra-chave codificada e preço máximo. O seletor público da OLX confirmou Blumenau em `/estado-sc/norte-de-santa-catarina/blumenau`; Curitiba selecionada resolve para `/estado-pr/regiao-de-curitiba-e-paranagua`, sem sufixo `/curitiba`. Essas duas resoluções têm bootstrap verificado; não constituem cadastro nacional inventado.

Outras cidades usam `POST /olx/v1/locations` da Reef (`country=br`, UF e nome), sob o mesmo orçamento gratuito, com reserva de 1 crédito. Esse endpoint fornece regiões observadas numa amostra de anúncios, **não um diretório completo de municípios**. Só se usa uma candidata inequívoca. Após a consulta Gecko, é preciso encontrar a cidade/UF nos resultados e não receber outro estado para guardar a região em `OlxLocation` por 30 dias. Caso ambíguo ou localização não confirmada vira falha explícita, sem buscar no Brasil inteiro silenciosamente e sem pedir que o usuário cole um link.

Regiões ainda desconhecidas e sem ofertas suficientes podem não ser resolvidas; a ausência de confirmação não é apresentada como prova de zero ofertas. Curitiba utiliza recorte metropolitano e mantém conferência local da cidade. As URLs de buscas antigas continuam aceitas e não há alteração nos registros manuais.

O campo explicativo informa o possível crédito Reef adicional na primeira resolução. Busca de cidade já verificada/cached não repete esse lookup. As demais fontes continuam independentes. Nenhuma promessa de cobertura de todas as cidades decorre desta alteração.

Verificação: 38 testes passaram; inclui aceitar busca sem URL, construir/escapar URL por cidade, cache sem nova cobrança de lookup, recusar região ambígua e descartar resultados de estado divergente. ESLint, TypeScript/build passaram. Teste real no MVP: BMW 320i em Blumenau sem URL retornou 42 anúncios OLX, 39 elegíveis, usando um crédito Gecko. Consulta exploratória de localização Reef consumiu um crédito gratuito fora do contador do MVP. Joinville, que não está no bootstrap, foi resolvida pelo mecanismo dinâmico: 50 anúncios recebidos, 134 declarados (cobertura parcial), 25 elegíveis. Região confirmada nos anúncios e persistida no cache. Custo dessa consulta: 1 crédito Reef de localização e 1 Gecko. Total desta correção: 2 Gecko e 2 Reef (incluindo a consulta exploratória), sem pagamento.

## Escopo entregue

Área `/buscar`, adicionada à navegação existente: salvar critérios, executar consulta manual OLX/Gecko e Webmotors/Reef, abrir anúncios originais, separar elegíveis e fora dos critérios, persistir observações e comparar preços. Os veículos manuais, favoritos e comparador existentes continuam separados e preservados.

Não há agendamento, mensagens, importação automática no catálogo manual, FIPE, alegação de lucro, marcação de vendido ou deduplicação entre portais. “Primeira observação” é local, não data de publicação. Um anúncio ausente nesta página não é considerado removido. Novos e usados são admitidos, sujeitos aos demais critérios.

## Executar localmente

Após instalar dependências, configure `DATABASE_URL` e `DIRECT_URL` no `.env` conforme `.env.example` e execute `npm run setup`. As migrações de produção ficam em `supabase/migrations` e são aplicadas separadamente com `npm run db:migrate:apply`; `npm run db:migrate` apenas verifica a conexão e o schema. `npm run dev` atende somente em 127.0.0.1. Para versão compilada: `npm run build` e `npm run start`.

Configuração exclusivamente no servidor, arquivos ignorados pelo Git:

- `.env.gecko.local`: `GECKO_API_KEY=...`.
- `.env.reef.local`: `REEF_API_KEY=...` e `REEF_FREE_TRIAL=true`, somente para conta com créditos promocionais, sem plano pago/cartão/recarga. Por padrão a Reef não fica habilitada.

Exemplo sem segredos em `.env.integrations.example`. Nunca usar `NEXT_PUBLIC_`, chave de demonstração do playground ou publicar credenciais. As chaves não transitam pela interface. O endpoint de estado informa somente conexão configurada e consumo reservado local, sem revelar tokens. “Conectada” indica configuração presente; a próxima consulta pode detectar falha de autenticação.

## Consumo controlado

Salvar/carregar buscas, recarregar a página e abrir histórico **não consultam fornecedores**. Consultas ocorrem apenas em POST explícito pelo botão. Uma página por fonte: OLX monta a URL pública automaticamente (ou preserva a URL de uma busca antiga); Reef envia filtros e pede até 24 anúncios. Nada de paginação automática ou repetição em falha. Ambas as fontes podem ser selecionadas; uma indisponível não apaga o sucesso da outra.

- Gecko: antes da extração, verificar plano `free`, saldo entre 1 e 100 e custo de 1 crédito no catálogo autenticado. Alteração de plano/custo suspende a consulta.
- Reef: consulta documentada de 2 créditos. O teste público não estabeleceu endpoint autenticado de saldo/plano: exige confirmação local explícita de créditos gratuitos via `REEF_FREE_TRIAL=true`. Essa opção não verifica faturamento no fornecedor; nunca habilitar para conta paga sob a autorização atual.
- PostgreSQL registra a reserva **antes** da extração e serializa concorrentes por fornecedor. Limite de 10 créditos/dia UTC por fornecedor e teto cumulativo deste MVP de 20 Gecko / 40 Reef. Falhas ambíguas continuam reservadas, pois um timeout pode ter sido cobrado. Não é saldo oficial nem reconciliação financeira, e não inclui testes anteriores ao MVP.
- Uma consulta global simultânea, trava persistida por até cinco minutos se o processo cair; intervalo mínimo de um minuto por busca; até 30 buscas salvas. Nenhum código compra, recarrega ou assina serviço.

## Critérios e qualidade

Marca, modelo, cidade/UF e limites de ano, preço, km e particular são conferidos localmente novamente. Campos desconhecidos não satisfazem critérios exigidos. Resultados rejeitados podem ser vistos com os motivos. Links aceitam somente HTTPS e domínios da fonte; anúncios promocionais sem identificador ou com link de campanha não são persistidos como veículos.

OLX mistura modelo e versão: o parser usa o primeiro termo do modelo e distingue Corolla Cross/Fielder. Outros modelos compostos/aliases podem ser rejeitados conservadoramente como não confirmados; expandir com catálogo confiável antes de prometer cobertura universal. Não inferir modelo ou versão por IA. Região na URL OLX pode abranger municípios vizinhos; a cidade final é conferida por anúncio.

O sistema mostra total declarado, quantidade recebida e cobertura parcial. Uma página não garante encontrar todos os anúncios elegíveis. A Reef não documenta ordenação por publicação mais recente; monitoramento futuro exige estratégia de cobertura e comparação de IDs de todas as páginas necessárias.

## Persistência e evolução

`SavedSearch` guarda critérios; `SearchRun` preserva cada tentativa e estado das fontes. `DiscoveredListing` usa chave composta fonte/ID externo; `ListingPrice` registra primeiro preço e mudanças posteriores numa transação. Repetir o mesmo preço não cria evento duplicado. `ProviderSpend` e `SearchLock` controlam consumo e concorrência. Os payloads persistidos são normalizados, sem nomes, telefones, endereços detalhados, CNPJ ou resposta bruta do fornecedor.

Adaptadores isolados em `discovery-providers.ts`; regras compartilhadas em `discovery.ts`; persistência/execução em `discovery-store.ts`. Trocar fornecedor preserva o ID da fonte e histórico. Não há isolamento por usuário neste MVP local: antes de hospedar para terceiros, implementar autenticação, autorização, segregação de dados, gestão de segredos e orçamento por conta; qualificar direitos comerciais/retencão/fotos com fornecedores e medir estabilidade/cobertura. Não expor esta versão pessoal na internet.

## Verificação

38 testes passaram em cinco arquivos, incluindo dez testes novos: validação de URL/faixa, critérios desconhecidos e Corolla Cross, ausência de contatos no modelo persistido, salvar sem custo, proteção de origem, persistência/reconexão, histórico sem duplicação, cooldown/trava, orçamento, plano gratuito e sucesso parcial. Testes usam HTTP simulado e SQLite temporário, sem consumir créditos. O teste de migração confirma preservação dos veículos e histórico anteriores após a nova migração.

Também passaram ESLint, TypeScript e build de produção. Verificação no navegador local: busca salva, chamada OLX real, separação dos critérios, histórico e recarga sem reexecutar fornecedores. Primeira chamada do MVP: 50 anúncios OLX, 1 elegível para Corolla 2020/Curitiba até R$ 120 mil, 49 separados; um crédito reservado. A validação Webmotors com chave própria está registrada abaixo; a demonstração pública anterior não substitui esse teste.

### Consulta real com as duas chaves próprias

Às 11h48 de 21/10/2026, a busca salva Corolla 2020/Curitiba até R$ 120 mil recebeu 50 anúncios OLX (415 declarados; uma página parcial) e 7 Webmotors (7 declarados, recorte completo segundo o fornecedor). O sistema mostrou 8 anúncios elegíveis: 1 OLX e 7 Webmotors. Sem limite de km nesse recorte. IDs de fontes diferentes não representam necessariamente veículos diferentes.

Gecko levou aproximadamente 5,3 s, Reef 4,4 s; tempos individuais incluindo a preparação da fonte, não SLA. As consultas foram sequenciais. Incluindo a primeira consulta só OLX com Reef ainda desconectada, a rodada no MVP reservou 2 créditos Gecko e 2 Reef. Sem compra, assinatura, recarga ou repetição automática. Leitura de histórico e recarga da página não alteraram os contadores locais. Chaves fornecidas pelo usuário ficaram apenas nos arquivos ignorados; verificação do bundle `.next/static` não encontrou nenhuma das duas chaves.
