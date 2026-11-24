"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toasts";

/**
 * A form that posts its fields as JSON ({ action, ...fields }) and refreshes the page.
 * A file input named "file" is sent as text in "csv".
 */
export function ActionForm({
  endpoint,
  action,
  children,
  className = "panel stack",
  okText = "Saved",
  confirmText,
  reset = false,
  style,
}: {
  endpoint: string;
  action: string;
  children: React.ReactNode;
  className?: string;
  okText?: string;
  confirmText?: string;
  reset?: boolean;
  style?: React.CSSProperties;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={className}
      style={style}
      aria-busy={busy}
      onSubmit={async (e) => {
        e.preventDefault();
        if (confirmText && !confirm(confirmText)) return;
        const form = e.currentTarget;
        const body: Record<string, unknown> = { action };
        for (const [k, v] of new FormData(form)) {
          if (v instanceof File) {
            if (v.size) body.csv = await v.text();
          } else body[k] = v;
        }
        setBusy(true);
        try {
          const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const d = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(d.error ?? "Something went wrong");
          toast(d.message ?? okText, { kind: "ok" });
          if (reset) form.reset();
          router.refresh();
        } catch (err) {
          toast((err as Error).message, { kind: "err" });
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "contents" }}>
        {children}
      </fieldset>
    </form>
  );
}
