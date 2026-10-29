# Módulos e responsabilidades

Contagem aproximada: **252** arquivos `.ts`/`.tsx` em `src/`, **373** arquivos fonte no repo (excl. `node_modules`, `dist`). Componentes `ui/*` tratados como biblioteca shadcn (55 arquivos), sem inventário de cada export.

## `src/routes/` — rotas TanStack Router

| Arquivo | Path HTTP | Notas |
|---------|-----------|--------|
| `index.tsx` | `/` | Redireciona para `/dashboard` ou `/login` |
| `login.tsx` | `/login` | Auth email/senha (sem auto-cadastro); `search.redirect` |
| `reset-password.tsx` | `/reset-password` | Recuperação de senha |
| `_authenticated.tsx` | layout | `beforeLoad`: sessão Supabase + `tryRestoreFromTrustedDevice` |
| `_authenticated.dashboard.tsx` | `/dashboard` | KPIs / agenda |
| `_authenticated.processos.tsx` | `/processos` | Lista processos |
| `_authenticated.processos.$id.tsx` | `/processos/$id` | Detalhe → feature `processo-detalhe` |
| `_authenticated.contratos.tsx` | `/contratos` | Lista contratos |
| `_authenticated.contratos.$id.tsx` | `/contratos/$id` | Detalhe → `contrato-detalhe` |
| `_authenticated.importar-contratos.tsx` | `/importar-contratos` | Fluxo importação |
| `_authenticated.irp.tsx` | `/irp` | Jobs IRP |
| `_authenticated.irp-colunas.tsx` | `/irp-colunas` | Config colunas IRP / órgãos M2A |
| `_authenticated.secretarias.tsx` | `/secretarias` | CRUD secretarias |
| `_authenticated.numeracao.tsx` | `/numeracao` | Sync numeração M2A |
| `_authenticated.fornecedores.tsx` | `/fornecedores` | Prepostos/fornecedores |
| `_authenticated.fiscais.tsx` | `/fiscais` | Catálogo servidores (cargo FISCAL) |
| `_authenticated.gestores.tsx` | `/gestores` | Catálogo servidores (cargo GESTOR) |
| `_authenticated.historico.tsx` | `/historico` | Jobs IRP (processamentos anteriores) |
| `_authenticated.logs.tsx` | `/logs` | Audit logs (gestor/admin) |

Gerado: `src/routeTree.gen.ts` (não editar manualmente).

## `src/features/` — domínio por vertical

Cada feature segue **components/** + **hooks/** + `lib.ts` (helpers locais).

### `contrato-detalhe`

| Hook | Responsabilidade |
|------|------------------|
| `useContratoDetalhe` | Query contrato + relações |
| `useContratoForm` | Form principal, payload M2A |
| `useEnviarContratoM2A` | `sendToM2A` / progresso |
| `useSincronizarContratoM2A` | Sync portal |
| `useItemMutations` | Itens e dotações |

Componentes notáveis: `EnvioM2ASection`, abas atores/documentos/itens.

### `importar-contratos`

| Hook | Responsabilidade |
|------|------------------|
| `useImportarPlanilha` | Upload + parse (`contratoImport`) |
| `useImportQueries` | Jobs `contrato_import_jobs` |
| `useValidacaoPreGeracao` | Validação M2A pré-geração |
| `useAutorizarGeracao` | Autoriza criação de contratos |
| `useContratosDerivados` | Preview agrupamento |
| `useDeleteImportJob` | Remove job |
| `useItemMutations` | Revisão itens importados |
| `usePrepostosState` | Estado prepostos |

### `irp`

| Hook | Responsabilidade |
|------|------------------|
| `useIrpUploadAnalise` | Upload + `analisar()` |
| `useIrpDetalhe` | Job IRP |
| `useIrpJobsList` | Lista jobs |
| `useIrpSalvarResultado` | Persistência resultado |
| `useEnviarProcessoM2A` | Criação processo SRP/comum |
| `useIrpSecretariasM2A` | Config secretarias no job |
| `useIrpDownloads` | Downloads planilhas |
| `useIrpUnidades` | Unidades processamento |
| `useIrpImportRows` | Linhas importadas |

### `processo-detalhe`

| Hook | Responsabilidade |
|------|------------------|
| `useProcessoDetalhe` | Query processo |
| `useProcessoForm` | Edição + sync M2A |
| `useSincronizarProcessoM2A` | Sync documentos/itens M2A (`lib/m2a/sincronizar-contrato`) |
| `useEnviarContratosM2A` | Envio em lote |
| `useDownloadDocumentos` | `downloadM2ADocuments` |
| `useItensConsolidados` | Itens consolidados |
| `useDeleteContratos` | Exclusão contratos |
| `useContratoFlags` | Flags UI |
| `useProcessoSectionsNav` | Navegação abas |

### `secretarias`

| Hook | Responsabilidade |
|------|------------------|
| `useSecretariasQuery` | Lista/filtros |
| `useSecretariaMutations` | CRUD |
| `useSecretariaForm` / `useSecretariaGroupForm` | Formulários |
| `useSecretariasFilters` | Filtros UI |
| `useSecretariaDeleteDialog` | Confirmação delete |

## `src/lib/` — lógica compartilhada

| Módulo | Exports principais |
|--------|-------------------|
| `audit.ts` | `logAudit(opts)` |
| `contrato-numbering.ts` | `parseContratoSequencia`, `getNextContratoNumbers` |
| `contratoImport.ts` | `parseContratoXlsx`, `agruparContratos`, tipos `ParsedItem`, `ContratoPreliminar` |
| `irp.ts` | `analisar`, `gerarPlanilhaSecretaria`, tipos `AnaliseIRP` |
| `excel-export.ts` | `exportarRelatorioContratoExcel`, `exportarPautaConsolidadaExcel`, `prepararDadosPautaConsolidada` (exceljs lazy) |
| `export.ts` | `downloadCSV` |
| `workbook.ts` | `readXlsxMatrix` — worker `xlsx-parse.worker.ts` + fallback |
| `xlsx-matrix.ts` | Parse ExcelJS → matriz (usado pelo worker e fallback) |
| `error-handler.ts` | `handleGlobalError` |
| `notify.ts` | Toasts Sonner |
| `query-client.ts` | `queryClient` singleton |
| `system-export.ts` | Cliente export backup via edge `system-export` |
| `trusted-device.ts` | `tryRestoreFromTrustedDevice`, revoke/clear |
| `numeracao-m2a.ts` | Sync numeração (usa client M2A) |
| `validators/*` | Zod/schemas IRP, secretaria, parse |
| `utils/*` | `routeHead`, CPF, normalize |

### `src/lib/m2a/` (barrel: `@/lib/m2a`)

| Arquivo | Papel |
|---------|--------|
| `client.ts` | SSE via proxy: `sendToM2A`, `diagnoseM2A`, `listenM2AProgress`, `requestNumeracaoSync`, tipos progresso |
| `worker.ts` | `fetchProcessoFromWorker` → POST `/processos/sync` |
| `payload.ts` | `buildM2AContractPayload`, normalização itens |
| `sync.ts` | Tipos payload sync processo (`M2aSyncPayload`, …) |
| `snapshot.ts` | Snapshot contratos portal |
| `srp.ts` | `criarProcessoSrpM2A` |
| `comum.ts` | `criarProcessoComumM2A` |
| `documents.ts` | `downloadM2ADocuments` |
| `sse.ts` | `consumeSseBuffer`, `readSseStream` |
| `sincronizar-contrato.ts` | Sync itens/docs M2A (hooks de processo e contrato) |
| `atas.ts` | Participantes, saldos por secretaria (via worker) |
| `orgaos-mapping.ts` | Mapeamento órgãos/UO IRP |
| `normSec.ts` | Normalização nome secretaria |

## `src/hooks/`

| Arquivo | Exports |
|---------|---------|
| `useAuth.tsx` | `AuthProvider`, `useAuth` — roles `admin \| gestor \| operador \| consulta` via `user_roles` |
| `useM2ACatalog.ts` | `useUnidadesGestoras`, `useServidores`, `filterServidoresByUnidade` |
| `useM2APreferences.ts` | Preferências envio M2A por UG |
| `useM2ASync.ts` | Orquestra sync numeração/processos |
| `useTheme.tsx` | Tema claro/escuro |
| `use-mobile.tsx` | Breakpoint mobile |

## `src/contexts/`

- `M2AConnectionProvider` — stub; status sempre `connected`.
- `ProgressContext` — tracker global de operações longas.

## `src/components/` (domínio)

- `layout/` — `AppShell`, `CommandPalette`, barras de ação, workflow.
- `contratos/` — editores, export pauta, relatório.
- `dashboard/` — KPIs, calendário, lembretes.
- `irp/` — modais/cards IRP compartilhados.
- `importar/` — helpers importação.
- `m2a/` — `ServidoresCatalogPage`.
- `system/` — `GlobalErrorBoundary`.
- `ui/` — shadcn/Radix (reutilizável, sem lógica de negócio).

## `src/integrations/supabase/`

| Arquivo | Papel |
|---------|--------|
| `client.ts` | Browser client tipado `Database` |
| `types.ts` | Schema gerado: tabelas, enums, RPC |

## Postgres (via `types.ts`) — tabelas

**Operacionais:** `processos`, `contratos`, `contrato_itens`, `contrato_item_dotacoes`, `contrato_atores`, `contrato_documentos`, `secretarias`, `secretaria_contatos`, `secretaria_unidades_equivalentes`, `numeracao`, `profiles`, `user_roles`, `audit_logs`, `trusted_devices`, `app_files`, `fornecedores_prepostos`.

**Importação:** `contrato_import_jobs`, `contrato_import_itens`, `contrato_import_dotacoes`.

**IRP:** `irp_jobs`, `irp_job_secretarias`, `irp_unidades_processamento`.

**M2A cache/catálogo:** `m2a_unidades_gestoras`, `m2a_servidores`, `m2a_servidor_unidade`, `m2a_atas`, `m2a_itens`, `m2a_contratos_snapshot`, `m2a_envio_logs`, `m2a_envio_preferencias`.

**RPC relevantes:** `next_contrato_number*`, `get_contract_report_data`, `get_pauta_consolidada_*`, `get_contratos_valor_total`, `get_dashboard_contratos_por_secretaria`, `get_secretarias_cpfs`, `has_role`, `consume_trusted_device`, `restore_soft_deleted_process`, …

## `supabase/functions/`

| Function | Papel |
|----------|--------|
| `m2a-proxy` | Autentica JWT; assina HMAC; encaminha path/method/body ao worker |
| `trusted-device` | `issue` / `validate` / `revoke` tokens dispositivo confiável |
| `system-export` | Export JSON por grupos de tabelas (`base`, `processos`, `contratos`, `m2a`) |

## `vps-worker/`

- `src/server.js` — registra plugins e rotas.
- `src/auth.js` — HMAC `X-Signature` + `X-Timestamp` (exceto `/health`).
- `src/m2a/*` — orquestradores portal M2A (contrato, processo SRP/comum, atas, IRP API).
- `src/routes/*` — endpoints listados em `dependencies.md`.

## `database/` + `tools/`

- `database/database-backup.json`, `database/groups/*.json` — snapshots para restore/dev.
- `tools/sync-database-from-backup.mjs` — upsert em Supabase quando `BACKEND_URL` + service key definidos.

## `scripts/`

Testes manuais de export pauta (`test-pauta-export.ts`, `.cjs`), referência colunas (`pauta-column-reference.cjs`).
