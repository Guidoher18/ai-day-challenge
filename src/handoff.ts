import { llm } from "./llm.js";
import { getInteractions } from "./log.js";

export interface Handoff {
  total: number;
  respondidas: number;
  ejecutadas: number;
  escaladas: number;
  resumen: string;
  pendientes: { pregunta: string; fecha: string }[];
}

const SUMMARY_PROMPT = `Sos el suplente digital de un equipo y la persona responsable acaba de volver.
Escribí un resumen breve en español (máximo 6 líneas) de lo atendido durante su ausencia:
qué temas se respondieron, qué tareas se ejecutaron y qué quedó pendiente para que lo resuelva.
Cada línea del registro indica su ruta entre corchetes; mencioná solo las rutas que aparezcan y no copies las etiquetas.
No inventes información que no esté en el registro.`;

export async function buildHandoff(): Promise<Handoff> {
  const interactions = getInteractions();
  const count = (route: string) => interactions.filter((i) => i.route === route).length;
  const pendientes = interactions
    .filter((i) => i.escalated)
    .map((i) => ({ pregunta: i.question, fecha: i.date }));

  const handoff: Omit<Handoff, "resumen"> = {
    total: interactions.length,
    respondidas: count("responder"),
    ejecutadas: count("ejecutar"),
    escaladas: count("escalar"),
    pendientes,
  };

  if (!interactions.length) {
    return { ...handoff, resumen: "No se registraron consultas durante la ausencia." };
  }

  const record = interactions
    .map((i) => `- [${i.route}] ${i.question} -> ${i.answer.slice(0, 200)}`)
    .join("\n");
  const fallback = `Se atendieron ${handoff.total} consultas: ${handoff.respondidas} respondidas, ${handoff.ejecutadas} ejecutadas y ${handoff.escaladas} escaladas.`;

  try {
    const response = await llm.invoke([
      { role: "system", content: SUMMARY_PROMPT },
      { role: "user", content: `Registro de interacciones:\n${record}` },
    ]);
    return { ...handoff, resumen: response.text.trim() || fallback };
  } catch (err) {
    // Keep the handoff usable even if the model is unavailable (e.g. rate limits).
    console.error("Handoff summary failed:", err instanceof Error ? err.message : err);
    return { ...handoff, resumen: fallback };
  }
}
