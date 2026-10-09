"use client";

import { useState } from "react";
import styles from "./SubstituteCard.module.css";

const PHOTO_SRC =
  "https://www.radioformula.com.mx/__export/1754970102049/sites/formula/img/2025/08/12/doblaje-roz-monsters-inc-es-un-hombre.jpg";

export function SubstituteCard() {
  const [photoFailed, setPhotoFailed] = useState(false);

  return (
    <section className={styles.card} aria-label="Suplente de turno">
      <div className={styles.frame}>
        {photoFailed ? (
          <span className={styles.fallback} aria-hidden="true">R</span>
        ) : (
          // Plain <img>: next/image would fetch through the Next server, which the source site blocks.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={PHOTO_SRC}
            alt="Foto de Roz, suplente de RR. HH."
            width={88}
            height={88}
            className={styles.photo}
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailed(true)}
          />
        )}
      </div>
      <div className={styles.info}>
        <span className={styles.badge}>De guardia</span>
        <h2 className={styles.name}>Roz</h2>
        <p className={styles.role}>Suplente de RR. HH.</p>
        <p className={styles.note}>Cubre al equipo mientras está de vacaciones.</p>
      </div>
    </section>
  );
}
