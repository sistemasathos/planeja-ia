#!/usr/bin/env node
/**
 * Importa backups JSON (database/database-backup.json ou database/groups/*.json)
 * para o Supabase via REST + service role.
 *
 * Uso:
 *   export BACKEND_URL=https://SEU_REF.supabase.co
 *   export BACKEND_SERVICE_KEY=sua_service_role_key
 *
 *   node tools/import-database.mjs                    # backup completo, se existir
 *   node tools/import-database.mjs --groups           # base → processos → contratos → m2a
 *   node tools/import-database.mjs caminho/backup.json
 *   node tools/import-database.mjs --dry-run --groups
 *   node tools/import-database.mjs --continue-on-error --passes 3
 *   node tools/import-database.mjs --ensure-auth-users   # cria auth.users a partir de profiles (UUID + e-mail)
 *   node tools/import-database.mjs --skip profiles,user_roles
 *   node tools/import-database.mjs --no-reset-m2a-catalog   # não apaga catálogo M2A antes do import (padrão: limpa)
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const GROUP_FILES = ["base.json", "processos.json", "contratos.json", "m2a.json"];

/** Mesma ordem de system-export / database-backup.json (pais antes dos filhos). */
const DEFAULT_RESTORE_ORDER = [
  "profiles",
  "user_roles",
  "secretarias",
  "secretaria_contatos",
  "fornecedores_prepostos",
  "numeracao",
  "m2a_unidades_gestoras",
  "m2a_servidores",
  "m2a_servidor_unidade",
  "processos",
  "contratos",
  "contrato_itens",
  "contrato_item_dotacoes",
  "contrato_atores",
  "contrato_documentos",
  "m2a_atas",
  "m2a_itens",
  "m2a_contratos_snapshot",
  "m2a_envio_preferencias",
];

const CHUNK_SIZE = 500;

/** Colunas do UNIQUE / PK usadas no upsert (evita duplicate key em re-import). */
const UPSERT_ON_CONFLICT = {
  user_roles: "user_id,role",
  /** PK estável no backup; upsert em m2a_id trocava id_local e quebrava FK em m2a_servidor_unidade. */
  m2a_unidades_gestoras: "id_local",
  m2a_servidores: "id_local",
  m2a_servidor_unidade: "servidor_id,unidade_id",
};

const M2A_CATALOG_TABLES = [
  "m2a_unidades_gestoras",
  "m2a_servidores",
  "m2a_servidor_unidade",
];

/** Nomes no backup (app atual) → coluna em DB legado (schema incompleto). */
const COLUMN_REMAP = {
  // m2a_contratos_snapshot: após migrações recentes use secretaria_sigla do backup direto
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const strippedColumnLog = new Set();

function remapRowForTable(table, row) {
  const out = { ...row };
  const map = COLUMN_REMAP[table];
  if (map) {
    for (const [from, to] of Object.entries(map)) {
      if (from in out && out[to] === undefined) out[to] = out[from];
      delete out[from];
    }
  }
  return out;
}

function dedupeRowsForTable(table, rows) {
  if (table === "user_roles") {
    const map = new Map();
    for (const r of rows) {
      map.set(`${r.user_id}\0${r.role}`, r);
    }
    return [...map.values()];
  }
  return rows;
}

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    continueOnError: false,
    passes: 1,
    groups: false,
    files: [],
    skipTables: new Set(),
    ensureAuthUsers: false,
    fixEmailCollision: true,
    resetM2aCatalog: true,
    m2aCatalogResetDone: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--continue-on-error") opts.continueOnError = true;
    else if (a === "--ensure-auth-users") opts.ensureAuthUsers = true;
    else if (a === "--no-ensure-auth-users") opts.ensureAuthUsers = false;
    else if (a === "--no-fix-email-collision") opts.fixEmailCollision = false;
    else if (a === "--no-reset-m2a-catalog") opts.resetM2aCatalog = false;
    else if (a === "--groups") opts.groups = true;
    else if (a === "--passes") opts.passes = Math.max(1, Number(argv[++i] || 1));
    else if (a === "--skip") {
      for (const t of (argv[++i] || "").split(",")) {
        if (t.trim()) opts.skipTables.add(t.trim());
      }
    } else if (a.startsWith("-")) {
      console.error(`Opção desconhecida: ${a}`);
      process.exit(1);
    } else opts.files.push(a);
  }
  return opts;
}

async function resolveInputFiles(opts, cwd) {
  if (opts.files.length) return opts.files.map((f) => path.resolve(cwd, f));
  if (opts.groups) {
    const dir = path.join(cwd, "database", "groups");
    return GROUP_FILES.map((f) => path.join(dir, f));
  }
  const full = path.join(cwd, "database", "database-backup.json");
  try {
    await fs.access(full);
    return [full];
  } catch {
    const dir = path.join(cwd, "database", "groups");
    return GROUP_FILES.map((f) => path.join(dir, f));
  }
}

function mergeBackups(parsedList) {
  const tables = {};
  let restoreOrder = [];
  for (const backup of parsedList) {
    if (Array.isArray(backup.restore_order) && backup.restore_order.length) {
      restoreOrder = backup.restore_order;
    }
    const src = backup.tables || {};
    for (const [name, block] of Object.entries(src)) {
      const rows = block?.rows ?? (Array.isArray(block) ? block : []);
      if (!rows.length) continue;
      if (!tables[name]) tables[name] = { rows: [] };
      tables[name].rows.push(...rows);
    }
  }
  if (!restoreOrder.length) {
    restoreOrder = DEFAULT_RESTORE_ORDER.filter((t) => tables[t]?.rows?.length);
    const extra = Object.keys(tables).filter((t) => !restoreOrder.includes(t));
    restoreOrder.push(...extra);
  } else {
    const extra = Object.keys(tables).filter((t) => !restoreOrder.includes(t));
    restoreOrder = [...restoreOrder, ...extra];
  }
  return { tables, restoreOrder };
}

async function loadBackups(filePaths) {
  const parsed = [];
  for (const fp of filePaths) {
    try {
      await fs.access(fp);
    } catch {
      console.warn(`⚠ Arquivo não encontrado (ignorado): ${fp}`);
      continue;
    }
    console.log(`📂 Lendo ${path.basename(fp)}…`);
    const raw = await fs.readFile(fp, "utf8");
    parsed.push(JSON.parse(raw));
  }
  if (!parsed.length) {
    console.error("Nenhum backup encontrado.");
    process.exit(1);
  }
  return mergeBackups(parsed);
}

function randomPassword() {
  return `${crypto.randomUUID()}Aa1!`;
}

async function findAuthUserByEmail(client, email) {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

async function authUserExists(client, userId) {
  const { data, error } = await client.auth.admin.getUserById(userId);
  return !error && !!data?.user;
}

/** Cria auth.users com os mesmos UUIDs/e-mails do backup (service role). */
async function ensureAuthUsersFromProfiles(client, profiles, opts) {
  if (!profiles?.length) return;
  if (opts.dryRun) {
    console.log(
      `🔐 [dry-run] Criaria/atualizaria ${profiles.length} usuário(s) Auth a partir de profiles`,
    );
    return;
  }

  console.log(`🔐 Garantindo ${profiles.length} usuário(s) em auth.users…`);
  let created = 0;
  let skipped = 0;
  let replaced = 0;

  for (const p of profiles) {
    const id = p.id;
    const email = (p.email || "").trim().toLowerCase();
    if (!id || !email) {
      console.warn("  ⚠ profile sem id/e-mail, ignorado");
      continue;
    }

    if (await authUserExists(client, id)) {
      skipped++;
      continue;
    }

    const { error: createErr } = await client.auth.admin.createUser({
      id,
      email,
      email_confirm: true,
      password: randomPassword(),
      user_metadata: { nome: p.nome ?? "" },
    });

    if (!createErr) {
      created++;
      continue;
    }

    const msg = createErr.message || "";
    const duplicate = /already|registered|exists|duplicate/i.test(msg);
    if (!duplicate) {
      throw new Error(`auth.users ${email}: ${msg}`);
    }

    const byEmail = await findAuthUserByEmail(client, email);
    if (byEmail?.id === id) {
      skipped++;
      continue;
    }

    if (byEmail && opts.fixEmailCollision) {
      console.warn(
        `  ↻ E-mail ${email} existe com UUID ${byEmail.id}, backup exige ${id} — recriando Auth`,
      );
      await client.auth.admin.deleteUser(byEmail.id);
      const { error: retryErr } = await client.auth.admin.createUser({
        id,
        email,
        email_confirm: true,
        password: randomPassword(),
        user_metadata: { nome: p.nome ?? "" },
      });
      if (retryErr) throw new Error(`auth.users ${email} (após recriar): ${retryErr.message}`);
      replaced++;
      continue;
    }

    console.error(
      `  ✗ ${email}: Auth UUID=${byEmail?.id ?? "?"} ≠ profile.id=${id}. ` +
        "Use --fix-email-collision (padrão com --ensure-auth-users) ou apague o usuário no Dashboard.",
    );
  }

  console.log(
    `🔐 Auth: ${created} criado(s), ${skipped} ok, ${replaced} recriado(s) por UUID`,
  );
  console.log(
    "   Senhas novas são aleatórias — use “Esqueci minha senha” no login ou redefina no Dashboard.\n",
  );
}

/** Só importa linhas cujo UUID existe em auth.users (evita profiles_id_fkey). */
async function filterRowsByAuthUser(client, rows, { idKey, label }) {
  if (!rows?.length) return [];
  const kept = [];
  for (const row of rows) {
    const id = row[idKey];
    if (!id) continue;
    if (await authUserExists(client, id)) kept.push(row);
    else {
      console.warn(`⚠ ${label}: sem auth.users para ${idKey}=${id} — linha ignorada`);
    }
  }
  if (kept.length < rows.length) {
    console.log(`   ${label}: ${kept.length}/${rows.length} linha(s) com Auth válido`);
  }
  return kept;
}

async function upsertChunk(client, table, chunk) {
  let rows = chunk.map((r) => remapRowForTable(table, r));
  const onConflict = UPSERT_ON_CONFLICT[table];

  for (let attempt = 0; attempt < 30; attempt++) {
    const { error } = await client.from(table).upsert(rows, {
      ...(onConflict ? { onConflict } : {}),
      ignoreDuplicates: false,
    });
    if (!error) return;

    const missingCol = error.message.match(
      /Could not find the '([^']+)' column of '([^']+)'/,
    );
    if (missingCol) {
      const col = missingCol[1];
      const key = `${table}.${col}`;
      if (!strippedColumnLog.has(key)) {
        strippedColumnLog.add(key);
        console.warn(
          `  ↳ ${table}: coluna '${col}' ausente no Supabase — removida do payload (aplique migrações pendentes)`,
        );
      }
      rows = rows.map(({ [col]: _drop, ...rest }) => rest);
      continue;
    }

    throw new Error(error.message);
  }
  throw new Error(`${table}: muitas colunas ausentes no schema remoto`);
}

/** Remove catálogo M2A parcial (FK servidor_id/unidade_id → id_local). */
async function resetM2aCatalogTables(client, opts) {
  if (opts.dryRun || !opts.resetM2aCatalog || opts.m2aCatalogResetDone) return;
  opts.m2aCatalogResetDone = true;
  console.log(
    "🔄 Limpando catálogo M2A (m2a_servidor_unidade → m2a_servidores → m2a_unidades_gestoras)…",
  );
  let { error } = await client
    .from("m2a_servidor_unidade")
    .delete()
    .neq("servidor_id", NIL_UUID);
  if (error) throw new Error(`m2a_servidor_unidade (reset): ${error.message}`);

  ({ error } = await client.from("m2a_servidores").delete().neq("id_local", NIL_UUID));
  if (error) throw new Error(`m2a_servidores (reset): ${error.message}`);

  ({ error } = await client.from("m2a_unidades_gestoras").delete().neq("id_local", NIL_UUID));
  if (error) throw new Error(`m2a_unidades_gestoras (reset): ${error.message}`);
}

async function importTable(client, table, rows, opts) {
  if (M2A_CATALOG_TABLES.includes(table) && rows.length) {
    await resetM2aCatalogTables(client, opts);
  }
  if (opts.skipTables.has(table)) {
    console.log(`- ${table}: ignorado (--skip)`);
    return { ok: true, skipped: true };
  }
  if (!rows.length) {
    console.log(`- ${table}: vazio`);
    return { ok: true };
  }
  if (opts.dryRun) {
    console.log(`- ${table}: ${rows.length} linha(s) [dry-run]`);
    return { ok: true };
  }
  const deduped = dedupeRowsForTable(table, rows);
  for (let i = 0; i < deduped.length; i += CHUNK_SIZE) {
    const chunk = deduped.slice(i, i + CHUNK_SIZE);
    await upsertChunk(client, table, chunk);
  }
  console.log(`- ${table}: ${deduped.length} linha(s) OK`);
  return { ok: true };
}

async function runImport(client, tables, restoreOrder, opts) {
  const failed = new Set();
  for (let pass = 1; pass <= opts.passes; pass++) {
    if (opts.passes > 1) console.log(`\n=== Passagem ${pass}/${opts.passes} ===`);
    for (const table of restoreOrder) {
      const rows = tables[table]?.rows || [];
      if (!rows.length && !failed.has(table)) continue;
      if (pass > 1 && !failed.has(table)) continue;

      try {
        await importTable(client, table, rows, opts);
        failed.delete(table);
      } catch (err) {
        const msg = err?.message || String(err);
        console.error(`✗ ${table}: ${msg}`);
        failed.add(table);
        if (!opts.continueOnError) {
          console.error(
            "\nImport interrompido. Use --continue-on-error para seguir, " +
              "--passes 3 para re-tentar FKs, ou --skip tabela1,tabela2.",
          );
          process.exit(1);
        }
      }
    }
    if (failed.size === 0) break;
  }
  if (failed.size) {
    console.error(`\n⚠ Tabelas com falha após ${opts.passes} passagem(ns): ${[...failed].join(", ")}`);
    process.exit(1);
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const cwd = process.cwd();

  const backendUrl = process.env.BACKEND_URL || process.env.VITE_SUPABASE_URL;
  const backendKey =
    process.env.BACKEND_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const filePaths = await resolveInputFiles(opts, cwd);
  const { tables, restoreOrder } = await loadBackups(filePaths);

  const totalRows = Object.values(tables).reduce(
    (n, b) => n + (b.rows?.length || 0),
    0,
  );
  console.log(
    `\nTabelas: ${Object.keys(tables).length} | Linhas: ${totalRows} | Ordem: ${restoreOrder.join(" → ")}\n`,
  );

  if (!backendUrl || !backendKey) {
    console.log(
      "Defina BACKEND_URL e BACKEND_SERVICE_KEY (service role, não anon) para importar.",
    );
    process.exit(opts.dryRun ? 0 : 1);
  }

  if (backendKey === process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    console.warn(
      "⚠ Usando anon key — RLS pode bloquear inserts. Prefira BACKEND_SERVICE_KEY.",
    );
  }

  const client = createClient(backendUrl, backendKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const profileRows = tables.profiles?.rows || [];
  if (profileRows.length && !opts.skipTables.has("profiles")) {
    if (opts.ensureAuthUsers) {
      await ensureAuthUsersFromProfiles(client, profileRows, opts);
    } else {
      console.log(
        "ℹ profiles → auth.users: use --ensure-auth-users ou --skip profiles,user_roles\n",
      );
    }
  }

  if (!opts.dryRun && tables.profiles?.rows?.length) {
    tables.profiles.rows = await filterRowsByAuthUser(client, tables.profiles.rows, {
      idKey: "id",
      label: "profiles",
    });
  }
  if (!opts.dryRun && tables.user_roles?.rows?.length) {
    tables.user_roles.rows = await filterRowsByAuthUser(client, tables.user_roles.rows, {
      idKey: "user_id",
      label: "user_roles",
    });
  }

  await runImport(client, tables, restoreOrder, opts);
  console.log("\n✅ Importação concluída.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
