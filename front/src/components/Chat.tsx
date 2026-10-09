"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { askQuestion, type Route } from "@/lib/api";
import { RichText } from "./RichText";
import styles from "./Chat.module.css";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "bot"; text: string; route: Route; escalated: boolean }
  | { id: number; role: "error"; text: string };

const EXAMPLES = [
  "¿Cómo pido un reintegro de gastos?",
  "¿Qué reuniones hay mañana?",
  "Redactá un mail para Laura avisando que la revisión del sprint se pasa al jueves",
  "¿Me aprobás un aumento de sueldo?",
];

const ROUTE_LABEL: Record<Route, string> = {
  responder: "Respondida",
  ejecutar: "Ejecutada",
  escalar: "Escalada a humano",
};

function MessageBubble({ message }: { message: Message }) {
  if (message.role === "user") {
    return <div className={`${styles.bubble} ${styles.user}`}>{message.text}</div>;
  }
  if (message.role === "error") {
    return (
      <div className={`${styles.bubble} ${styles.error}`} role="alert">
        <strong>No se pudo procesar la consulta.</strong> {message.text}
      </div>
    );
  }
  return (
    <div className={`${styles.bubble} ${styles.bot}`}>
      <div className={styles.meta}>
        <span className={`${styles.badge} ${styles[message.route] ?? ""}`}>
          {ROUTE_LABEL[message.route] ?? message.route}
        </span>
        {message.escalated && <span className={styles.escalated}>⚑ Escalada</span>}
      </div>
      <RichText text={message.text} />
    </div>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const nextId = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || pending) return;

    setMessages((prev) => [...prev, { id: nextId.current++, role: "user", text: question }]);
    setInput("");
    setPending(true);

    try {
      const res = await askQuestion(question);
      setMessages((prev) => [
        ...prev,
        {
          id: nextId.current++,
          role: "bot",
          text: res.respuesta,
          route: res.ruta,
          escalated: res.escalada,
        },
      ]);
    } catch (err) {
      const text = err instanceof Error ? err.message : "Error desconocido.";
      setMessages((prev) => [...prev, { id: nextId.current++, role: "error", text }]);
    } finally {
      setPending(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <section className={styles.chat} aria-label="Chat con el suplente">
      <div className={styles.messages}>
        {messages.length === 0 && (
          <p className={styles.empty}>
            Hacé una consulta al suplente digital o probá con alguno de los ejemplos.
          </p>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {pending && (
          <div className={`${styles.bubble} ${styles.bot} ${styles.thinking}`} aria-live="polite">
            El suplente está pensando…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className={styles.examples}>
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className={styles.chip}
            onClick={() => void send(example)}
            disabled={pending}
          >
            {example}
          </button>
        ))}
      </div>

      <form className={styles.composer} onSubmit={onSubmit}>
        <textarea
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escribí tu consulta… (Enter envía, Shift+Enter agrega una línea)"
          rows={2}
          aria-label="Consulta"
        />
        <button type="submit" className={styles.send} disabled={pending || !input.trim()}>
          {pending ? "Enviando…" : "Enviar"}
        </button>
      </form>
    </section>
  );
}
