export type Route = "responder" | "ejecutar" | "escalar";

export interface Interaction {
  question: string;
  route: Route;
  answer: string;
  escalated: boolean;
  date: string;
}

const interactions: Interaction[] = [];

export function logInteraction(entry: Interaction): void {
  interactions.push(entry);
}

export function getInteractions(): readonly Interaction[] {
  return interactions;
}
