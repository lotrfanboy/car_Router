## Fluxo de manutenção deste projeto

Este projeto é um MVP. Na etapa atual, trabalhar no checkout do PC e fazer commits locais na `main`. O usuário fará o envio para `lotrfanboy/car_Router` no GitHub, salvo pedido explícito para publicar.

- Não criar branches locais ou remotas, worktrees de feature ou pull requests para as manutenções deste projeto, salvo pedido explícito do usuário para mudar esse fluxo.
- Validar as alterações e fazer o commit na `main` local. Não executar push automaticamente.
- Não alterar Render ou Supabase de produção sem pedido explícito. Registros como MECA SP são apenas dados de teste; não criar regras ou dependências específicas para eles.
- Conferir o estado atual da `main` antes de publicar, preservar alterações concorrentes e nunca usar force-push para sobrescrevê-las.
- Esta diretriz é específica deste repositório e prevalece sobre preferências genéricas de fluxo com branches e PRs.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
