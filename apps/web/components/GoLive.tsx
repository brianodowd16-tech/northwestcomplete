"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toasts";

export function GoLive({ slug, ready }: { slug: string; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="btn block"
      disabled={!ready || busy}
      onClick={async () => {
        setBusy(true);
        const res = await fetch(`/api/office/${slug}/golive`, { method: "POST" });
        const d = await res.json();
        setBusy(false);
        if (!res.ok) return toast(d.error, { kind: "err" });
        toast("You're live! Guests can now order and pay.", { kind: "ok" });
        router.push(`/office/${slug}`);
        router.refresh();
      }}
    >
      {ready ? (busy ? "Going live…" : "Go live: start taking real orders") : "Finish the required steps to go live"}
    </button>
  );
}
