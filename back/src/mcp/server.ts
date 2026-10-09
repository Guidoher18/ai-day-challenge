import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { buildCalendar, buildDraft, listCalendarEvents } from "./tools.js";

// stdout is reserved for the JSON-RPC transport: log only to stderr.
const log = (...args: unknown[]) => console.error("[suplente-tools]", ...args);

// Simulated team calendar, relative to the day the server starts.
const EVENTS = buildCalendar();

const server = new McpServer({ name: "suplente-tools", version: "1.0.0" });

server.registerTool(
  "consultar_calendario",
  {
    description: "Consulta el calendario del equipo. Si se indica una fecha (YYYY-MM-DD) devuelve los eventos de ese día; si no, devuelve los próximos eventos.",
    inputSchema: z.object({
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Fecha en formato YYYY-MM-DD"),
    }),
  },
  async ({ fecha }) => {
    const payload = listCalendarEvents(EVENTS, fecha);
    log(`consultar_calendario fecha=${fecha ?? "(próximos)"} -> ${payload.eventos.length} eventos`);
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  },
);

server.registerTool(
  "redactar_borrador",
  {
    description: "Redacta un borrador de email (no lo envía) en nombre del equipo, a partir de un destinatario, un asunto y los puntos a comunicar.",
    inputSchema: z.object({
      destinatario: z.string().min(1).describe("Nombre de la persona destinataria"),
      asunto: z.string().min(1).describe("Asunto del email"),
      puntos: z.union([z.array(z.string()), z.string()]).describe("Puntos a comunicar en el cuerpo del email"),
    }),
  },
  async ({ destinatario, asunto, puntos }) => {
    const draft = buildDraft({ destinatario, asunto, puntos });
    log(`redactar_borrador destinatario=${destinatario}`);
    return { content: [{ type: "text", text: draft }] };
  },
);

await server.connect(new StdioServerTransport());
log("listening on stdio");
