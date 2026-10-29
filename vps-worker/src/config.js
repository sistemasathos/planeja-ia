import "dotenv/config";

const M2A_ENTITY_LOGIN_PATH = "/usuario/login/";
const M2A_ENTITY_LOGIN_PROFILE = "1";

function required(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return v.trim();
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  host: process.env.HOST ?? "0.0.0.0",
  logLevel: process.env.LOG_LEVEL ?? "info",

  m2a: {
    baseUrl: required("M2A_BASE_URL").replace(/\/+$/, ""),
    username: required("M2A_USERNAME"),
    password: required("M2A_PASSWORD"),
    // GET inicial no portal da entidade. Neste tenant /usuario/login/ responde
    // 301 → /autenticacao/login/; o cliente POSTA na URL final do form, não
    // no caminho de partida (POST+/301 viraria GET e o login falharia).
    loginPath: M2A_ENTITY_LOGIN_PATH,
    loginProfile: M2A_ENTITY_LOGIN_PROFILE,
    maxConcurrency: Number(process.env.M2A_MAX_CONCURRENCY ?? 2),
  },

  gemini: {
    apiKey: (process.env.GEMINI_API_KEY ?? "").trim() || null,
  },

  sharedSecret: required("SHARED_SECRET"),
};

