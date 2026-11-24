"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toasts";

/** Creates (or replaces) an integration secret and shows it once. */
export function SecretForm({ endpoint, action, children, button }: { endpoint: string; action: string; children?: React.ReactNode; button: string }) {
  const router = useRouter();
  const [secret, setSecret] = useState<string | null>(null);
  return (
    <form
      className="stack"
      style={{ gap: 8 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const body = { action, ...Object.fromEntries(new FormData(e.currentTarget)) };
        const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const d = await res.json();
        if (!res.ok) return toast(d.error, { kind: "err" });
        toast(d.message, { kind: "ok" });
        setSecret(d.secret ?? null);
        router.refresh();
      }}
    >
      {children}
      <button className="btn sm" style={{ alignSelf: "flex-start" }}>{button}</button>
      {secret && (
        <>
          <div className="notice">Copy this secret now: it won&apos;t be shown again.</div>
          <div className="token">{secret}</div>
        </>
      )}
    </form>
  );
}
