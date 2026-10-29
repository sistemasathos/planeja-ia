# Status da indexação

**Data:** 2026-10-29 (RPCs de lista/dashboard + `get_secretarias_cpfs` com filtro)  
**Graphify:** indisponível (nenhum namespace/tool encontrado). Não simulado.

## Método

1. Inventário via glob (`src/`, `supabase/`, `vps-worker/`, raiz).
2. Assinaturas e rotas via `grep` (exports, `createFileRoute`, endpoints Fastify).
3. Schema Postgres via `src/integrations/supabase/types.ts` (gerado).
4. Leitura integral **apenas** em: `package.json`, `vite.config.ts`, `main.tsx`, `_authenticated.tsx`, `__root.tsx` (parcial), `client.ts`, trechos M2A/worker/edge, `server.js`, amostra rotas worker.

## Cobertura verificada

| Área | Cobertura | Notas |
|------|-----------|--------|
| Rotas TanStack | Alta | 20 arquivos + `routeTree.gen.ts` |
| Features (5) | Alta (hooks + layout) | Componentes listados por feature; não cada JSX |
| `src/lib` | Alta | Exports principais indexados |
| `src/lib/m2a` | Alta | Fluxos proxy/SSE/worker |
| `src/components/ui` | Metadado | 55 componentes shadcn — sem assinaturas individuais |
| `src/integrations/supabase` | Alta | Client + tabelas/RPC em types |
| `supabase/migrations` | Baixa (nome/contagem) | 79 arquivos `.sql` — **não** parseados |
| Edge functions | Média | 3 functions — cabeçalhos e propósito |
| `vps-worker` | Alta (rotas + auth) | Lógica `m2a/*` indexada por arquivo, não linha a linha |
| `database/*.json` | Metadado | Estrutura de grupos; **conteúdo de linhas omitido** (PII/volume) |
| `scripts/`, `tools/` | Média | Propósito identificado |
| Testes automatizados | Não encontrados | Sem pasta `tests/`/`__tests__` significativa no inventário |
| Raiz binários/docs | Parcial | `.xlsx`, `.lovable/`, changelogs não analisados em profundidade |

## Contagens

- ~373 arquivos `.ts`/`.tsx`/`.js`/`.sql` (excl. `node_modules`, `dist`)
- 252 arquivos TS/TSX em `src/`
- 79 migrações SQL

## Exclusões (intencionais)

| Caminho | Motivo |
|---------|--------|
| `node_modules/`, `dist/`, `build/`, caches | `.cursorignore` / artefatos |
| Conteúdo row-level em `database/*.json` | Dados operacionais/PII; só metadados de grupo |
| Corpo completo de cada migration SQL | Redundante com `types.ts` para índice inicial |
| Cada componente `ui/*` | Biblioteca genérica |

## Lacunas conhecidas

1. **RLS e políticas** — definidas em SQL migrations; não extraídas para este índice.
2. **Query keys exatas** — dispersas nos hooks; não catalogadas uma a uma.
3. **Regras de negócio finas** nos orquestradores worker (`processos.js` ~1.5k linhas) — endpoints mapeados, lógica interna resumida.
4. **Autorização por rota/papel** — roles carregadas no auth; restrições por página podem estar só na UI/RLS.
5. **`auth-middleware.ts` / Start** — possível legado; runtime confirmado como Vite SPA.
6. **Graphify** — ausente; dependências call-graph não automatizadas.

## Manutenção incremental

1. Antes de explorar código: ler `docs/architecture/overview.md` + doc do domínio afetado.
2. Após mudanças: atualizar **somente** seções afetadas (rotas, tabelas, endpoints worker, exports novos).
3. Se `types.ts` for regenerado: revisar tabelas/RPC em `modules.md`.
4. Novas rotas: refletir em `modules.md` e `critical-flows.md`; `routeTree.gen.ts` é fonte de verdade para paths.
5. Não refazer inventário global salvo se `index-status.md` estiver desatualizado ou após refactors estruturais amplos.
6. Registrar data e escopo no topo de `index-status.md` a cada atualização significativa.

## Arquivos de documentação

- `docs/architecture/overview.md`
- `docs/architecture/modules.md`
- `docs/architecture/dependencies.md`
- `docs/architecture/critical-flows.md`
- `docs/architecture/index-status.md` (este arquivo)

## Deploy

- `docs/architecture/deploy.md` — GitHub Pages, Supabase, worker M2A, restore de dados.

## Regras Cursor

- `.cursor/rules/zero-waste.mdc` (existente)
- `.cursor/rules/architecture-index.mdc` (criado nesta indexação)
