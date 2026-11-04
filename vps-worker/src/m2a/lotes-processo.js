// Lotes do processo administrativo.
// A coluna LOTE da pauta agrupa os itens. Os lotes são criados no cadastro
// do processo; os itens só entram depois da DFD, da justificativa e da
// reordenação.

import FormData from "form-data";
import { m2a } from "../m2a-client.js";
import { loadDoc } from "./utils.js";

const INCLUIR_LOTE = (processoId) =>
  `/processo_administrativo/lote/incluir/${processoId}/`;
const TABELA_LOTES = (processoId) =>
  `/processo_administrativo/lote/tabela/${processoId}/?page_size=1000`;
const ITENS_SEM_LOTE = (loteId) =>
  `/processo_administrativo/lote/tabela_itens_sem_lotes/${loteId}/?page_size=1000`;
const INCLUIR_ITENS = (loteId) =>
  `/processo_administrativo/lote/incluir_item_processo_administrativo/${loteId}/`;

export function normDesc(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Igualdade da descrição inteira, ou prefixo longo o bastante para incluir o BTUS. */
export function casaDescricao(portal, planilha) {
  const a = normDesc(portal);
  const b = normDesc(planilha);
  if (!a || !b) return false;
  if (a === b) return true;
  const menor = a.length <= b.length ? a : b;
  const maior = a.length <= b.length ? b : a;
  return menor.length >= 80 && maior.startsWith(menor);
}

function baseUrl() {
  return String(m2a.http?.defaults?.baseURL || "").replace(/\/$/, "");
}

function rotuloDoGrupo(numero, descricoes) {
  const re =
    /AR\s+CONDICIONADO(?:\s+TIPO\s+[A-Z0-9/]+)?\s+DE\s+[\d.]+\s+BTUS/i;
  for (const desc of descricoes) {
    const m = String(desc || "").match(re);
    if (m) {
      return `LOTE ${numero} - ${m[0].replace(/\s+/g, " ").trim().toUpperCase()}`;
    }
  }
  return `LOTE ${numero}`;
}

function gruposPorLote(itens) {
  const grupos = new Map();
  for (const item of itens || []) {
    const numero = String(item?.lote ?? "").trim();
    if (!numero || numero === "0") continue;
    if (!grupos.has(numero)) grupos.set(numero, []);
    grupos.get(numero).push(String(item?.descricao || ""));
  }
  return [...grupos.entries()].sort(
    (a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]),
  );
}

function htmlDaResposta(raw) {
  const text = String(raw || "").trim();
  if (!text.startsWith("{")) return text;
  try {
    const data = JSON.parse(text);
    return String(data.html || data.html_form || data.data || text);
  } catch {
    return text;
  }
}

function extrairLinhas($, seletorCheckbox) {
  const out = [];
  $(seletorCheckbox).each((_, el) => {
    const $el = $(el);
    const id = String($el.attr("value") || "").trim();
    if (!/^\d+$/.test(id)) return;
    if (out.some((linha) => linha.id === id)) return;
    const $tr = $el.closest("tr");
    const textos = $tr
      .find("td span")
      .map((__, span) => $(span).text().replace(/\s+/g, " ").trim())
      .get()
      .filter((t) => /[A-Za-zÀ-ÿ]/.test(t) && t.length > 3);
    out.push({ id, descricao: textos[0] || "" });
  });
  return out;
}

async function listarLotes(processoId) {
  const path = TABELA_LOTES(processoId);
  const res = await m2a.get(path, {
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${baseUrl()}/processo_administrativo/${processoId}/`,
    },
  });
  if (res.status >= 400) {
    throw new Error(`listarLotes(${processoId}): status ${res.status}`);
  }
  const $ = loadDoc(htmlDaResposta(res.html));
  return extrairLinhas($, "input.checkboxes_lote, input[name='checkbox']");
}

async function incluirLote(processoId, descricao) {
  const path = INCLUIR_LOTE(processoId);
  const referer = `${baseUrl()}${path}`;
  const enviar = async (token) => {
    const form = new FormData();
    form.append("csrfmiddlewaretoken", token);
    form.append("descricao_lote", descricao);
    form.append("_salvar", "");
    return m2a.postMultipart(path, form, {
      ajax: false,
      headers: {
        Referer: referer,
        Origin: baseUrl(),
      },
    });
  };
  let token = await m2a.getCsrf(path, { force: true });
  let res;
  try {
    res = await enviar(token);
  } catch (err) {
    if (!String(err?.message || err).includes("M2A_CSRF_STALE")) throw err;
    token = await m2a.getCsrf(path, { force: true });
    res = await enviar(token);
  }
  if (res.status === 403) {
    token = await m2a.getCsrf(path, { force: true });
    res = await enviar(token);
  }
  if (res.status >= 400) {
    throw new Error(`incluirLote(${descricao}): status ${res.status}`);
  }
  const $ = loadDoc(res.html);
  const alerta = $(".alert-danger, .errorlist")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (alerta) throw new Error(`incluirLote(${descricao}): ${alerta}`);
  return res;
}

/**
 * Cria os lotes que ainda não existem. Devolve [{ id, numero, descricao }].
 */
export async function garantirLotesDoProcesso(processoId, itens) {
  const grupos = gruposPorLote(itens);
  if (!grupos.length) {
    console.log(`[lotes] processo ${processoId}: nenhum lote na planilha.`);
    return [];
  }
  const desejados = grupos.map(([numero, descricoes]) => ({
    numero,
    descricao: rotuloDoGrupo(numero, descricoes),
  }));
  let existentes = await listarLotes(processoId);
  const criados = [];
  for (const desejado of desejados) {
    const ja = existentes.find((l) => casaDescricao(l.descricao, desejado.descricao));
    if (ja) {
      criados.push({ id: ja.id, numero: desejado.numero, descricao: desejado.descricao });
      continue;
    }
    await incluirLote(processoId, desejado.descricao);
    existentes = await listarLotes(processoId);
    const novo = existentes.find((l) => casaDescricao(l.descricao, desejado.descricao));
    if (!novo) {
      throw new Error(
        `Lote "${desejado.descricao}" não apareceu na tabela do processo ${processoId}.`,
      );
    }
    criados.push({ id: novo.id, numero: desejado.numero, descricao: desejado.descricao });
    console.log(`[lotes] criado ${desejado.descricao} id=${novo.id}`);
  }
  return criados;
}

async function listarItensSemLote(loteId) {
  const res = await m2a.get(ITENS_SEM_LOTE(loteId), {
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${baseUrl()}/processo_administrativo/lote/${loteId}/`,
    },
  });
  if (res.status >= 400) {
    throw new Error(`listarItensSemLote(${loteId}): status ${res.status}`);
  }
  const $ = loadDoc(htmlDaResposta(res.html));
  return extrairLinhas(
    $,
    "input[name='checkboxSemLote'], tr.tr_processo_administrativo_item_sem_lote input.checkboxes",
  );
}

async function incluirItensNoLote(loteId, itemIds) {
  const path = INCLUIR_ITENS(loteId);
  const referer = `${baseUrl()}/processo_administrativo/lote/${loteId}/`;
  const csrfPath = `/processo_administrativo/lote/${loteId}/`;
  const { res } = await m2a.postFormRefreshingCsrf(path, {
    csrfPath,
    buildBody: (token) => {
      const body = new URLSearchParams();
      body.set("csrfmiddlewaretoken", token);
      body.set("itens", itemIds.join(" "));
      body.set("lote_pk", String(loteId));
      return body;
    },
    headers: {
      Accept: "*/*",
      Referer: referer,
    },
  });
  if (res.status >= 400) {
    const corpo = String(res.html || "").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(`incluirItensNoLote(${loteId}): status ${res.status} corpo="${corpo}"`);
  }
}

/**
 * Depois da DFD, da justificativa e da reordenação, puxa cada item para o lote
 * da coluna C.
 */
export async function vincularItensAosLotes(processoId, lotes, itens) {
  if (!lotes?.length) return { vinculados: 0, semMatch: 0 };
  const porNumero = new Map();
  for (const item of itens || []) {
    const numero = String(item?.lote ?? "").trim();
    if (!numero) continue;
    if (!porNumero.has(numero)) porNumero.set(numero, []);
    porNumero.get(numero).push(String(item.descricao || ""));
  }
  let semLote = await listarItensSemLote(lotes[0].id);
  let vinculados = 0;
  let semMatch = 0;
  for (const lote of lotes) {
    const desejadas = porNumero.get(String(lote.numero)) || [];
    const ids = [];
    for (const desc of desejadas) {
      const achado = semLote.find(
        (p) => !ids.includes(p.id) && casaDescricao(p.descricao, desc),
      );
      if (!achado) {
        semMatch++;
        console.warn(
          `[lotes] processo ${processoId}: item sem correspondência no lote ${lote.numero}: "${desc.slice(0, 80)}"`,
        );
        continue;
      }
      ids.push(achado.id);
    }
    if (!ids.length) continue;
    await incluirItensNoLote(lote.id, ids);
    semLote = semLote.filter((p) => !ids.includes(p.id));
    vinculados += ids.length;
    console.log(
      `[lotes] ${ids.length} item(ns) no lote ${lote.id} (${lote.descricao})`,
    );
  }
  return { vinculados, semMatch };
}
