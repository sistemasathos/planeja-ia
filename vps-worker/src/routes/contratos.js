// Rotas de automação de contrato. Streaming via Server-Sent Events.
import { processarContratoCompleto } from "../m2a/orquestrador-contrato.js";
import { diagnosticarContrato } from "../m2a/contrato.js";
import { listarItensContrato, listarDocumentosContrato } from "../m2a/atas-consumo.js";

function sseInit(reply) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}
function sseSend(reply, event, data) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

export async function contratosRoutes(app) {
  // POST /contratos/processar — SSE
  app.post("/contratos/processar", async (req, reply) => {
    const payload = req.body || {};
    if (!payload?.contrato || !payload?.dadosM2A || !payload?.m2aAtaId) {
      return reply
        .code(400)
        .send({ error: "payload incompleto (contrato, dadosM2A, m2aAtaId obrigatórios)" });
    }
    sseInit(reply);

    // Cancelamento: quando o cliente (edge function / browser) desconecta,
    // abortamos o pipeline em vez de deixar o worker terminando sozinho.
    const controller = new AbortController();
    let closedByClient = false;
    // Importante: ouvir "close" no reply (resposta), não no req. No Node moderno,
    // IncomingMessage emite "close" assim que o corpo da requisição termina de ser
    // lido — o que aconteceria logo no início do stream e abortaria o pipeline
    // prematuramente, suprimindo os eventos "done"/"concluido".
    const onClose = () => {
      if (reply.raw.writableEnded) return;
      closedByClient = true;
      controller.abort();
    };
    reply.raw.on("close", onClose);

    // Heartbeat: mantém a conexão viva através de proxies (edge/nginx) em
    // etapas longas sem eventos.
    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(`event: ping\ndata: {}\n\n`);
      } catch {
        /* conexão já encerrada */
      }
    }, 15_000);

    const onProgress = (e) => {
      if (closedByClient) return;
      sseSend(reply, "progress", e);
    };
    try {
      const result = await processarContratoCompleto(payload, onProgress, {
        signal: controller.signal,
      });
      if (!closedByClient) sseSend(reply, "done", { ok: true, ...result });
    } catch (err) {
      if (!closedByClient) {
        if (err?.code === "M2A_CANCELADO") {
          sseSend(reply, "cancelled", {
            ok: false,
            contratoId: payload.contratoId,
            m2a_contrato_id: err.m2a_contrato_id,
            error: err.message,
          });
        } else {
          sseSend(reply, "progress", {
            contratoId: payload.contratoId,
            etapa: "erro",
            mensagem: err.message,
            code: err.code,
            excedentes: err.excedentes,
            m2a_contrato_id: err.m2a_contrato_id,
            sucesso: false,
          });
          sseSend(reply, "error", { ok: false, error: err.message, code: err.code, excedentes: err.excedentes, m2a_contrato_id: err.m2a_contrato_id });
        }
      }
    } finally {
      clearInterval(heartbeat);
      reply.raw.off("close", onClose);
      reply.raw.end();
    }
  });


  // POST /contratos/processar/json — variante não-streaming (testes)
  app.post("/contratos/processar/json", async (req, reply) => {
    const payload = req.body || {};
    const events = [];
    try {
      const result = await processarContratoCompleto(payload, (e) => events.push(e));
      return { ok: true, events, ...result };
    } catch (err) {
      return reply.code(500).send({ ok: false, error: err.message, code: err.code, excedentes: err.excedentes, events });
    }
  });

  // POST /contratos/diagnosticar — apenas leitura, sem gravação
  app.post("/contratos/diagnosticar", async (req, reply) => {
    try {
      const result = await diagnosticarContrato(req.body || {});
      return { ok: true, ...result };
    } catch (err) {
      return reply.code(400).send({ ok: false, error: err.message });
    }
  });

  // POST /contratos/sincronizar — lê itens (id, número, descrição, quantidade)
  // de um contrato já existente na M2A para o app espelhar quantidades alteradas
  // diretamente no portal.
  app.post("/contratos/sincronizar", async (req, reply) => {
    const body = req.body || {};
    const m2aContratoId = String(body.m2a_contrato_id ?? "").trim();
    if (!/^\d+$/.test(m2aContratoId)) {
      return reply.code(400).send({ error: "m2a_contrato_id inválido" });
    }
    try {
      const [itens, documentos] = await Promise.all([
        listarItensContrato(m2aContratoId),
        listarDocumentosContrato(m2aContratoId),
      ]);
      return { ok: true, m2a_contrato_id: m2aContratoId, itens, documentos };
    } catch (err) {
      return reply.code(502).send({ ok: false, error: err.message });
    }
  });
}
