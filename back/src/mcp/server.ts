import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

// stdout is reserved for the JSON-RPC transport: log only to stderr.
const log = (...args: unknown[]) => console.error("[suplente-tools]", ...args);

interface CalendarEvent {
  date: string;
  time: string;
  title: string;
  attendees: string[];
  location: string;
}

function isoDate(daysFromToday: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Simulated team calendar, relative to the day the server starts.
const EVENTS: CalendarEvent[] = [
  { date: isoDate(0), time: "10:00", title: "Daily del equipo", attendees: ["Equipo completo"], location: "Meet" },
  { date: isoDate(1), time: "15:00", title: "Revisión del sprint", attendees: ["Equipo completo", "Laura (Product Owner)"], location: "Sala Andes" },
  { date: isoDate(2), time: "11:30", title: "Reunión con el cliente: avance del proyecto", attendees: ["Laura", "Martín"], location: "Meet" },
  { date: isoDate(3), time: "09:30", title: "Planificación del próximo sprint", attendees: ["Equipo completo"], location: "Sala Andes" },
  { date: isoDate(4), time: "16:00", title: "Retrospectiva", attendees: ["Equipo completo"], location: "Meet" },
  { date: isoDate(6), time: "14:00", title: "Sesión de onboarding para nuevas incorporaciones", attendees: ["Sofía", "Martín"], location: "Sala Patagonia" },
];

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
    const today = isoDate(0);
    const events = fecha ? EVENTS.filter((e) => e.date === fecha) : EVENTS.filter((e) => e.date >= today);
    log(`consultar_calendario fecha=${fecha ?? "(próximos)"} -> ${events.length} eventos`);
    const payload = { hoy: today, fecha: fecha ?? null, eventos: events };
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
    const items = (Array.isArray(puntos) ? puntos : [puntos]).map((p) => p.trim()).filter(Boolean);
    const body = items.length === 1 ? items[0] : items.map((p) => `- ${p}`).join("\n");
    const draft = [
      "[BORRADOR - NO ENVIADO]",
      `Para: ${destinatario}`,
      `Asunto: ${asunto}`,
      "",
      `Hola ${destinatario}:`,
      "",
      "Te escribo para comentarte lo siguiente:",
      body,
      "",
      "La persona responsable se encuentra ausente; este mensaje fue redactado por su suplente digital y queda pendiente de revisión antes de enviarse.",
      "",
      "Saludos,",
      "Suplente digital del equipo",
    ].join("\n");
    log(`redactar_borrador destinatario=${destinatario}`);
    return { content: [{ type: "text", text: draft }] };
  },
);

await server.connect(new StdioServerTransport());
log("listening on stdio");
