"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toasts";

/** One-tap POST and refresh. */
export function ActionButton({ url, body, label, ghost, confirmText }: { url: string; body: Record<string, unknown>; label: string; ghost?: boolean; confirmText?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`btn sm ${ghost ? "ghost" : ""}`}
      disabled={busy}
      onClick={async () => {
        if (confirmText && !confirm(confirmText)) return;
        setBusy(true);
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = await res.json().catch(() => ({}));
        setBusy(false);
        if (!res.ok) return toast(d.error ?? "Something went wrong", { kind: "err" });
        if (d.message) toast(d.message, { kind: "ok" });
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
