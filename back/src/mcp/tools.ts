// Pure tool logic for the suplente-tools MCP server (no I/O), so it can be tested in isolation.

export interface CalendarEvent {
  date: string;
  time: string;
  title: string;
  attendees: string[];
  location: string;
}

export interface CalendarResult {
  hoy: string;
  fecha: string | null;
  eventos: CalendarEvent[];
}

export interface DraftInput {
  destinatario: string;
  asunto: string;
  puntos: string | string[];
}

/** Local date (YYYY-MM-DD) shifted by `daysFromToday` relative to `base`. */
export function isoDate(daysFromToday: number, base: Date = new Date()): string {
  const d = new Date(base);
  d.setDate(d.getDate() + daysFromToday);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Simulated team calendar, relative to `start` (the day the server starts). */
export function buildCalendar(start: Date = new Date()): CalendarEvent[] {
  return [
    { date: isoDate(0, start), time: "10:00", title: "Daily del equipo", attendees: ["Equipo completo"], location: "Meet" },
    { date: isoDate(1, start), time: "15:00", title: "Revisión del sprint", attendees: ["Equipo completo", "Laura (Product Owner)"], location: "Sala Andes" },
    { date: isoDate(2, start), time: "11:30", title: "Reunión con el cliente: avance del proyecto", attendees: ["Laura", "Martín"], location: "Meet" },
    { date: isoDate(3, start), time: "09:30", title: "Planificación del próximo sprint", attendees: ["Equipo completo"], location: "Sala Andes" },
    { date: isoDate(4, start), time: "16:00", title: "Retrospectiva", attendees: ["Equipo completo"], location: "Meet" },
    { date: isoDate(6, start), time: "14:00", title: "Sesión de onboarding para nuevas incorporaciones", attendees: ["Sofía", "Martín"], location: "Sala Patagonia" },
  ];
}

/** Events of the given day, or upcoming events (today onwards) when no date is given. */
export function listCalendarEvents(events: CalendarEvent[], fecha?: string, now: Date = new Date()): CalendarResult {
  const today = isoDate(0, now);
  const eventos = fecha ? events.filter((e) => e.date === fecha) : events.filter((e) => e.date >= today);
  return { hoy: today, fecha: fecha ?? null, eventos };
}

/** Deterministic email draft; it is never sent. */
export function buildDraft({ destinatario, asunto, puntos }: DraftInput): string {
  const items = (Array.isArray(puntos) ? puntos : [puntos]).map((p) => p.trim()).filter(Boolean);
  const body = items.length === 1 ? items[0] : items.map((p) => `- ${p}`).join("\n");
  return [
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
}
