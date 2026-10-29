import Fastify from "fastify";
import { config } from "./config.js";
import { authPlugin } from "./auth.js";
import { numeracaoRoutes } from "./routes/numeracao.js";
import { processosRoutes } from "./routes/processos.js";
import { authRoutes } from "./routes/auth.js";
import { contratosRoutes } from "./routes/contratos.js";
import { documentosRoutes } from "./routes/documentos.js";
import { processosSrpRoutes } from "./routes/processos-srp.js";
import { processosComumRoutes } from "./routes/processos-comum.js";
import { atasRoutes } from "./routes/atas.js";
import { WORKER_BUILD } from "./build-info.js";

const app = Fastify({
  logger: { level: config.logLevel },
  bodyLimit: 4 * 1024 * 1024,
});

app.get("/health", async () => ({
  ok: true,
  service: "planeja-m2a-worker",
  build: WORKER_BUILD,
  revalidar_saldo_envio: process.env.M2A_REVALIDAR_SALDO === "1",
  uptime_s: Math.round(process.uptime()),
}));


await app.register(authPlugin);
await app.register(authRoutes);
await app.register(numeracaoRoutes);
await app.register(processosRoutes);
await app.register(contratosRoutes);
await app.register(documentosRoutes);
await app.register(processosSrpRoutes);
await app.register(processosComumRoutes);
await app.register(atasRoutes);

app.setErrorHandler((err, _req, reply) => {
  app.log.error(err);
  reply.code(err.statusCode ?? 500).send({
    error: err.message || "internal_error",
  });
});

try {
  await app.listen({ port: config.port, host: config.host });
  console.log(
    `[worker] build=${WORKER_BUILD} revalidarSaldoEnvio=${process.env.M2A_REVALIDAR_SALDO === "1"}`,
  );
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

