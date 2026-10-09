"use client";

import { useEffect, useState } from "react";
import { checkHealth } from "@/lib/api";
import styles from "./Header.module.css";

type Status = "checking" | "online" | "offline";

const STATUS_LABEL: Record<Status, string> = {
  checking: "Verificando…",
  online: "Backend en línea",
  offline: "Backend fuera de línea",
};

const POLL_MS = 15_000;

export function Header() {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let active = true;
    const probe = async () => {
      const ok = await checkHealth();
      if (active) setStatus(ok ? "online" : "offline");
    };
    void probe();
    const timer = setInterval(probe, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <header className={styles.header}>
      <h1>Suplente digital</h1>
      <span className={`${styles.status} ${styles[status]}`} aria-live="polite">
        <span className={styles.dot} />
        {STATUS_LABEL[status]}
      </span>
    </header>
  );
}
