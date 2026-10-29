import axios from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import PQueue from "p-queue";
import * as cheerio from "cheerio";
import { config } from "./config.js";

/**
 * Cliente HTTP único contra o M2A.
 * - 1 sessão (conta de serviço) compartilhada por todo o worker.
 * - Faz login sob demanda e revalida automaticamente se a sessão expirar.
 * - Serializa requests via p-queue para não derrubar o portal.
 * - Mantém cache de CSRF por URL (espelha rememberCsrfFromDoc do engine).
 */

const CSRF_TTL_MS = 10 * 60 * 1000;
const TRANSIENT_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isIdempotentMethod(method) {
  const m = String(method || "").toUpperCase();
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

function isTransientError(err, method = "GET") {
  const status = Number(err?.response?.status ?? err?.status ?? 0);
  if (TRANSIENT_STATUS.has(status)) return true;
  // Para métodos não-idempotentes (POST/PUT/PATCH/DELETE) NÃO tratamos
  // timeout/rede como transitório — o servidor pode ter processado o
  // request e apenas perdido a resposta. Retry aqui geraria duplicidade.
  if (!isIdempotentMethod(method)) return false;
  const code = String(err?.code ?? "");
  if (TRANSIENT_CODES.has(code)) return true;
  return /timeout|socket hang up|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(
    String(err?.message ?? ""),
  );
}

function isTransientResponse(res) {
  return TRANSIENT_STATUS.has(Number(res?.status ?? 0));
}

function retryDelayMs(attempt) {
  const base = [0, 1_500, 4_000, 8_000, 12_000][attempt] ?? 12_000;
  return base + Math.floor(Math.random() * 500);
}

function assertSafePath(path) {
  const p = String(path ?? "");
  if (!p.startsWith("/") || p.startsWith("//")) {
    throw new Error(
      `M2A_INVALID_PATH: apenas caminhos relativos ao portal são permitidos (recebido: ${p.slice(0, 80)})`,
    );
  }
  return p;
}

function absoluteUrl(path) {
  return `${config.m2a.baseUrl}${assertSafePath(path)}`;
}

/** Path (+ query) de uma URL absoluta ou relativa ao portal. */
function pathFromUrl(url, fallback) {
  const raw = String(url || "").trim();
  if (!raw) return fallback;
  try {
    const u = new URL(raw, `${config.m2a.baseUrl}/`);
    const path = `${u.pathname}${u.search || ""}`;
    return path.startsWith("/") ? path : fallback;
  } catch {
    return fallback;
  }
}

function normalizeCacheUrl(url) {
  return absoluteUrl(url).replace(/#.*$/, "");
}

class M2aClient {
  constructor() {
    this.jar = new CookieJar();
    this.http = wrapper(
      axios.create({
        baseURL: config.m2a.baseUrl,
        jar: this.jar,
        withCredentials: true,
        timeout: 60_000,
        maxRedirects: 5,
        validateStatus: (s) => s < 500,
        headers: {
          "User-Agent":
            "Planeja-M2A-Worker/0.1 (+https://planeja-ia.lovable.app)",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      }),
    );
    this.queue = new PQueue({ concurrency: config.m2a.maxConcurrency });
    this.loggedIn = false;
    this.loginPromise = null;
    this.lastLoginAt = 0;
    this.sessionCsrf = null;
    this.csrfCache = new Map();
  }

  resetSession() {
    this.jar = new CookieJar();
    this.http.defaults.jar = this.jar;
    this.loggedIn = false;
    this.sessionCsrf = null;
    this.csrfCache.clear();
  }

  static isLoginPage(html, finalUrl = "") {
    // Só consideramos página de login quando a URL final aponta pra rota
    // de login do portal. NÃO usar heurística por HTML (name="password"),
    // porque várias páginas internas do M2A têm campo de "alterar senha"
    // no menu do usuário e isso gera falso positivo — o que disparava
    // re-login e invalidava o CSRF token do POST original (→ 403).
    if (!finalUrl) return false;
    return /(?:\/login\/|\/usuario\/login\/)/i.test(finalUrl);
  }

  rememberCsrf(html, sourceUrl) {
    if (!html) return null;
    const m = String(html).match(
      /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']/i,
    );
    if (!m) return null;
    const token = m[1];
    this.sessionCsrf = token;
    if (sourceUrl) {
      this.csrfCache.set(normalizeCacheUrl(sourceUrl), {
        token,
        at: Date.now(),
      });
    }
    return token;
  }

  async login() {
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = (async () => {
      this.resetSession();
      const loginUrl = `${config.m2a.baseUrl}${config.m2a.loginPath}`;
      console.log(`[m2a-login] start ENTIDADE user=${config.m2a.username} url=${loginUrl} perfil=${config.m2a.loginProfile}`);
      let getRes;
      try {
        getRes = await this.http.get(config.m2a.loginPath);
      } catch (err) {
        console.error(`[m2a-login] GET form falhou: ${err.message}`);
        throw new Error(`M2A_LOGIN_FAILED: GET ${config.m2a.loginPath} → ${err.message}`);
      }
      const getFinalUrl = getRes.request?.res?.responseUrl || loginUrl;
      const getFinalPath = pathFromUrl(getFinalUrl, config.m2a.loginPath);
      console.log(`[m2a-login] GET status=${getRes.status} finalUrl=${getFinalUrl} bytes=${(getRes.data || "").length}`);

      const $ = cheerio.load(getRes.data || "");
      // Form de senha (não o de "esqueci senha", que também tem csrf/perfil).
      const $form = $("form")
        .filter((_, el) => $(el).find('input[name="password"]').length > 0)
        .first();
      const action = ($form.attr("action") || "").trim();
      const postPath = action
        ? pathFromUrl(action, getFinalPath)
        : getFinalPath;
      const form = new URLSearchParams();
      $form.find("input").each((_, el) => {
        const name = $(el).attr("name");
        if (!name) return;
        const type = String($(el).attr("type") || "text").toLowerCase();
        if (type === "submit" || type === "button" || type === "image") return;
        form.set(name, $(el).attr("value") || "");
      });
      form.set("username", config.m2a.username);
      form.set("password", config.m2a.password);
      if (!form.get("perfil")) form.set("perfil", config.m2a.loginProfile);

      const csrf = form.get("csrfmiddlewaretoken") || "";
      const profileOptions = $form
        .find('input[name="perfil"]')
        .map((_, el) => {
          const value = $(el).attr("value") || "";
          const type = $(el).attr("type") || "hidden";
          return `${value} (${type})`;
        })
        .get()
        .join(" | ");
      console.log(`[m2a-login] csrf ${csrf ? `presente(len=${csrf.length})` : "AUSENTE"}`);
      console.log(`[m2a-login] form action="${action || "(vazio → URL do GET)"}" postPath=${postPath} perfis=${profileOptions || "(nenhum)"}`);
      const cookieStr = await this.jar.getCookieString(config.m2a.baseUrl);
      console.log(`[m2a-login] cookies pré-POST: ${cookieStr || "(vazio)"}`);
      console.log(`[m2a-login] POST payload: perfil=${form.get("perfil")} username=${form.get("username")} password=(oculta) csrf=${csrf ? "sim" : "não"} campos=${[...form.keys()].join(",")}`);

      let postRes;
      try {
        postRes = await this.http.post(postPath, form, {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Cache-Control": "max-age=0",
            "Upgrade-Insecure-Requests": "1",
            Origin: config.m2a.baseUrl,
            Referer: getFinalUrl,
          },
        });
      } catch (err) {
        console.error(`[m2a-login] POST falhou: ${err.message}`);
        throw new Error(`M2A_LOGIN_FAILED: POST ${postPath} → ${err.message}`);
      }

      const html = String(postRes.data || "");
      const finalUrl = postRes.request?.res?.responseUrl || "";
      const cookieAfter = await this.jar.getCookieString(config.m2a.baseUrl);
      console.log(`[m2a-login] POST status=${postRes.status} finalUrl=${finalUrl} bytes=${html.length}`);
      console.log(`[m2a-login] cookies pós-POST: ${cookieAfter || "(vazio)"}`);

      if (M2aClient.isLoginPage(html, finalUrl)) {
        const $$ = cheerio.load(html);
        const errMsg =
          $$(".errorlist").first().text().trim() ||
          $$(".alert").first().text().trim() ||
          $$(".help-block").first().text().trim() ||
          "";
        console.error(`[m2a-login] FALHOU — ainda na página de login. perfil=${form.get("perfil")} postPath=${postPath} finalUrl=${finalUrl} msg="${errMsg}"`);
        const snippet = html.replace(/\s+/g, " ").slice(0, 400);
        console.error(`[m2a-login] snippet: ${snippet}`);
        throw new Error(
          `M2A_LOGIN_FAILED${errMsg ? `: ${errMsg}` : ""} (status=${postRes.status}, finalUrl=${finalUrl})`,
        );
      }
      console.log(`[m2a-login] OK — sessão estabelecida`);
      this.loggedIn = true;
      this.lastLoginAt = Date.now();
      this.sessionCsrf = null;
      this.csrfCache.clear();
    })().finally(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  }


  async _raw(method, path, opts = {}) {
    assertSafePath(path);
    const binary = opts.responseType === "arraybuffer";
    const headers = {
      Accept: binary
        ? "application/pdf,application/octet-stream,*/*"
        : "text/html,application/json,*/*",
      ...(opts.headers || {}),
    };
    const cfg = {
      method,
      url: path,
      headers,
      responseType: binary ? "arraybuffer" : "text",
      transformResponse: [(data) => data],
    };
    if (opts.maxRedirects !== undefined) cfg.maxRedirects = opts.maxRedirects;
    if (opts.timeout !== undefined) cfg.timeout = opts.timeout;
    if (opts.body !== undefined) cfg.data = opts.body;

    const res = await this.http.request(cfg);
    const finalUrl = res.request?.res?.responseUrl || "";
    const contentType = res.headers?.["content-type"] || "";
    const contentDisposition = res.headers?.["content-disposition"] || null;
    if (binary) {
      const buf = Buffer.isBuffer(res.data) ? res.data : Buffer.from(res.data);
      // Detecta página de login (HTML) mesmo quando pedimos binário.
      const looksHtml =
        contentType.toLowerCase().includes("text/html") ||
        (buf.length < 64_000 && /<html/i.test(buf.toString("utf8", 0, Math.min(buf.length, 2048))));
      const html = looksHtml ? buf.toString("utf8") : "";
      return {
        status: res.status,
        html,
        bytes: buf,
        finalUrl,
        contentType,
        contentDisposition,
        raw: res,
      };
    }
    const text =
      typeof res.data === "string"
        ? res.data
        : res.data == null
          ? ""
          : JSON.stringify(res.data);
    return { status: res.status, html: text, finalUrl, contentType, contentDisposition, raw: res };
  }

  /** request com auto-relogin. Aceita method/path/body/headers. */
  async request(method, path, opts = {}) {
    return this.queue.add(async () => {
      if (!this.loggedIn) {
        console.log(`[m2a] sessão ausente — efetuando login antes de ${method} ${path}`);
        await this.login();
      }
      const methodUpper = method.toUpperCase();
      // Retry universal: todos os métodos podem tentar até 3 vezes por padrão.
      // Para POST/PUT/DELETE só retentamos em respostas 5xx/429 (o servidor
      // rejeitou sem processar). Timeouts de rede em POST NÃO são retentados
      // aqui — o caller deve envolver a operação com sua própria lógica se ela
      // for comprovadamente idempotente (ver postFormWithRetry no contrato.js).
      const maxAttempts = Number(opts.retries ?? 4);
      let r = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          r = await this._raw(method, path, opts);
          console.log(`[m2a] ${method} ${path} → ${r.status} (tentativa=${attempt}/${maxAttempts}, finalUrl=${r.finalUrl || "-"}, bytes=${r.html.length})`);
          if (!isTransientResponse(r) || attempt === maxAttempts) break;
          console.warn(`[m2a] resposta transitória ${r.status} em ${method} ${path}; tentando novamente após pausa`);
        } catch (err) {
          lastErr = err;
          const status = err?.response?.status ? ` HTTP ${err.response.status}` : "";
          console.warn(`[m2a] falha${status} em ${method} ${path} (tentativa=${attempt}/${maxAttempts}): ${err.message}`);
          if (!isTransientError(err, methodUpper) || attempt === maxAttempts) throw err;
        }
        await sleep(retryDelayMs(attempt));
      }
      if (!r) throw lastErr || new Error(`M2A_REQUEST_FAILED: ${method} ${path}`);
      const isPost = method.toUpperCase() === "POST";
      const sessionExpired =
        M2aClient.isLoginPage(r.html, r.finalUrl) || r.status === 401;
      // Para POST, NÃO refazemos o request automaticamente em 403:
      // o body já carrega um csrfmiddlewaretoken que ficaria velho após
      // o re-login e o Django rejeitaria de novo com 403. O caller deve
      // tratar 403 explicitamente (re-buscar CSRF e refazer o POST).
      if (sessionExpired || (!isPost && r.status === 403)) {
        console.warn(`[m2a] sessão expirada em ${method} ${path} — re-login e retry`);
        this.loggedIn = false;
        await this.login();
        r = await this._raw(method, path, opts);
        console.log(`[m2a] retry ${method} ${path} → ${r.status} (finalUrl=${r.finalUrl || "-"})`);
        if (M2aClient.isLoginPage(r.html, r.finalUrl)) {
          throw new Error("M2A_SESSION_REFRESH_FAILED");
        }
      }
      // Remember CSRF when present
      this.rememberCsrf(r.html, path);
      return r;
    });
  }


  get(path, opts = {}) {
    return this.request("GET", path, opts);
  }

  postForm(path, payload, opts = {}) {
    const body =
      payload instanceof URLSearchParams
        ? payload.toString()
        : new URLSearchParams(payload).toString();
    return this.request("POST", path, {
      ...opts,
      body,
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        ...(opts.headers || {}),
      },
    });
  }

  /** POST multipart/form-data. payload = FormData (node form-data). */
  async postMultipart(path, formData, opts = {}) {
    const { ajax = true, ...requestOpts } = opts;
    return this.request("POST", path, {
      ...requestOpts,
      body: formData,
      headers: {
        ...formData.getHeaders(),
        ...(ajax ? { "X-Requested-With": "XMLHttpRequest" } : {}),
        ...(opts.headers || {}),
      },
    });
  }

  /** Captura/retorna CSRF para a URL dada (com cache). */
  async getCsrf(path, opts = {}) {
    const key = normalizeCacheUrl(path);
    const cached = this.csrfCache.get(key);
    if (!opts.force && cached && Date.now() - cached.at < CSRF_TTL_MS) {
      return cached.token;
    }
    if (!opts.force && this.sessionCsrf) return this.sessionCsrf;
    const r = await this.request("GET", path, {
      headers: { "X-Requested-With": "XMLHttpRequest" },
    });
    const token = this.rememberCsrf(r.html, path);
    if (!token) throw new Error(`CSRF ausente em ${path}`);
    return token;
  }

  status() {
    return {
      loggedIn: this.loggedIn,
      lastLoginAt: this.lastLoginAt || null,
      pending: this.queue.pending,
      size: this.queue.size,
    };
  }
}

export const m2a = new M2aClient();
