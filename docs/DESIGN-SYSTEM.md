# Sistema visual

A base visual está centralizada em `src/app/globals.css`. Detalhes usam CSS module próprio; mercado possui estilos de rota. Os componentes existentes foram evoluídos, preservando os fluxos de formulário/CRUD/portais.

- Fundo grafite `--bg`, superfícies carvão `--surface`/`--surface-raised`, bordas neutras `--line` e texto suave `--ink`.
- Acento único lima `--accent`/`--green` para ação principal, navegação atual e gráficos. Positivo e negativo financeiros são semânticos (`--positive`, `--negative`), não decoração.
- Fonte de sistema moderna (Inter quando disponível, Segoe UI/Arial como fallback), sem requisições externas ou licenças adicionais. Valores financeiros com algarismos tabulares.
- Escala editorial: título de página 27–30px; hero 31–41px; seções 15–22px; controles e dados compactos com hierarquia. Corpos de textos extensos mantêm espaçamento de linha ampliado.
- Raios 6px em controles, 10px em superfícies; espaçamentos e sombra definidos em tokens. Evitar sombras/glow em superfícies comuns.
- Foco visível, labels de formulário, skip-link, `aria-current` na navegação, `aria-pressed` em favoritos/visualizações, status/erro legíveis, skeletons, dialog nativo e suporte a movimento reduzido.
- Fotos somente por URL do anúncio cadastrada pelo usuário, com domínio de origem identificado; `object-fit: contain` preserva o veículo. Ausência/falha exibe fallback. O motivo orbital da home é ilustração abstrata de navegação, não uma visualização de dados.
- Gráficos têm unidades, filtros conectados, descrições, tabela alternativa e dados efetivos. Sem série de evolução quando não há histórico agregado suficiente.

Validação visual em 390, 768, 1280 e 1440px está registrada em `VALIDACAO-TRANSFORMACAO.md`. Isso não constitui certificação de acessibilidade WCAG ou medição de usuários reais.
