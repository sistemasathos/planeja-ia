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

/**
 * A célula da coluna LOTE manda no nome.
 * "1" ou "LOTE 1" viram "LOTE 1".
 * "LOTE 1 - ARCONDICIONADO 9.000 BUTS" é usado como está.
 */
export function interpretarCelulaLote(celula) {
  const texto = String(celula ?? "").replace(/\s+/g, " ").trim();
  if (!texto || texto === "0") return null;

  const soNumero = texto.match(/^0*(\d+)$/);
  if (soNumero) {
    const numero = String(Number(soNumero[1]));
    if (numero === "0") return null;
    return { numero, nome: `LOTE ${numero}`, soNumero: true };
  }

  const rotulo = texto.match(/^LOTE\s+0*(\d+)\b(.*)$/i);
  if (rotulo) {
    const numero = String(Number(rotulo[1]));
    if (numero === "0") return null;
    const resto = rotulo[2].replace(/^[\s\-–—:]+/, "").trim();
    if (!resto) return { numero, nome: `LOTE ${numero}`, soNumero: true };
    return { numero, nome: texto, soNumero: false };
  }

  const comNumero = texto.match(/^0*(\d+)\b(.*)$/);
  if (comNumero) {
    const numero = String(Number(comNumero[1]));
    if (numero === "0") return null;
    const resto = comNumero[2].replace(/^[\s\-–—:]+/, "").trim();
    if (!resto) return { numero, nome: `LOTE ${numero}`, soNumero: true };
    return { numero, nome: texto, soNumero: false };
  }

  return null;
}

function gruposPorLote(itens) {
  const grupos = new Map();
  for (const item of itens || []) {
    const parsed = interpretarCelulaLote(item?.lote);
    if (!parsed) continue;
    if (!grupos.has(parsed.numero)) {
      grupos.set(parsed.numero, {
        numero: parsed.numero,
        nome: parsed.nome,
        soNumero: parsed.soNumero,
      });
    }
    const grupo = grupos.get(parsed.numero);
    if (grupo.soNumero && !parsed.soNumero) {
      grupo.nome = parsed.nome;
      grupo.soNumero = false;
    }
  }
  return [...grupos.values()].sort(
    (a, b) => Number(a.numero) - Number(b.numero) || a.numero.localeCompare(b.numero),
  );
}

function loteCompativel(descricaoPortal, desejado) {
  if (normDesc(descricaoPortal) === normDesc(desejado.nome)) return true;
  if (!desejado.soNumero) return false;
  const portal = normDesc(descricaoPortal);
  const base = normDesc(`LOTE ${desejado.numero}`);
  if (!portal || !base) return false;
  if (portal === base) return true;
  return portal.startsWith(`${base} `) || portal.startsWith(`${base}-`);
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
  let existentes = await listarLotes(processoId);
  const faltantes = grupos.filter(
    (desejado) => !existentes.some((l) => loteCompativel(l.descricao, desejado)),
  );
  for (const desejado of faltantes) {
    await incluirLote(processoId, desejado.nome);
  }
  if (faltantes.length) existentes = await listarLotes(processoId);

  const criados = [];
  for (const desejado of grupos) {
    const achado = existentes.find((l) => loteCompativel(l.descricao, desejado));
    if (!achado) {
      throw new Error(
        `Lote "${desejado.nome}" não apareceu na tabela do processo ${processoId}.`,
      );
    }
    criados.push({ id: achado.id, numero: desejado.numero, descricao: desejado.nome });
    console.log(`[lotes] ${desejado.nome} id=${achado.id}`);
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
    const parsed = interpretarCelulaLote(item?.lote);
    if (!parsed) continue;
    if (!porNumero.has(parsed.numero)) porNumero.set(parsed.numero, []);
    porNumero.get(parsed.numero).push(String(item.descricao || ""));
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
