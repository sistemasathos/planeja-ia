# Visão geral — Planeja IA

**Domínio:** planejamento e gestão de contratações públicas (processos, contratos, IRP, importação de planilhas, integração com portal **M2A**).

**Limitação de índice:** Graphify **não** está disponível neste ambiente; a indexação usou estrutura do repositório, `grep`/glob e leituras parciais de arquivos-chave. Schema Postgres derivado principalmente de `src/integrations/supabase/types.ts` (gerado), não de parsing linha a linha das 79 migrações SQL.

## Stack

| Camada | Tecnologia |
|--------|------------|
| UI | React 19, TypeScript, Vite 7 |
| Roteamento | TanStack Router (file-based em `src/routes/`, árvore em `src/routeTree.gen.ts`) |
| Dados remotos | TanStack Query (`src/lib/query-client.ts`) |
| Backend / auth | Supabase (Auth + Postgres + RLS + RPC) |
| Edge | Supabase Edge Functions (`supabase/functions/`) |
| Automação M2A | VPS worker Fastify (`vps-worker/`), acesso via `m2a-proxy` |
| Estilo | Tailwind CSS 4, shadcn/ui (`src/components/ui/`) |
| Formulários | react-hook-form + zod |
| Planilhas / PDF | exceljs, jszip, jspdf |
| Package manager | Bun (`bun.lock`, `bunfig.toml`) |

**Nota:** `@tanstack/react-start` aparece em `package.json` e em `src/integrations/supabase/auth-*.ts`; o **ponto de entrada atual** é SPA Vite (`index.html` → `src/main.tsx`), não Vinxi/Start.

## Pontos de entrada

| Entrada | Caminho | Papel |
|---------|---------|--------|
| App web | `index.html` → `src/main.tsx` | `createRouter({ routeTree })` + `QueryClientProvider` |
| Rotas | `src/routes/*.tsx` | Guards, páginas, lazy UI |
| Client Supabase | `src/integrations/supabase/client.ts` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` |
| Worker M2A | `vps-worker/src/server.js` | Fastify, rotas REST/SSE |
| Proxy seguro | `supabase/functions/m2a-proxy/index.ts` | JWT Supabase + HMAC → VPS |
| Dev server | `vite.config.ts` | porta **3000**, plugin TanStack Router |

## Layout raiz (`src/routes/__root.tsx`)

Providers aninhados: `AuthProvider`, `M2AConnectionProvider` (stub pós-extensão Chrome), `ProgressProvider`, `GlobalErrorBoundary`, `Toaster`, `GlobalProgressTracker`.

## Variáveis de ambiente (front)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Worker/edge usam secrets Supabase (`SHARED_SECRET`, service role, etc.) — não versionados.

## Diretórios de topo (código)

```
planeja-ia/
├── src/                 # Aplicação React
├── supabase/            # migrations, config, edge functions
├── vps-worker/          # Worker Node/Fastify M2A
├── database/            # Backups JSON agrupados (dados operacionais)
├── tools/               # Scripts utilitários (sync backup)
├── scripts/             # Testes/export pauta (dev)
└── public/              # Assets estáticos
```

## Domínios funcionais (alto nível)

1. **Auth e papéis** — Supabase Auth, `user_roles`, trusted device.
2. **Cadastros** — secretarias, gestores/fiscais (catálogo M2A), fornecedores/prepostos.
3. **Processos e contratos** — CRUD Supabase, detalhe em `src/features/processo-detalhe` e `contrato-detalhe`.
4. **Importação de contratos** — planilha XLSX → jobs em `contrato_import_*`.
5. **IRP** — análise de planilhas (`src/lib/irp.ts`), jobs `irp_*`, envio processo M2A (SRP/comum).
6. **M2A** — sync processo, envio contrato (SSE), documentos, numeração, atas/participantes.
7. **Relatórios / export** — Excel pauta consolidada, relatório contratos (RPC + `excel-export.ts`).
8. **Auditoria / logs** — `audit_logs`, rotas `/logs`, `/historico`.
