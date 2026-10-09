import { Fragment, type ReactNode } from "react";
import styles from "./RichText.module.css";

// Tiny safe renderer: line breaks, **bold** and "- " / "* " list lines. No HTML injection.
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

type Block = { kind: "list"; items: string[] } | { kind: "line"; text: string };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const match = raw.match(/^\s*[-*•]\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (match) {
      if (last?.kind === "list") last.items.push(match[1]);
      else blocks.push({ kind: "list", items: [match[1]] });
    } else {
      blocks.push({ kind: "line", text: raw });
    }
  }
  return blocks;
}

export function RichText({ text }: { text: string }) {
  return (
    <div className={styles.rich}>
      {toBlocks(text).map((block, i) =>
        block.kind === "list" ? (
          <ul key={i}>
            {block.items.map((item, j) => (
              <li key={j}>{renderInline(item)}</li>
            ))}
          </ul>
        ) : block.text.trim() === "" ? (
          <div key={i} className={styles.spacer} />
        ) : (
          <p key={i}>{renderInline(block.text)}</p>
        ),
      )}
    </div>
  );
}
