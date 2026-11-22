"use client";
import { useEffect, useState } from "react";

type Kind = "info" | "ok" | "err";
interface Toast {
  id: number;
  text: string;
  kind: Kind;
  action?: { label: string; run: () => void };
}

const listeners = new Set<(t: Toast[]) => void>();
let toasts: Toast[] = [];
let seq = 0;

function emit() {
  listeners.forEach((l) => l(toasts));
}

/** Shows a short message at the top of the screen. An action adds a button (e.g. Undo). */
export function toast(text: string, opts: { kind?: Kind; ms?: number; action?: Toast["action"] } = {}) {
  // The same message twice in a row (e.g. a live update and a refresh) shows once.
  if (toasts.at(-1)?.text === text) return;
  const t: Toast = { id: ++seq, text, kind: opts.kind ?? "info", action: opts.action };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    emit();
  }, opts.ms ?? 3500);
}

export function Toaster() {
  const [list, setList] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.add(setList);
    return () => {
      listeners.delete(setList);
    };
  }, []);
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast2 ${t.kind === "info" ? "" : t.kind}`} role="status">
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                toasts = toasts.filter((x) => x.id !== t.id);
                emit();
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
