# Deploy: GitHub Pages + Supabase + Worker M2A

O **GitHub Pages** hospeda só o front estático (Vite/React). **Postgres, Auth, RLS e Edge Functions** ficam no **Supabase**. A automação **M2A** exige o **vps-worker** em um servidor com URL pública (VPS, Railway, etc.). O Git **não** oferece banco relacional; use Supabase ou Postgres próprio + migrações em `supabase/migrations/`.

---

## Parte A — Publicar no GitHub Pages

### Pré-requisitos

- Conta GitHub
- Projeto Supabase já criado (Parte B) — o build **falha** sem `VITE_SUPABASE_*`
- CLI: `gh auth login` (token válido)

### 1. Criar repositório e enviar código

```bash
cd /caminho/planeja-ia
git init -b main
git add -A
git status   # confira: sem .env, sem database/*.json (gitignore)
git commit -m "Initial commit: Planeja IA + deploy GitHub Pages"
gh repo create planeja-ia --public --source=. --remote=origin --push
```

Ajuste o nome `planeja-ia` se preferir; o workflow usa `/${{ github.event.repository.name }}/` como base do Vite.

### 2. Secrets do repositório (Settings → Secrets → Actions)

| Secret | Valor |
|--------|--------|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon/public key (Dashboard → Settings → API) |

### 3. Ativar GitHub Pages

Settings → **Pages** → Source: **GitHub Actions** (não “Deploy from branch”).

Se o deploy falhar com `Failed to create deployment (status: 404)`, o site ainda não foi criado. Uma vez:

```bash
gh api -X POST repos/SEU_USUARIO/planeja-ia/pages -f build_type=workflow
```

Ou ative manualmente em Settings → Pages.

### 4. Disparar deploy

Push na branch `main` ou Actions → **Deploy GitHub Pages** → Run workflow.

URL final: `https://<usuario>.github.io/<nome-do-repo>/`

### 5. Supabase Auth — URLs permitidas

Dashboard → **Authentication** → **URL Configuration**:

- **Site URL:** `https://<usuario>.github.io/<nome-do-repo>/`
- **Redirect URLs:** mesma URL + `/login`, `/reset-password`

Sem isso, login/recuperação de senha falham em produção.

### 6. Build local (opcional)

```bash
cp .env.example .env   # preencha VITE_*
bun install
bun run build
bun run preview
```

Preview local usa `base: /`; em Pages o CI define `VITE_BASE_PATH=/nome-do-repo/`.

---

## Parte B — Colocar backend no Supabase

Referência de projeto existente: `supabase/config.toml` (`project_id` pode ser trocado ao linkar outro projeto).

### 1. Instalar CLI

```bash
brew install supabase/tap/supabase
supabase login
```

### 2. Criar projeto na nuvem

[supabase.com/dashboard](https://supabase.com/dashboard) → New project → anote **Project URL**, **anon key**, **service_role key**.

### 3. Linkar este repositório

```bash
cd planeja-ia
supabase link --project-ref SEU_PROJECT_REF
```

### 4. Aplicar schema (79 migrações)

```bash
supabase db push
```

Isso cria tabelas (`processos`, `contratos`, `irp_*`, `m2a_*`, …), RLS e RPCs como `get_pauta_consolidada_full`, `next_contrato_number*`, etc.

### 5. Deploy das Edge Functions

```bash
supabase functions deploy m2a-proxy
supabase functions deploy trusted-device
supabase functions deploy system-export
```

### 6. Secrets das Edge Functions

Dashboard → **Edge Functions** → cada função → Secrets, ou:

```bash
supabase secrets set \
  M2A_WORKER_URL=https://sua-vps.example.com \
  M2A_WORKER_SHARED_SECRET=$(openssl rand -hex 32)
```

| Secret | Uso |
|--------|-----|
| `M2A_WORKER_URL` | URL pública do `vps-worker` |
| `M2A_WORKER_SHARED_SECRET` | Mesmo valor que `SHARED_SECRET` no worker |
| `CRON_SECRET` | (opcional) `system-export` agendado |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente no runtime Deno.

### 7. Regenerar tipos (após mudanças de schema)

```bash
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

### 8. Primeiro usuário e papéis

1. Auth → Users → invite ou sign-up pelo app.
2. Inserir papel em `user_roles` (SQL Editor), ex.:

```sql
insert into user_roles (user_id, role)
values ('UUID-DO-USUARIO', 'admin');
```

Roles usadas no app: `admin`, `gestor`, `operador`, `consulta`.

### 9. Restaurar dados (opcional)

**Não** versionar `database/*.json` (PII). Localmente:

```bash
export BACKEND_URL=https://SEU_PROJECT_REF.supabase.co
export BACKEND_SERVICE_KEY=sua_service_role_key
node tools/sync-database-from-backup.mjs database/database-backup.json
```

Ordem de restore respeita `restore_order` no backup. Alternativa: export/import por grupos via edge `system-export` (produção → JSON → script).

### 10. Funcionalidades que dependem do banco

Ex.: **Pauta Consolidada** — UI `PautaConsolidadaExporter` chama RPC `get_pauta_consolidada_full`, mapeia com `prepararDadosPautaConsolidada` e gera Excel com `exportarPautaConsolidadaExcel` (`src/lib/excel-export.ts`). Requer migrações com essas RPCs aplicadas e dados coerentes em `contratos` / itens / secretarias.

---

## Parte C — Worker M2A (VPS)

Necessário para sync de processo, envio de contrato, documentos e numeração.

```bash
cd vps-worker
cp .env.example .env   # M2A_*, SHARED_SECRET igual ao secret da edge
npm ci
node src/server.js     # ou Docker: docker compose up -d
```

Expor HTTPS (nginx/Caddy) e usar essa URL em `M2A_WORKER_URL`.

---

## Parte D — “Banco no Git” (o que faz sentido)

| O quê | Onde |
|-------|------|
| **Schema + RLS** | `supabase/migrations/*.sql` no Git → `supabase db push` |
| **Dados** | Backup JSON local (`database/`) ou export Supabase — **não** substituem Postgres no GitHub |
| **Postgres próprio** | Hospede Postgres (Railway, Neon, VM), rode migrações com `supabase db push` apontando para DB URL, ou aplique SQL manualmente |

GitHub **Pages** + **Actions** não hospedam Postgres. Para stack mínima funcional: **Pages (front) + Supabase (backend) + VPS (M2A)**.

---

## Checklist pós-deploy

- [ ] Login em `https://…github.io/…/login`
- [ ] Dashboard carrega dados
- [ ] Export Pauta Consolidada (processos/contratos) gera `.xlsx`
- [ ] Edge `m2a-proxy` responde (envio M2A — requer worker + credenciais M2A)

---

## Manutenção

- Alterações de schema: nova migration → `supabase db push` → regen `types.ts`
- Alterações de front: push `main` → workflow Pages
- Atualizar `index-status.md` se mudar arquitetura de deploy
