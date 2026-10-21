# Auditoria do backend — base 5626b17, 21/10/2026

Escopo: leitura do repositório real recebido após atualização de `main`. Este documento substitui qualquer hipótese baseada no checkout inicial vazio. Nenhum fornecedor foi consultado; nenhum segredo foi lido; nenhum crédito foi consumido durante esta auditoria. As verificações históricas em `mvp-buscas-integradas.md` são evidência documentada anterior, não uma nova execução.

## Arquitetura encontrada

Next.js 16 App Router/React 19/TypeScript. Route Handlers em `src/app/api`, Zod 4 para validação e Prisma 6.19 com adapter libSQL/SQLite. Interface cliente acessa APIs via fetch. Valores monetários são inteiros em centavos; limites de preço de buscas são reais e convertidos explicitamente.

Entidades existentes:

- `Vehicle`: catálogo manual, preço, referência manual opcional, marca/modelo/versão/anos/km, combustível/câmbio, local, origem/link, uma imagem opcional, favorito, datas locais de cadastro/edição.
- `VehiclePrice`: preço inicial, mudanças reais e baseline da migração. Escrita transacional com Vehicle; índices por veículo/ID. Exclusão explícita do veículo remove seu histórico por cascade (comportamento existente).
- `SavedSearch` e `SearchRun`: critérios serializados, tentativas e resultados por fonte. GET expõe a última execução por busca; tentativas anteriores continuam no banco.
- `DiscoveredListing` e `ListingPrice`: anúncios de portais separados do catálogo manual, identidade composta fonte/ID externo, payload normalizado e primeiro/último encontro; somente primeiro preço/mudanças geram eventos.
- `ProviderSpend`, `SearchLock`, `OlxLocation`: reservas de créditos antes de extrair, concorrência global e cache de regiões OLX verificadas.

Migrações são aditivas. A migração de histórico registra a fotografia corrente como `baseline`, sem inventar data antiga. O teste de migração verifica preservação de Vehicle/histórico após adicionar buscas e cache de localidades.

## Classificação funcional

| Área | Classe | Evidência e limite |
|---|---|---|
| CRUD manual e favoritos | A, implementado | APIs GET/POST/GET item/PUT/PATCH/DELETE; validação Zod, erros 400/404 e testes com SQLite temporário. |
| Histórico manual | A, implementado | Transação de atualização e histórico; não duplica preço igual; teste de rollback. |
| Busca OLX/Gecko | A na implementação, dependente da configuração | Extrator real, verificações de plano/saldo/custo; URL regional montada sem link manual; leitura histórica não executa consulta. |
| Busca Webmotors/Reef | A na implementação, dependente da configuração | API real, opt-in gratuito explícito, duas unidades reservadas por consulta. Não existe verificação automática comprovada do plano Reef. |
| Cobertura dos portais | B | Uma página por fonte; total recebido/declarado e cobertura parcial informados. Não garante universo completo nem disponibilidade presente. |
| Localização OLX | B | Bootstrap verificado Blumenau/Curitiba; outras regiões requerem lookup Reef e confirmação em anúncios, cache de 30 dias. Casos ambíguos falham explicitamente. |
| Normalização e deduplicação | B | IDs por fonte; filtros locais conservadores e descarte de contatos. Modelo OLX usa primeiro termo com exceção Corolla Cross/Fielder. Não há deduplicação cruzada nem versão normalizada. |
| Comparação financeira manual | B | `referenceCents` e diferença simples em reais/%; referência é informada pelo usuário. Não é FIPE. |
| FIPE | D | Nenhum código/mês/combustível/identificação/fonte de referência ou serviço FIPE. Não renomear referência manual como FIPE. |
| Imagens | B | URL manual única e fallback na UI. Descobertas não têm fotos; direitos de exibição dos fornecedores não foram estabelecidos neste contrato. |
| Comparáveis, motor de oportunidades e simulação | D | Ausentes na camada de domínio atual. |
| Alertas/scheduler | D | Nenhum alerta automático ou execução recorrente. `isNew` e preço anterior existem no resultado de busca. |
| Autenticação/multiusuário | D | Aplicativo pessoal local. Proteção de origem nas mutações é defesa adicional, não autenticação. |
| Paginação/API analítica | D | Catálogo inteiro retornado; filtros/ordenação no cliente. Ausência de endpoint agregado de todas as descobertas. |
| Fachadas/integrações obsoletas | Nenhuma identificada | Não há motivo para substituir conectores por mocks ou descartar implementações existentes. |

Classificação A descreve código e cobertura de testes encontrados; a linha de base executada desta sessão deve ser registrada no relatório de validação geral.

## Contratos HTTP a preservar

- `/api/vehicles`: GET array de Vehicle (datas JSON ISO), POST criação validada.
- `/api/vehicles/:id`: GET registro; PUT atualização completa; PATCH `{favorite:boolean}`; DELETE explícito.
- `/api/vehicles/:id/prices`: eventos `{id,vehicleId,priceCents,observedAt,reason}`.
- `/api/searches`: GET `{searches:[{id,criteria,latest}],integrations:[{source,configured,cost,reservedToday,dailyLimit}]}`; POST apenas salva e não consulta portais.
- `/api/searches/:id/run`: POST inicia execução manual, única ação de consulta de fornecedores.
- `/api/discoveries/:source/:id/prices`: histórico por fonte e ID externo.

`latest` contém `id`, `createdAt`, `sources[]`; cada fonte informa status `ok/error/unconfigured`, mensagem, horário, duração, reservas, total declarado, parcialidade e `listings[]`. Listing de descoberta contém fonte, ID, URL/título, marca/modelo/ano/preço/km/local possivelmente nulos, tipo de vendedor, observedAt e motivos de inelegibilidade. Não possui versão, combustível, fotos, referência financeira ou status vendido. Não enriquecer por inferência silenciosa.

## Limites de preservação e migração

1. Preservar banco e migrações existentes. Não recriar SQLite, não executar reset, não misturar fixtures com dados reais.
2. Preservar limites: uma página, sem repetição automática, cooldown de um minuto, uma consulta global, 10 créditos por fornecedor/dia UTC, totais locais Gecko 20/Reef 40. Erros ambíguos mantêm reserva.
3. Não executar consulta ao navegar, filtrar ou recarregar páginas. GET de estado/consultas é somente leitura local.
4. `referenceCents` é referência manual, nunca FIPE. `updatedAt` pode mudar ao favoritar; não representa necessariamente nova observação de mercado. `createdAt` é cadastro local, não publicação.
5. Fotos do catálogo são fornecidas pelo usuário; fotos de fornecedores dependem de autorização de exibição e metadados ainda ausentes. Nenhuma fotografia genérica pode ser atribuída a anúncio.
6. Manter separados catálogo manual e descobertas; análise cruzada deve indicar proveniência e evitar dupla contagem. Não fundir anúncios semelhantes por marca/ano/preço.
7. Estatísticas devem informar seu universo e data. Descobertas sem versão/combustível não permitem comparabilidade exata nem avaliação forte somente pelo desconto.

## Riscos concretos encontrados

- Sem autenticação, acesso deve permanecer loopback; `checkOrigin` não é barreira para clientes não navegador nem substitui autorização.
- URL manual aceita HTTP/HTTPS com restrição de esquema, sem comprovação de licença/atribuição; deve ser apresentada como imagem fornecida pelo usuário. Não há galeria.
- `api/discoveries/.../prices` não usa tratamento padronizado de falhas de banco; uma falha gera resposta genérica do framework.
- Não há limite explícito de tamanho de JSON nos handlers próprios, paginação nem limites de quantidade no catálogo manual. Adequado ao MVP pequeno; requer evolução para grande volume.
- Busca salva está limitada a 30, sem endpoint atual para exclusão; tentativas antigas ficam no banco, mas a interface recebe somente a última.
- Índices existentes atendem operações atuais, mas filtros analíticos novos devem ser validados antes de criar índices sem consulta concreta.
- Logs genéricos de Prisma em `apiError` são do servidor; não introduzir respostas brutas de fornecedores nem segredos em erro cliente.

## Ordem técnica recomendada para implementação

Conservar APIs e conectores e primeiro evoluir UI. Adicionar funções puras de análise em centavos com testes de dados insuficientes e referência manual. Ampliar leitura do histórico/catalogação somente quando necessário à UI. Novas tabelas/colunas, caso indispensáveis, devem ser aditivas e preservar contratos. Serviços FIPE ou novas fotos precisam de fonte configurada e correspondência explícita; sua ausência deve permanecer visível.
