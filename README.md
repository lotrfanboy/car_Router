# Radar Automotivo

Aplicação local de usuário único para cadastrar, organizar e comparar anúncios de veículos usados. Banco SQLite persistente, sem serviços pagos, credenciais, importadores, scraping, integrações ou dados de demonstração na inicialização.

## Executar no Windows

Instale **Node.js 24 LTS** e Git. Se recebeu um ZIP, extraia-o, abra o PowerShell na pasta extraída e comece em `Copy-Item` abaixo. O MVP está disponível na branch `main`.

No PowerShell:

```powershell
git clone https://github.com/lotrfanboy/car_Router.git
cd car_Router
git switch main
Copy-Item .env.example .env
npm ci
npm run setup
npm run build
npm start
```

Abra **http://127.0.0.1:3000**. Para parar, pressione Ctrl+C. Se o PowerShell bloquear o script `npm.ps1`, execute os mesmos comandos com `npm.cmd`.

Depois da primeira instalação, basta executar `npm start`. Não apague `prisma/radar.db`: esse arquivo contém seus anúncios e favoritos. Nenhum banco com dados de usuários é versionado.

Para desenvolvimento:

```powershell
npm run dev
```

Em Linux/macOS, substitua `Copy-Item .env.example .env` por `cp .env.example .env`. O restante é igual. Os comandos de desenvolvimento e produção escutam apenas em **127.0.0.1**, sem publicação na rede.

## Funcionalidades

- Dashboard com total de anúncios, favoritos, preço médio, contagem abaixo da referência, origens e registros recentes.
- Cadastro, edição, exclusão com confirmação e página própria de detalhes.
- Marca, modelo, versão, fabricação/modelo, quilometragem, preço, referência, cidade/UF, combustível, câmbio, origem, links, imagem por URL e observações.
- Catálogo em cards e tabela; busca sem distinção de acentos e maiúsculas.
- Filtros combináveis: marca, modelo, intervalo de ano/preço, quilometragem máxima, cidade, estado, origem e favoritos.
- Ordenação por preço crescente/decrescente, menor quilometragem, maior ano e cadastro recente.
- Favoritos persistentes; seleção de até três veículos para comparação lado a lado.
- Comparação de preço com referência manual, em reais e percentual. Sem consulta à FIPE ou nota arbitrária.
- Layout responsivo, menu mobile, estados vazios, carregamento, erros, retorno visual das ações e fallback para imagens ausentes ou quebradas.

Valores monetários são armazenados em **centavos inteiros**. A diferença é `preço - referência`; o percentual é `diferença / referência × 100`. A referência deve ser maior que zero, quando preenchida.

## Arquitetura

- Next.js 16 (App Router), React 19, TypeScript e Tailwind CSS 4.
- Prisma 6.19, adaptador oficial `@prisma/adapter-libsql` e SQLite **em arquivo local**. Não é usado Turso ou qualquer serviço remoto.
- Validação compartilhada com Zod; ícones Lucide; Vitest.
- `src/lib/vehicle.ts`: validação, filtros, ordenações e cálculo.
- `src/lib/repository.ts`: persistência com Prisma.
- `src/app/api/vehicles`: API JSON e tratamento de erros.
- `src/components`: componentes, formulário e estado da interface.
- `prisma/schema.prisma` e `prisma/migrations`: modelo e migração versionada.

Uma única entidade Vehicle reúne os dados do anúncio neste MVP; não há entidades artificiais sem uso. IDs, campos obrigatórios e índices estão no banco; limites, URLs HTTP/HTTPS, enumerações e coerência de anos são validados no servidor. Futuras integrações poderão chamar a camada de persistência/validação sem depender da interface.

A instalação usa o motor JavaScript do Prisma. O **adaptador de migrações no Prisma 6 é experimental** e está fixado na versão 6.19. O motor nativo não pôde ser baixado na nuvem por restrição de rede; a alternativa JavaScript foi efetivamente validada com migrações e testes. Webpack é usado explicitamente para evitar a dependência de sockets internos do Turbopack neste ambiente.

O caminho em `.env` é relativo à raiz do projeto:

```dotenv
DATABASE_URL="file:./prisma/radar.db"
```

Para atualizar um banco existente, execute `npm run setup`: gera o cliente e aplica apenas migrações pendentes. Não execute comandos de reset em um banco com dados importantes. Para backup, pare a aplicação e copie o arquivo SQLite e eventuais arquivos auxiliares de journal/WAL junto dele.

## Testar

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

Os testes Vitest usam um SQLite temporário e removem-no ao concluir. Não modificam o banco de uso diário.

O roteiro opcional de navegador `scripts/browser_check.py` usa Python, Playwright e Chromium instalado. Ele inicia o build de produção em 127.0.0.1:3100 com **outro banco temporário**, testa os fluxos e salva screenshots em `docs/screenshots`. Execute após o build:

```sh
python scripts/browser_check.py
```

O caminho padrão do Chromium nesse script é `/usr/bin/chromium`; em outro sistema, informe a variável `CHROMIUM_PATH`. Python/Playwright não são necessários para usar o produto ou rodar os testes Vitest.

Veja [resultados de validação](docs/VALIDACAO.md) e [screenshots](docs/screenshots). Os registros que aparecem nas imagens são **fixtures exclusivas dos testes**, nunca um seed do produto.

## Roteiro de aceitação manual

1. Abra o painel vazio e cadastre um veículo com preço de R$ 90.000 e referência de R$ 100.000.
2. Confira a indicação de 10% abaixo (R$ 10.000) nos detalhes.
3. Favorite, recarregue a página, pare e reinicie a aplicação; confira a persistência.
4. Cadastre outros veículos, combine filtros e alterne entre cards e tabela.
5. Selecione dois ou três anúncios e abra o comparador.
6. Edite um anúncio, salve e confira os valores atualizados.
7. Cancele uma exclusão; depois confirme-a e confira a remoção do catálogo e da seleção.

## Limitações reais e segurança local

- **Não exponha publicamente sem autenticação, autorização, HTTPS e medidas de segurança adicionais.** Não há autenticação; a checagem de origem nas mutações não substitui controle de acesso.
- O catálogo é carregado integralmente e filtrado no navegador. Paginação e consulta filtrada no servidor ficam para volumes maiores.
- Seleção para comparar é uma preferência da aba; anúncios e favoritos ficam no SQLite.
- Imagens são URLs externas carregadas pelo navegador, sem upload, cache ou garantia de disponibilidade; não há busca de imagens pelo servidor.
- Não há histórico de preços, sincronização, múltiplos usuários, notificações ou coleta automática.
- Instalação inicial requer acesso ao npm; depois de instalado, o núcleo funciona sem serviços externos.
- A execução foi validada em Linux na nuvem; as instruções Windows são fornecidas, mas não houve máquina Windows disponível para verificação.
