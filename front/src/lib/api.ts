export type Route = "responder" | "ejecutar" | "escalar";

export interface ConsultaResponse {
  respuesta: string;
  ruta: Route;
  escalada: boolean;
}

export interface PendingItem {
  pregunta: string;
  fecha: string;
}

export interface TraspasoResponse {
  total: number;
  respondidas: number;
  ejecutadas: number;
  escaladas: number;
  resumen: string;
  pendientes: PendingItem[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new Error("No se pudo conectar con el servidor.");
  }

  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const backendError =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : null;
    throw new Error(backendError ?? `Error ${res.status} del servidor.`);
  }

  return body as T;
}

export function askQuestion(pregunta: string): Promise<ConsultaResponse> {
  return request<ConsultaResponse>("/consulta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pregunta }),
  });
}

export function fetchHandoff(): Promise<TraspasoResponse> {
  return request<TraspasoResponse>("/traspaso");
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch("/api/health", { cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}
