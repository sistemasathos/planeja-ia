#!/usr/bin/env node
/** @deprecated Use `node tools/import-database.mjs` (ordem FK, grupos, re-tentativas). */
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const backupPath = process.argv[2] || path.join("database", "database-backup.json");
const raw = await fs.readFile(backupPath, "utf8");
const backup = JSON.parse(raw);

const backendUrl = process.env.BACKEND_URL || process.env.VITE_SUPABASE_URL;
const backendKey = process.env.BACKEND_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!backendUrl || !backendKey) {
  console.log("Backup lido com sucesso, mas BACKEND_URL/BACKEND_SERVICE_KEY não foram definidos.");
  process.exit(0);
}

const client = createClient(backendUrl, backendKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const tables = backup.tables || {};
const order = backup.restore_order || Object.keys(tables);

for (const table of order) {
  const rows = tables[table]?.rows || [];
  if (!rows.length) { console.log(`- ${table}: vazio`); continue; }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await client.from(table).upsert(chunk);
    if (error) throw new Error(`Falha ao sincronizar ${table}: ${error.message}`);
  }
  console.log(`- ${table}: ${rows.length} linha(s) sincronizadas`);
}

console.log("Sincronização concluída.");
