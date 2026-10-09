"use client";

import { useState } from "react";
import { fetchHandoff, type TraspasoResponse } from "@/lib/api";
import { RichText } from "./RichText";
import styles from "./HandoffPanel.module.css";

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

function HandoffSummary({ data }: { data: TraspasoResponse }) {
  const counters = [
    { label: "Total", value: data.total },
    { label: "Respondidas", value: data.respondidas, tone: styles.green },
    { label: "Ejecutadas", value: data.ejecutadas, tone: styles.blue },
    { label: "Escaladas", value: data.escaladas, tone: styles.amber },
  ];

  return (
    <>
      <dl className={styles.counters}>
        {counters.map((c) => (
          <div key={c.label} className={`${styles.counter} ${c.tone ?? ""}`}>
            <dt>{c.label}</dt>
            <dd>{c.value}</dd>
          </div>
        ))}
      </dl>

      <h3 className={styles.subtitle}>Resumen</h3>
      <div className={styles.summary}>
        <RichText text={data.resumen || "Sin actividad registrada."} />
      </div>

      <h3 className={styles.subtitle}>Pendientes ({data.pendientes.length})</h3>
      {data.pendientes.length === 0 ? (
        <p className={styles.muted}>No hay consultas pendientes.</p>
      ) : (
        <ul className={styles.pending}>
          {data.pendientes.map((p, i) => (
            <li key={`${p.fecha}-${i}`}>
              <span>{p.pregunta}</span>
              <time dateTime={p.fecha}>{formatDate(p.fecha)}</time>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function HandoffPanel() {
  const [data, setData] = useState<TraspasoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchHandoff());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className={styles.panel} aria-label="Traspaso">
      <div className={styles.header}>
        <h2>Traspaso</h2>
        <button type="button" className={styles.button} onClick={generate} disabled={loading}>
          {loading ? "Generando…" : "Generar traspaso"}
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {data ? (
        <HandoffSummary data={data} />
      ) : (
        !error && (
          <p className={styles.muted}>
            Generá el traspaso para ver qué resolvió el suplente y qué quedó pendiente.
          </p>
        )
      )}
    </aside>
  );
}
