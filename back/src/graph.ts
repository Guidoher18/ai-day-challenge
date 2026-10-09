import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { llm } from "./llm.js";
import { logInteraction, type Route } from "./log.js";
import { getMcpTools } from "./mcp/client.js";
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
- ejecutar: pedidos de acciones concretas y simples: consultas sobre la agenda o el calendario del equipo (reuniones, eventos, qué hay hoy, mañana o esta semana) y pedidos de redactar un mensaje o un email.
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

const MAX_TOOL_ITERATIONS = 3;

function executePrompt(): string {
  // Local date (YYYY-MM-DD), consistent with the calendar tool.
  const today = new Date().toLocaleDateString("en-CA");
  return `Sos el suplente digital de un equipo cuya persona responsable está ausente. Hoy es ${today}.
Usá las herramientas disponibles para resolver el pedido:
- consultar_calendario para cualquier consulta sobre reuniones, eventos o agenda del equipo.
- redactar_borrador para redactar mensajes o emails.
Después de usar las herramientas, respondé en español, de forma breve y profesional, resumiendo el resultado.
Si redactaste un borrador, incluí el texto completo del borrador en tu respuesta.`;
}

async function execute(state: GraphState): Promise<Partial<GraphState>> {
  const failure = (reason: string) => ({ escalationReason: reason });
  try {
    const tools = await getMcpTools();
    const toolsByName = new Map(tools.map((t) => [t.name, t]));
    const model = llm.bindTools(tools);
    const messages: BaseMessage[] = [new SystemMessage(executePrompt()), new HumanMessage(state.question)];
    let toolsUsed = 0;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await model.invoke(messages);
      messages.push(response);
      const calls = response.tool_calls ?? [];
      if (!calls.length) {
        const answer = response.text.trim();
        if (!toolsUsed || !answer) break;
        return { answer, escalated: false };
      }
      for (const call of calls) {
        const tool = toolsByName.get(call.name);
        if (!tool) return failure(`no se encontró la herramienta solicitada (${call.name})`);
        const output = await tool.invoke(call.args);
        const content = typeof output === "string" ? output : JSON.stringify(output);
        messages.push(new ToolMessage({ content, tool_call_id: call.id ?? call.name, name: call.name }));
        toolsUsed++;
      }
    }
    return failure("no fue posible completar la acción solicitada de forma automática");
  } catch (err) {
    console.error("execute failed:", err instanceof Error ? err.message : err);
    return failure("ocurrió un error al ejecutar la acción solicitada");
  }
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
  .addConditionalEdges("execute", (s) => (s.answer ? END : "escalate"), ["escalate", END])
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
