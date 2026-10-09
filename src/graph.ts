import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { llm } from "./llm.js";
import { logInteraction, type Route } from "./log.js";
import { retrieve } from "./rag/retriever.js";

// Observed cosine scores: relevant 0.85-0.91, off-topic ~0.81.
const RELEVANCE_THRESHOLD = 0.83;
const NO_CONTEXT = "SIN_CONTEXTO";
const ROUTES: Route[] = ["responder", "ejecutar", "escalar"];

const State = Annotation.Root({
  question: Annotation<string>,
  route: Annotation<Route | undefined>,
  context: Annotation<string[] | undefined>,
  answer: Annotation<string | undefined>,
  escalated: Annotation<boolean | undefined>,
  escalationReason: Annotation<string | undefined>,
});

type GraphState = typeof State.State;

const CLASSIFY_PROMPT = `Sos el clasificador de un suplente digital que cubre a un equipo ausente.
Elegí UNA ruta para la consulta:
- responder: preguntas informativas sobre procedimientos del equipo (vacaciones, gastos, accesos, guardias, plantillas, a quién contactar).
- ejecutar: pedidos de acciones concretas y simples (consultar el calendario, redactar un mensaje o un email).
- escalar: aprobaciones de cualquier tipo, temas sensibles (RR. HH., sueldos, salud, legales, incidentes de seguridad, accesos a producción), decisiones de presupuesto, o cualquier tema fuera del ámbito del equipo.
Respondé solo con una palabra: responder, ejecutar o escalar.`;

function parseRoute(text: string): Route {
  const lower = text.toLowerCase();
  const found = ROUTES.map((route) => ({ route, index: lower.indexOf(route) }))
    .filter(({ index }) => index >= 0)
    .sort((a, b) => a.index - b.index);
  return found[0]?.route ?? "responder";
}

async function classify(state: GraphState): Promise<Partial<GraphState>> {
  const response = await llm.invoke([
    { role: "system", content: CLASSIFY_PROMPT },
    { role: "user", content: state.question },
  ]);
  return { route: parseRoute(response.text) };
}

async function respond(state: GraphState): Promise<Partial<GraphState>> {
  const chunks = await retrieve(state.question);
  if (!chunks.length || chunks[0].score < RELEVANCE_THRESHOLD) {
    return { escalationReason: "la consulta no está cubierta por la documentación disponible" };
  }
  const context = chunks.map((c) => `[${c.source}]\n${c.content}`);
  const response = await llm.invoke([
    {
      role: "system",
      content: `Sos un suplente digital que responde en nombre de un equipo ausente.
Respondé en español, de forma breve y profesional, usando únicamente el contexto provisto.
Si el contexto no alcanza para responder, respondé exactamente: ${NO_CONTEXT}
En cualquier otro caso, no menciones ${NO_CONTEXT}.

Contexto:
${context.join("\n\n")}`,
    },
    { role: "user", content: state.question },
  ]);
  const raw = response.text.trim();
  if (!raw || raw.startsWith(NO_CONTEXT)) {
    return { context, escalationReason: "la documentación no alcanza para responder la consulta" };
  }
  // Some models append remarks about the sentinel; drop those sentences.
  const answer = raw.replace(new RegExp(`[^.\\n]*${NO_CONTEXT}[^.\\n]*\\.?`, "g"), "").trim();
  if (!answer) {
    return { context, escalationReason: "la documentación no alcanza para responder la consulta" };
  }
  return { context, answer, escalated: false };
}

// Placeholder until step 4 wires real tools (MCP).
async function execute(_state: GraphState): Promise<Partial<GraphState>> {
  return {
    answer: "La acción solicitada quedó registrada como pendiente y se ejecutará cuando la persona responsable esté disponible.",
    escalated: true,
  };
}

async function escalate(state: GraphState): Promise<Partial<GraphState>> {
  const reason = state.escalationReason ?? "requiere la intervención de una persona";
  return {
    route: "escalar",
    answer: `Tu consulta quedó registrada como pendiente porque ${reason}. Se atenderá cuando la persona responsable regrese.`,
    escalated: true,
  };
}

export const graph = new StateGraph(State)
  .addNode("classify", classify)
  .addNode("respond", respond)
  .addNode("execute", execute)
  .addNode("escalate", escalate)
  .addEdge(START, "classify")
  .addConditionalEdges("classify", (s) => {
    if (s.route === "ejecutar") return "execute";
    if (s.route === "escalar") return "escalate";
    return "respond";
  }, ["respond", "execute", "escalate"])
  .addConditionalEdges("respond", (s) => (s.answer ? END : "escalate"), ["escalate", END])
  .addEdge("execute", END)
  .addEdge("escalate", END)
  .compile();

export interface AnswerResult {
  answer: string;
  route: Route;
  escalated: boolean;
}

export async function answerQuestion(question: string): Promise<AnswerResult> {
  const state = await graph.invoke({ question });
  const result: AnswerResult = {
    answer: state.answer ?? "",
    route: state.route ?? "escalar",
    escalated: state.escalated ?? true,
  };
  logInteraction({ question, ...result, date: new Date().toISOString() });
  return result;
}
