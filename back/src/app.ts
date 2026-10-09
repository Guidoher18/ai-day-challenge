import express, { type Express } from "express";
import { answerQuestion } from "./graph.js";
import { buildHandoff } from "./handoff.js";
import { retrieve } from "./rag/retriever.js";

/** Express app with the HTTP routes only; startup side effects live in server.ts. */
export function createApp(): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Debug endpoint to inspect retrieval results.
  app.get("/buscar", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
      res.status(400).json({ error: "Missing query parameter 'q'" });
      return;
    }
    res.json({ query: q, results: await retrieve(q) });
  });

  app.post("/consulta", async (req, res) => {
    const pregunta = typeof req.body?.pregunta === "string" ? req.body.pregunta.trim() : "";
    if (!pregunta) {
      res.status(400).json({ error: "Missing body field 'pregunta'" });
      return;
    }
    try {
      const { answer, route, escalated } = await answerQuestion(pregunta);
      res.json({ respuesta: answer, ruta: route, escalada: escalated });
    } catch (err) {
      console.error("POST /consulta failed:", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "No se pudo procesar la consulta. Intentá nuevamente más tarde." });
    }
  });

  app.get("/traspaso", async (_req, res) => {
    res.json(await buildHandoff());
  });

  return app;
}
