// =====================================================================
// Fluxo de geração de IRP via API M2A (substitui importacao_planilha).
// 8 passos, todos no padrão do portal Django da M2A.
// =====================================================================

import FormData from "form-data";
import { m2a } from "../m2a-client.js";
import { loadDoc, sleep, formatQuantidadeM2A, adicionarDiasUteis } from "./utils.js";

// Sanitiza quantidade para o Django M2A.
// Regras:
//  - aceita number, "1.500" (ponto = milhar do Excel) ou "1500,5" (vírgula = decimal);
//  - inteiro vira string sem decimais ("1500");
//  - decimal vira string com vírgula ("1500,5");
//  - inválido/<0 → "0".
export function sanitizeQuantidadeM2A(value) {
  let n;
  if (typeof value === "number") {
    n = value;
  } else {
    const raw = String(value ?? "").trim();
    if (!raw) {
      n = 0;
    } else if (raw.includes(",")) {
      // formato BR: "1.500,75" → 1500.75
      n = Number(raw.replace(/\./g, "").replace(",", "."));
    } else if ((raw.match(/\./g) || []).length > 1) {
      // múltiplos pontos = separador de milhar ("1.500.000")
      n = Number(raw.replace(/\./g, ""));
    } else {
      n = Number(raw);
    }
  }
  if (!Number.isFinite(n) || n < 0) n = 0;
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}
// alias retrocompatível
const sanitizeQuantidadeDFD = sanitizeQuantidadeM2A;
import { resolverNaturezaId } from "./irp-naturezas.js";
import { resolverUnidadeId, nomeUnidadeNormalizado } from "./irp-unidades.js";

const URL_ITEM_TEMP = "/catalogo/itemtemporario/incluir/";
const URL_ITEM_JSON = (id) => `/catalogo/itempadronizado-json/${id}`;
const URL_SOLICITACAO_ITEM = (dfdId) =>
  `/gestao_compras/solicitacao_item/incluir/${dfdId}/`;
const URL_SOLICITACAO_ITEM_TABELA = (dfdId) =>
  `/gestao_compras/solicitacao_item/tabela/${dfdId}/?page_size=1000`;
const URL_GERAR_INTENCOES = (dfdId) =>
  `/gestao_compras/formalizacao_demanda/gerar_intencoes/${dfdId}/`;
const URL_TABELA_INTENCOES = (dfdId) =>
  `/gestao_compras/intencao_registro_preco/tabela_solicitacao/${dfdId}?page_size=1000`;
const URL_SOLICITACAO = (id) =>
  `/gestao_compras/intencao_registro_preco/solicitacao/${id}/`;
const URL_DISPONIBILIZAR = (id) =>
  `/gestao_compras/intencao_registro_preco/disponibilizar/${id}/?detail_solicitacao=true`;
const URL_MANIFESTAR = (id) =>
  `/gestao_compras/intencao_registro_preco/manifestar_interesse/${id}/?detail_solicitacao=true`;
const URL_ITENS_INTENCAO = (intencaoId) =>
  `/gestao_compras/intencao_registro_item/tabela/${intencaoId}/?page_size=1000`;
const URL_ATUALIZAR_QTD_ITEM = (itemIntencaoId) =>
  `/gestao_compras/intencao_registro_item/atualizar_quantidade/${itemIntencaoId}/`;
const URL_FINALIZAR_CONSOLIDACAO = (id) =>
  `/gestao_compras/intencao_registro_preco/finalizar_para_consolidacao/${id}/?detail_solicitacao=true`;
const URL_CONSOLIDAR = (id) =>
  `/gestao_compras/intencao_registro_preco/consolidar/${id}/`;
const URL_EDITAR_INTENCAO = (id) =>
  `/gestao_compras/intencao_registro_preco/atualizar/${id}/?detail=true`;




// Lê a página de edição da IRP e extrai os IDs canônicos do formulário.
// Retorna { orgaoId, unidadeId } como strings (ou null se ausentes).
export async function obterUnidadeOrcamentariaDaIntencao(intencaoId) {
  if (!isValidNumericId(String(intencaoId))) {
    throw new Error(
      `obterUnidadeOrcamentariaDaIntencao: intencaoId inválido "${intencaoId}".`,
    );
  }
  const res = await m2a.get(URL_EDITAR_INTENCAO(intencaoId));
  if (res.status >= 400) {
    throw new Error(
      `obterUnidadeOrcamentariaDaIntencao(${intencaoId}): status ${res.status}`,
    );
  }
  const $ = loadDoc(res.html);

  const pegarCampo = (name) => {
    // 1) <input> com value numérico (hidden ou não)
    let inpVal = null;
    $(`input[name="${name}"]`).each((_i, el) => {
      if (inpVal) return;
      const v = String($(el).attr("value") || "").trim();
      if (/^\d+$/.test(v)) inpVal = v;
    });
    if (inpVal) return inpVal;

    // 2) <select> com <option selected>
    const $sel = $(`select[name="${name}"]`);
    if ($sel.length) {
      let val = null;
      $sel.find("option").each((_i, el) => {
        if (val) return;
        const attrs = el.attribs || {};
        const isSel = attrs.selected !== undefined;
        if (!isSel) return;
        const v = String(attrs.value || "").trim();
        if (/^\d+$/.test(v)) val = v;
      });
      if (val) return val;

      // 3) Select2/AJAX: o portal pode renderizar apenas a opção atual.
      const numericos = $sel
        .find("option")
        .toArray()
        .map((el) => String((el.attribs || {}).value || "").trim())
        .filter((v) => /^\d+$/.test(v));
      if (numericos.length === 1) return numericos[0];
    }
    return null;
  };

  let unidadeId = pegarCampo("unidade_orcamentaria");
  let orgaoId = pegarCampo("orgao");

  // 4) Fallback regex no HTML cru (templates que populam via JS).
  if (!unidadeId) {
    const m = res.html.match(/name=["']unidade_orcamentaria["'][^>]*?value=["'](\d+)["']/i);
    if (m) unidadeId = m[1];
  }
  if (!orgaoId) {
    const m = res.html.match(/name=["']orgao["'][^>]*?value=["'](\d+)["']/i);
    if (m) orgaoId = m[1];
  }

  if (!unidadeId || !orgaoId) {
    const trechos = res.html.match(/name=["'](?:orgao|unidade_orcamentaria)["'][\s\S]{0,400}/gi) || [];
    console.warn(
      `[irp-api] obterUnidadeOrcamentariaDaIntencao(${intencaoId}) → orgao=${orgaoId || "?"} unidade=${unidadeId || "?"} (HTML não expôs IDs; trechos=${trechos.length})`,
    );
    if (trechos[0]) console.warn(`[irp-api]   trecho: ${trechos[0].replace(/\s+/g, " ").slice(0, 300)}`);
  } else {
    console.log(
      `[irp-api] obterUnidadeOrcamentariaDaIntencao(${intencaoId}) → orgao=${orgaoId} unidade=${unidadeId}`,
    );
  }
  return { orgaoId, unidadeId, html: res.html };
}

// página com CSRF "global" — qualquer página interna serve
const URL_DFD_LIST = "/gestao_compras/formalizacao_demanda/tabela/?page_size=10";

async function getCsrfGlobal() {
  return await m2a.getCsrf(URL_DFD_LIST, { force: false });
}

// Valida que o value de checkbox é um ID numérico real (não "on", não vazio).
function isValidNumericId(v) {
  return typeof v === "string" && /^\d+$/.test(v);
}

// Lê a resposta de um POST de formulário Django e detecta a "tela vermelha".
// Em sucesso o Django responde 302 → axios segue o redirect (status 200) e a
// página final NÃO contém .has-error/.alert-danger/.help-block (form-errors).
// Em falha, o Django re-renderiza a MESMA url do form com classes de erro
// preenchidas — é isso que detectamos aqui.
function detectDjangoFormErrors(html) {
  if (!html || typeof html !== "string") return [];
  // Acelera: só carrega Cheerio se houver marcador suspeito.
  if (
    !/has-error|alert-danger|errorlist|invalid-feedback|help-block|text-danger/i.test(
      html,
    )
  ) {
    return [];
  }
  const $ = loadDoc(html);
  const errs = [];
  $(".has-error, .form-group.has-error, .invalid-feedback, .errorlist li, .alert-danger, .alert.alert-error, .help-block.text-danger, span.text-danger, ul.errorlist li").each(
    (_i, el) => {
      const $el = $(el);
      const msg = ($el.text() || "").replace(/\s+/g, " ").trim();
      if (!msg) return;
      // ignora ruído informativo
      if (/sucesso|salv|inclu[ií]d|cadastrad/i.test(msg)) return;
      // tenta achar o label do campo
      let field = "";
      const $grp = $el.closest(".form-group, .field, .row");
      if ($grp.length) {
        field = ($grp.find("label").first().text() || "").replace(/\s+/g, " ").trim();
      }
      errs.push({ field: field || "?", message: msg });
    },
  );
  // dedup
  const seen = new Set();
  return errs.filter((e) => {
    const k = `${e.field}::${e.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function ensureDjangoFormAccepted(res, contexto, extra = "") {
  if (res.status >= 300 && res.status < 400) return null;
  // 1) se for JSON e disser error, propaga (ex: cadastrar item temporário).
  let json = null;
  try {
    json = JSON.parse(res.html);
  } catch {}
  if (json) {
    const ok =
      json.ok === true ||
      json.success === true ||
      json.status === "ok" ||
      json.status === "success";
    if (!ok) {
      const msg =
        json.mensagem || json.message || json.msg || json.error || json.erro || JSON.stringify(json);
      throw new Error(`${contexto}${extra ? ` (${extra})` : ""}: ${msg}`);
    }
    return json;
  }
  // 2) HTTP error
  if (res.status >= 400) {
    throw new Error(`${contexto}${extra ? ` (${extra})` : ""}: HTTP ${res.status}`);
  }
  // 3) Django "200 OK + tela vermelha" — armadilha clássica
  const erros = detectDjangoFormErrors(res.html);
  if (erros.length) {
    for (const e of erros) {
      console.error(
        `[irp-api] M2A recusou ${contexto}${extra ? ` (${extra})` : ""} — campo="${e.field}" erro="${e.message}"`,
      );
    }
    const resumo = erros.map((e) => `${e.field}: ${e.message}`).join(" | ");
    throw new Error(
      `${contexto}${extra ? ` (${extra})` : ""}: M2A rejeitou o formulário → ${resumo}`,
    );
  }
  return null;
}

function extractIdsFromRows(html, selectors) {
  const $ = loadDoc(html);
  const ids = [];
  $("tr").each((_, tr) => {
    const $tr = $(tr);
    let id = "";
    $tr.find(selectors).each((_i, el) => {
      if (id) return;
      const v = $(el).attr("value") || "";
      if (isValidNumericId(v)) id = v;
    });
    if (!id) {
      const m = ($tr.attr("id") || "").match(/(\d+)$/);
      if (m && isValidNumericId(m[1])) id = m[1];
    }
    if (id) ids.push(id);
  });
  return [...new Set(ids)];
}

function ensureOkJson(res, contexto, arquivo = "") {
  return ensureDjangoFormAccepted(res, contexto, arquivo);
}


// =====================================================================
// PASSO 1 — cadastra item temporário no catálogo
// =====================================================================
export async function cadastrarItemTemporario({
  descricao,
  especificacao,
  unidade,
  natureza,
}) {
  const naturezaId = resolverNaturezaId(natureza);
  if (!naturezaId) {
    throw new Error(
      `Natureza "${natureza}" não está mapeada em irp-naturezas.js`,
    );
  }
  const unidadeId = resolverUnidadeId(unidade);
  if (!unidadeId) {
    throw new Error(
      `Unidade "${unidade}" (normalizada: "${nomeUnidadeNormalizado(unidade)}") não está mapeada em irp-unidades.js`,
    );
  }

  const csrf = await getCsrfGlobal();
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("descricao", String(descricao || "").trim().toUpperCase());
  body.set("especificacao", String(especificacao || "").trim());
  body.set("unidade", unidadeId);
  body.set("natureza_despesa", naturezaId);

  const res = await m2a.request("POST", URL_ITEM_TEMP, {
    body: body.toString(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${m2a.http.defaults.baseURL || ""}${URL_ITEM_TEMP}`,
    },
  });

  let json = null;
  try {
    json = JSON.parse(res.html);
  } catch {
    /* */
  }
  const itemPadronizadoId =
    json?.item_padronizado_id ?? json?.item_padronizado ?? json?.id ?? null;
  if (!itemPadronizadoId) {
    throw new Error(
      `cadastrarItemTemporario: portal não retornou item_padronizado_id (resp=${String(res.html || "").slice(0, 300)})`,
    );
  }
  console.log(
    `[irp-api] item temporário criado: id=${itemPadronizadoId} descr="${descricao.slice(0, 60)}"`,
  );
  return {
    itemPadronizadoId: String(itemPadronizadoId),
    naturezaId,
    unidadeId,
  };
}

// =====================================================================
// PASSO 2 (helper) — pega unidade_fornecimento_id do item padronizado
// =====================================================================
export async function obterUnidadeFornecimento(itemPadronizadoId) {
  const res = await m2a.get(URL_ITEM_JSON(itemPadronizadoId));
  let json = null;
  try {
    json = JSON.parse(res.html);
  } catch {
    throw new Error(
      `obterUnidadeFornecimento: resposta não-JSON (${res.html.slice(0, 200)})`,
    );
  }
  // o portal devolve { unidade_fornecimento: { id: 92797, ... } } ou
  // {unidades_fornecimento: [{id, ...}]} — cobrimos os dois.
  // A Bíblia da M2A define a forma canônica: unidade_fornecimento[0].id (array).
  // Mantemos fallbacks defensivos para outras formas já vistas em produção.
  const ufId =
    json?.unidade_fornecimento?.[0]?.id ??
    json?.unidade_fornecimento?.id ??
    (typeof json?.unidade_fornecimento === "number" || typeof json?.unidade_fornecimento === "string"
      ? json.unidade_fornecimento
      : null) ??
    json?.unidades_fornecimento?.[0]?.id ??
    json?.id_unidade_fornecimento ??
    null;
  if (!ufId) {
    throw new Error(
      `obterUnidadeFornecimento: id ausente no JSON (${JSON.stringify(json).slice(0, 300)})`,
    );
  }
  return String(ufId);
}

// =====================================================================
// PASSO 2 — adiciona item na DFD (Solicitação) da Gerenciadora
// =====================================================================
export async function incluirItemNaDFD({
  dfdId,
  itemPadronizadoId,
  unidadeFornecimentoId,
  naturezaId,
  especificacao,
  quantidade,
  knownBeforeCount,
}) {
  const beforeLen =
    typeof knownBeforeCount === "number"
      ? knownBeforeCount
      : (await listarItensDFD(dfdId).catch((err) => {
          console.warn(`[irp-api] não consegui listar itens da DFD antes do POST: ${err?.message ?? err}`);
          return [];
        })).length;
  const csrf = await m2a.getCsrf(URL_SOLICITACAO_ITEM(dfdId), { force: true });
  const fd = new FormData();
  fd.append("csrfmiddlewaretoken", csrf);
  fd.append("item_padronizado", String(itemPadronizadoId));
  fd.append("item_padronizado_especificacao_text", String(especificacao || ""));
  fd.append("natureza_despesa", String(naturezaId));
  fd.append("unidade_fornecimento", String(unidadeFornecimentoId));
  const qtyStr = sanitizeQuantidadeDFD(quantidade);
  fd.append("quantidade", qtyStr);
  fd.append("padrao_descritivo_processo", "");
  fd.append("_salvar", "");

  const res = await m2a.postMultipart(URL_SOLICITACAO_ITEM(dfdId), fd, {
    ajax: false,
    maxRedirects: 0,
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Origin: m2a.http.defaults.baseURL || "",
      Referer: `${m2a.http.defaults.baseURL || ""}${URL_SOLICITACAO_ITEM(dfdId)}`,
    },
  });
  if (res.status >= 400) {
    throw new Error(
      `incluirItemNaDFD: status ${res.status} item_padronizado=${itemPadronizadoId}`,
    );
  }
  try {
    ensureOkJson(res, "incluirItemNaDFD", String(itemPadronizadoId));
  } catch (err) {
    const msg = String(err?.message ?? err);
    // Item já existe na DFD: tratamos como sucesso idempotente.
    if (/já existe um item com o mesmo produto\/serviço/i.test(msg)) {
      console.warn(
        `[irp-api] item ${itemPadronizadoId} já presente na DFD ${dfdId} — tratado como sucesso (idempotente).`,
      );
      return { ok: true, duplicate: true };
    }
    throw err;
  }
  const afterIds = await listarItensDFD(dfdId);
  if (afterIds.length <= beforeLen) {
    throw new Error(
      `incluirItemNaDFD (${itemPadronizadoId}): M2A aceitou o POST, mas o item não apareceu na tabela da DFD ${dfdId}.`,
    );
  }
  console.log(
    `[irp-api] item ${itemPadronizadoId} vinculado à DFD ${dfdId}; itens antes=${beforeLen} depois=${afterIds.length}`,
  );
  return { ok: true };
}

export async function listarItensDFD(dfdId) {
  const res = await m2a.get(URL_SOLICITACAO_ITEM_TABELA(dfdId));
  if (res.status >= 400) throw new Error(`listarItensDFD(${dfdId}): status ${res.status}`);
  const ids = extractIdsFromRows(
    res.html,
    "input.checkboxsolicitacao_item, input.checkbox-solicitacao-item, input.checkboxes, input[type=checkbox]",
  );
  console.log(`[irp-api] listarItensDFD(${dfdId}) → ${ids.length} itens`);
  return ids;
}

// =====================================================================
// PASSO 3 — dispara geração das intenções para todas as participantes
// =====================================================================
export async function gerarIntencoes(dfdId) {
  const pagina = `/gestao_compras/formalizacao_demanda/${dfdId}/`;
  const csrf = await m2a.getCsrf(pagina, { force: true });
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", csrf);
  body.set("text", "true");
  const res = await m2a.request("POST", URL_GERAR_INTENCOES(dfdId), {
    body: body.toString(),
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: refererAbsoluto(pagina),
    },
  });
  if (res.status >= 400) throw new Error(`gerarIntencoes: status ${res.status}`);
  try {
    ensureOkJson(res, "gerarIntencoes");
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (/n[aã]o permitida/i.test(msg)) {
      const existentes = await listarIntencoes(dfdId);
      if (existentes.length) {
        console.warn(
          `[irp-api] gerarIntencoes(${dfdId}): ${msg} ${existentes.length} intenção(ões) já existem — seguindo sem gerar de novo.`,
        );
        return { ok: true, already: true, total: existentes.length };
      }
      throw new Error(
        `${msg} A DFD ${dfdId} não tem intenções. O portal bloqueia a geração quando ela não é registro de preço, está sem itens, ou é uma DFD antiga reaproveitada.`,
      );
    }
    throw err;
  }
  return { ok: true };
}

// =====================================================================
// PASSO 4 — lê a tabela e extrai apenas os INTENCAO_IDs numéricos.
// A identificação da Unidade Orçamentária é feita depois, abrindo a
// página de edição de cada IRP (obterUnidadeOrcamentariaDaIntencao),
// onde o portal expõe os IDs canônicos do Django (orgao + unidade_orcamentaria).
// =====================================================================
export async function listarIntencoes(dfdId) {
  const res = await m2a.get(URL_TABELA_INTENCOES(dfdId));
  if (res.status >= 400) throw new Error(`listarIntencoes: status ${res.status}`);
  const $ = loadDoc(res.html);
  const linhas = $("tr.tr_intencao_registro_preco, tr.kt-datatable__row").toArray();
  const out = [];
  for (const tr of linhas) {
    const $tr = $(tr);
    let id = "";
    $tr
      .find("input.checkboxes, input.checkbox-intencao, input[type=checkbox]")
      .each((_i, el) => {
        if (id) return;
        const v = $(el).attr("value") || "";
        if (isValidNumericId(v)) id = v;
      });
    if (!id) {
      const m = ($tr.attr("id") || "").match(/(\d+)$/);
      if (m && isValidNumericId(m[1])) id = m[1];
    }
    if (!isValidNumericId(id)) continue;
    out.push({ intencaoId: String(id) });
  }
  console.log(`[irp-api] listarIntencoes dfd=${dfdId} → ${out.length} intenções`);
  return out;
}


function refererAbsoluto(path) {
  const base = String(m2a.http?.defaults?.baseURL || "").replace(/\/$/, "");
  return `${base}${path}`;
}

function csrfDoHtml(html) {
  const token = m2a.rememberCsrf(html, "");
  return token || null;
}

/**
 * data_aviso = 1 dia útil após o cadastro da DFD.
 * data_consolidacao = 8 dias úteis após o aviso.
 * O portal (`/core/proximo_dia_util`) entra só quando devolve uma data
 * igual ou posterior ao cálculo local — assim um feriado empurra a data
 * e uma resposta curta demais não substitui os 8 dias úteis.
 */
export async function calcularDatasManifestacaoIrp(dataCadastroISO) {
  const base = String(dataCadastroISO || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    throw new Error(`data da DFD inválida para IRP: "${dataCadastroISO}"`);
  }
  const dataAviso = await proximoDiaUtilPortal(base, 1);
  const dataConsolidacao = await proximoDiaUtilPortal(dataAviso, 8);
  console.log(
    `[irp-api] datas IRP cadastro=${base} aviso=${dataAviso} consolidacao=${dataConsolidacao}`,
  );
  return { dataAviso, dataConsolidacao };
}

async function proximoDiaUtilPortal(dataISO, quantidadeDias) {
  const local = adicionarDiasUteis(dataISO, quantidadeDias);
  try {
    const res = await m2a.get(
      `/core/proximo_dia_util?data_atual=${encodeURIComponent(dataISO)}&quantidade_dias=${quantidadeDias}`,
      {
        headers: {
          Accept: "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
        },
      },
    );
    let portal = "";
    try {
      portal = String(JSON.parse(res.html).data_proximo_dia_util || "").slice(0, 10);
    } catch {
      portal = "";
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(portal)) {
      console.warn(
        `[irp-api] proximo_dia_util(${dataISO}, ${quantidadeDias}) sem data; local=${local}`,
      );
      return local;
    }
    if (portal < local) {
      console.warn(
        `[irp-api] proximo_dia_util(${dataISO}, ${quantidadeDias}) portal=${portal} anterior a ${quantidadeDias} dia(s) útil(eis) (${local}); usando local`,
      );
      return local;
    }
    if (portal !== local) {
      console.log(
        `[irp-api] proximo_dia_util(${dataISO}, ${quantidadeDias}) portal=${portal} local=${local} → portal`,
      );
    }
    return portal;
  } catch (err) {
    console.warn(
      `[irp-api] proximo_dia_util falhou (${err?.message || err}); local=${local}`,
    );
    return local;
  }
}

export async function abrirSolicitacaoIntencao(intencaoId, referer) {
  const path = URL_SOLICITACAO(intencaoId);
  const res = await m2a.get(path, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      ...(referer ? { Referer: referer } : {}),
    },
  });
  if (res.status >= 400) {
    throw new Error(`abrirSolicitacaoIntencao(${intencaoId}): GET ${res.status}`);
  }
  const csrf = csrfDoHtml(res.html) || (await getCsrfGlobal());
  return { csrf, html: res.html };
}

// =====================================================================
// PASSO 5.1 — disponibilizar
// O portal exige data_aviso e data_consolidacao NESTE post.
// Gravar o formulário de edição (data_notificacao) não preenche essas críticas.
// =====================================================================
export async function disponibilizarIntencao(
  intencaoId,
  { dataAviso, dataConsolidacao, csrf } = {},
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataAviso || ""))) {
    throw new Error(`disponibilizarIntencao(${intencaoId}): data_aviso inválida "${dataAviso}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataConsolidacao || ""))) {
    throw new Error(
      `disponibilizarIntencao(${intencaoId}): data_consolidacao inválida "${dataConsolidacao}"`,
    );
  }
  const token = csrf || (await getCsrfGlobal());
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", token);
  body.set("data_aviso", dataAviso);
  body.set("data_consolidacao", dataConsolidacao);
  const res = await m2a.request("POST", URL_DISPONIBILIZAR(intencaoId), {
    body: body.toString(),
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: refererAbsoluto(URL_SOLICITACAO(intencaoId)),
    },
  });
  console.log(
    `[irp-api] disponibilizarIntencao(${intencaoId}) aviso=${dataAviso} consolidacao=${dataConsolidacao} → ${res.status}`,
  );
  if (res.status >= 400) throw new Error(`disponibilizarIntencao(${intencaoId}): status ${res.status}`);
  ensureOkJson(res, "disponibilizarIntencao", intencaoId);
  return { ok: true };
}

// =====================================================================
// PASSO 5.2 — manifestar interesse
// =====================================================================
export async function manifestarInteresse(intencaoId, dataISO, csrf) {
  const token = csrf || (await getCsrfGlobal());
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", token);
  body.set("text", "true");
  body.set("data_input", String(dataISO).slice(0, 10));
  const res = await m2a.request("POST", URL_MANIFESTAR(intencaoId), {
    body: body.toString(),
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: refererAbsoluto(URL_SOLICITACAO(intencaoId)),
    },
  });
  if (res.status >= 400) throw new Error(`manifestarInteresse(${intencaoId}): status ${res.status}`);
  ensureOkJson(res, "manifestarInteresse", intencaoId);
  return { ok: true };
}

// =====================================================================
// PASSO 6 — lista itens da intenção (ITEM_INTENCAO_IDs)
// =====================================================================
export async function listarItensIntencao(intencaoId) {
  const res = await m2a.get(URL_ITENS_INTENCAO(intencaoId));
  if (res.status >= 400) throw new Error(`listarItensIntencao(${intencaoId}): status ${res.status}`);
  const $ = loadDoc(res.html);
  const ids = extractIdsFromRows(
    res.html,
    "input.checkboxintencao_registro_itens, input.checkboxes, input[type=checkbox]",
  );
  const out = ids.map((id) => {
    const $row = $(`input[value="${id}"]`).first().closest("tr");
    return {
      itemIntencaoId: String(id),
      texto: $row.text().replace(/\s+/g, " ").trim(),
    };
  });
  console.log(
    `[irp-api] listarItensIntencao(${intencaoId}) → ${out.length} itens (ids válidos)`,
  );
  return out;
}


// =====================================================================
// PASSO 7 — atualiza a quantidade que esta participante quer daquele item
// =====================================================================
export async function atualizarQuantidadeItem({
  itemIntencaoId,
  intencaoId,
  quantidade,
  csrf,
}) {
  // Trava extra contra IDs contaminados ("on") chegando aqui.
  if (!isValidNumericId(String(itemIntencaoId))) {
    throw new Error(
      `atualizarQuantidadeItem: itemIntencaoId inválido "${itemIntencaoId}" (esperado numérico).`,
    );
  }
  if (!isValidNumericId(String(intencaoId))) {
    throw new Error(
      `atualizarQuantidadeItem: intencaoId inválido "${intencaoId}" (esperado numérico).`,
    );
  }
  const token = csrf || (await getCsrfGlobal());
  const qtyStr = sanitizeQuantidadeM2A(quantidade);
  // Bíblia M2A: application/x-www-form-urlencoded, sem _salvar.
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", token);
  body.set("intencao_registro_preco", String(intencaoId));
  body.set("quantidade", qtyStr);
  const res = await m2a.request("POST", URL_ATUALIZAR_QTD_ITEM(itemIntencaoId), {
    body: body.toString(),
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: refererAbsoluto(URL_SOLICITACAO(intencaoId)),
    },
  });
  if (res.status >= 400) {
    throw new Error(
      `atualizarQuantidadeItem(${itemIntencaoId}): status ${res.status}`,
    );
  }
  ensureOkJson(res, "atualizarQuantidadeItem", `item=${itemIntencaoId} qty=${qtyStr}`);
  return { ok: true };
}


// =====================================================================
// PASSO 8.1 — finalizar para consolidação
// =====================================================================
export async function finalizarParaConsolidacao(intencaoId, dataISO, csrf) {
  const token = csrf || (await getCsrfGlobal());
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", token);
  body.set("text", "true");
  body.set("data_input", String(dataISO).slice(0, 10));
  const res = await m2a.request(
    "POST",
    URL_FINALIZAR_CONSOLIDACAO(intencaoId),
    {
      body: body.toString(),
      headers: {
        Accept: "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        Referer: refererAbsoluto(URL_SOLICITACAO(intencaoId)),
      },
    },
  );
  if (res.status >= 400) {
    throw new Error(
      `finalizarParaConsolidacao(${intencaoId}): status ${res.status}`,
    );
  }
  ensureOkJson(res, "finalizarParaConsolidacao", intencaoId);
  return { ok: true };
}

// =====================================================================
// PASSO 8.2 — consolidar oficialmente
// =====================================================================
export async function consolidarIntencao(intencaoId, opts = {}) {
  const dfdId = opts && typeof opts === "object" ? opts.dfdId : null;
  const refererPath = dfdId
    ? `/gestao_compras/formalizacao_demanda/${dfdId}/`
    : URL_DFD_LIST;
  const token =
    (opts && typeof opts === "object" && opts.csrf) ||
    (await m2a.getCsrf(refererPath, { force: !opts?.csrf }));
  const body = new URLSearchParams();
  body.set("csrfmiddlewaretoken", token);
  body.set("text", "true");
  // Bíblia M2A: consolidar não recebe data_input (só csrf + text=true).
  const res = await m2a.request("POST", URL_CONSOLIDAR(intencaoId), {
    body: body.toString(),
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      Referer: refererAbsoluto(refererPath),
    },
  });
  if (res.status >= 400) throw new Error(`consolidarIntencao(${intencaoId}): status ${res.status}`);
  ensureOkJson(res, "consolidarIntencao", intencaoId);
  return { ok: true, csrf: token };
}

// =====================================================================
// Macro: cria 1 item completo no catálogo + insere na DFD da gerenciadora
// =====================================================================
export async function criarItemEAdicionarNaDFD({
  dfdGerenciadoraId,
  descricao,
  especificacao,
  natureza,
  unidade,
  quantidadeGerenciadora,
  knownBeforeCount,
}) {
  const { itemPadronizadoId, naturezaId } = await cadastrarItemTemporario({
    descricao,
    especificacao,
    unidade,
    natureza,
  });
  await sleep(300);
  const ufId = await obterUnidadeFornecimento(itemPadronizadoId);
  await sleep(200);
  await incluirItemNaDFD({
    dfdId: dfdGerenciadoraId,
    itemPadronizadoId,
    unidadeFornecimentoId: ufId,
    naturezaId,
    especificacao,
    quantidade: quantidadeGerenciadora ?? 0,
    knownBeforeCount,
  });
  return { itemPadronizadoId, naturezaId, unidadeFornecimentoId: ufId };
}

