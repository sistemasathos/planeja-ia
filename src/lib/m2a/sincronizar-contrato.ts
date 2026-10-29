import { supabase } from "@/integrations/supabase/client";

export interface M2aSyncItem {
  contratoItemId: number | string | null;
  numero: string | null;
  descricao: string | null;
  quantidadeContratada: number | null;
}

export interface SincronizarContratoResponse {
  ok: boolean;
  m2a_contrato_id: string;
  itens: M2aSyncItem[];
  documentos: Array<{ id: string; nome: string }>;
  error?: string;
}

export interface LocalSyncItem {
  id: string;
  m2a_item_id?: string | null;
  numero_item?: string | null;
  numero?: string | null;
  quantidade: unknown;
  valor_unitario: unknown;
  valor_total: unknown;
}

export function normalizeNumero(v: string | null | undefined): string {
  return String(v ?? "")
    .trim()
    .replace(/^0+/, "")
    .toLowerCase();
}

export function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export async function fetchSincronizarContrato(
  m2aContratoId: string,
): Promise<SincronizarContratoResponse> {
  const { data, error } = await supabase.functions.invoke<SincronizarContratoResponse>(
    "m2a-proxy",
    {
      body: {
        path: "/contratos/sincronizar",
        method: "POST",
        body: { m2a_contrato_id: String(m2aContratoId) },
      },
    },
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || "Falha ao consultar M2A.");
  return data;
}

export function findRemoteItem(
  item: LocalSyncItem,
  remoteItens: M2aSyncItem[],
  usados: Set<string>,
): M2aSyncItem | null {
  if (item.m2a_item_id) {
    const byId = remoteItens.find(
      (r) =>
        String(r.contratoItemId ?? "") === String(item.m2a_item_id) &&
        !usados.has(String(r.contratoItemId)),
    );
    if (byId) return byId;
  }
  const numLocal = normalizeNumero(item.numero_item || item.numero);
  if (numLocal) {
    const byNum = remoteItens.find(
      (r) =>
        normalizeNumero(r.numero) === numLocal &&
        !usados.has(String(r.contratoItemId)),
    );
    if (byNum) return byNum;
  }
  return null;
}

export async function syncContratoItens(opts: {
  itens: LocalSyncItem[];
  remoteItens: M2aSyncItem[];
  throwOnError?: boolean;
}): Promise<{ atualizados: number; semMatch: number; semMudanca: number }> {
  const usados = new Set<string>();
  let atualizados = 0;
  let semMatch = 0;
  let semMudanca = 0;

  for (const item of opts.itens) {
    const remote = findRemoteItem(item, opts.remoteItens, usados);
    if (!remote) {
      semMatch += 1;
      continue;
    }
    usados.add(String(remote.contratoItemId));
    const novaQtd = remote.quantidadeContratada ?? 0;
    const qtdAtual = toNumber(item.quantidade);
    const valorUnit = toNumber(item.valor_unitario);
    const novoTotal = novaQtd * valorUnit;
    const totalAtual = toNumber(item.valor_total);
    const m2aIdRemoto = remote.contratoItemId
      ? String(remote.contratoItemId)
      : null;
    const precisaAtualizar =
      Math.abs(novaQtd - qtdAtual) > 0.0000001 ||
      Math.abs(novoTotal - totalAtual) > 0.005 ||
      (m2aIdRemoto && m2aIdRemoto !== (item.m2a_item_id ?? null));

    if (!precisaAtualizar) {
      semMudanca += 1;
      continue;
    }

    const { error: upErr } = await supabase
      .from("contrato_itens")
      .update({
        quantidade: novaQtd,
        valor_total: novoTotal,
        m2a_item_id: m2aIdRemoto ?? item.m2a_item_id ?? null,
      })
      .eq("id", item.id);

    if (upErr) {
      if (opts.throwOnError) throw upErr;
      console.error("Erro ao atualizar item:", upErr);
      continue;
    }
    atualizados += 1;
  }

  return { atualizados, semMatch, semMudanca };
}

export async function syncContratoDocumentos(opts: {
  contratoId: string;
  documentosRemotos: Array<{ id: string; nome: string }>;
  insertUnmatched?: boolean;
}): Promise<number> {
  const documentosRemotos = opts.documentosRemotos ?? [];
  if (documentosRemotos.length === 0) return 0;

  const { data: docsLocais } = await supabase
    .from("contrato_documentos")
    .select("id, m2a_documento_id, nome")
    .eq("contrato_id", opts.contratoId);

  const updates: Array<PromiseLike<unknown>> = [];
  let vinculados = 0;
  const remotosRestantes = [...documentosRemotos];

  for (const docLocal of docsLocais ?? []) {
    if (docLocal.m2a_documento_id) continue;
    const nomeNormLocal = String(docLocal.nome || "")
      .toUpperCase()
      .trim();
    const idx = remotosRestantes.findIndex((dr) => {
      const nomeNormRemoto = dr.nome.toUpperCase().trim();
      return (
        nomeNormRemoto.includes(nomeNormLocal) ||
        nomeNormLocal.includes(nomeNormRemoto)
      );
    });
    if (idx === -1) continue;
    const matched = remotosRestantes[idx];
    updates.push(
      supabase
        .from("contrato_documentos")
        .update({ m2a_documento_id: matched.id })
        .eq("id", docLocal.id),
    );
    remotosRestantes.splice(idx, 1);
    vinculados += 1;
  }

  if (opts.insertUnmatched) {
    for (const dr of remotosRestantes) {
      updates.push(
        supabase.from("contrato_documentos").insert({
          contrato_id: opts.contratoId,
          nome: dr.nome,
          m2a_documento_id: dr.id,
          tipo: "gerado_portal",
          storage_path: "",
        }),
      );
      vinculados += 1;
    }
  }

  if (updates.length > 0) await Promise.all(updates);
  return vinculados;
}

export async function persistDocumentosGerados(
  contratoId: string,
  documentos: Array<{ id: string; nome: string }>,
): Promise<void> {
  await supabase
    .from("contratos")
    .update({
      m2a_documentos_gerados: documentos.map((d) => ({
        nome: d.nome,
        id_m2a: d.id,
      })) as any,
    })
    .eq("id", contratoId);
}
