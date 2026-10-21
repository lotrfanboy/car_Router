# Validação do MVP

Verificação executada no ambiente de nuvem Linux do Codex, com Node.js 24.19.0 e Chromium, em 20/10/2026 (America/Sao_Paulo).

## Resultados

| Verificação                                   | Resultado                                                |
| --------------------------------------------- | -------------------------------------------------------- |
| Instalação das dependências                   | Concluída; package-lock.json versionado                  |
| Geração do cliente Prisma                     | Concluída                                                |
| Inicialização do SQLite e migração versionada | Concluídas via prisma migrate deploy                     |
| TypeScript                                    | Sem erros                                                |
| ESLint                                        | Sem erros ou avisos                                      |
| Vitest                                        | 25 testes aprovados em 3 arquivos                        |
| Build Next.js de produção                     | Concluído com Webpack                                    |
| Navegador desktop                             | Aprovado em 1440 × 1000                                  |
| Navegador mobile                              | Aprovado em 390 × 844, sem overflow horizontal da página |
| Exceções JavaScript no navegador              | Nenhuma no roteiro final                                 |
| Persistência após reinício real do servidor   | Confirmada                                               |
| Banco padrão ao final                         | Vazio (zero veículos)                                    |

## Cobertura efetivamente executada

- Validação e normalização de campos, limites monetários, quilometragem, anos, UF, combustível e URLs.
- Cálculo de referência abaixo, acima, igual, ausente e zero.
- Busca com acentos, filtros simultâneos, limites e todas as cinco ordenações.
- API real com banco SQLite temporário: criação, consulta, atualização, favoritos, reconexão, exclusão e registros inexistentes.
- Rejeição de JSON inválido, dados inválidos e requisições de outras origens.
- Regressão da diferença entre o Host recebido e o endereço interno normalizado pelo Next.js.
- Pelo navegador: cadastro de três registros temporários, detalhes, favoritos, reload, reinício do processo da aplicação, filtros simultâneos, cards/tabela, ordenação, comparação de três e dois veículos, edição, confirmação/cancelamento de exclusão, menu mobile e registro inexistente.
- Inspeção visual das seis screenshots de dashboard vazio, detalhes, catálogo, comparação e telas mobile.

Os testes usam bancos temporários. Os anúncios de teste não são seed, não são carregados por padrão e não permanecem no banco de uso diário.

## Ajustes necessários no ambiente

O ambiente bloqueou o domínio dos binários nativos do Prisma. Foi usado o motor JavaScript com o adaptador oficial libSQL para SQLite local. A geração do cliente e a aplicação de migrações passaram. O adaptador de migrações do Prisma 6 ainda é experimental; essa limitação está descrita no README.

O comando inicial migrate dev não inicializou a tabela interna de migrações nessa combinação do adaptador. A migração foi gerada com migrate diff a partir do schema e aplicada com migrate deploy, inclusive em bancos temporários novos. O comando documentado de instalação usa esse caminho validado.

Turbopack não conseguiu abrir seu socket interno neste ambiente. Desenvolvimento e build usam Webpack. Testes e build que precisaram de subprocessos foram executados com a permissão de execução do ambiente.

O teste de navegador detectou uma rejeição indevida de origem no cadastro por 127.0.0.1. O servidor agora compara a origem com o Host recebido; a correção tem teste de regressão e passou pelo fluxo completo.

## Limites da verificação

- Não houve execução em Windows; as instruções PowerShell foram documentadas, mas não validadas em uma máquina Windows.
- Não foram feitos testes de carga, auditoria formal de acessibilidade ou teste de segurança completo.
- As screenshots exercitam o fallback sem imagem. Disponibilidade de imagens em servidores externos não é garantida.
- Não houve deploy público.

## Screenshots

- [Dashboard com base vazia](screenshots/01-dashboard-vazio.png)
- [Detalhes com registro temporário](screenshots/02-detalhes-teste.png)
- [Catálogo com registros temporários](screenshots/03-catalogo-teste.png)
- [Comparador com registros temporários](screenshots/04-comparacao-teste.png)
- [Catálogo mobile](screenshots/05-mobile-catalogo-teste.png)
- [Cadastro mobile](screenshots/06-mobile-cadastro.png)
