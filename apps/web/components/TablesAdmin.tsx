"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toasts";

export function TableCount({ slug, count }: { slug: string; count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="row wrap no-print"
      style={{ justifyContent: "flex-start" }}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const n = Number(new FormData(e.currentTarget).get("count"));
        const res = await fetch(`/api/office/${slug}/tables`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "count", count: n }) });
        const d = await res.json();
        setBusy(false);
        if (!res.ok) return toast(d.error, { kind: "err" });
        toast(`${n} tables`, { kind: "ok" });
        router.refresh();
      }}
    >
      <label className="field" style={{ width: 160 }}>
        Number of tables
        <input name="count" type="number" min={0} max={200} defaultValue={count} />
      </label>
      <button className="btn sm" style={{ alignSelf: "end" }} disabled={busy}>
        Save
      </button>
      <button type="button" className="btn sm ghost" style={{ alignSelf: "end" }} onClick={() => window.print()}>
        Print QR codes
      </button>
    </form>
  );
}

export function NewCode({ slug, tableId, number }: { slug: string; tableId: string; number: number }) {
  const router = useRouter();
  return (
    <button
      className="btn sm ghost no-print"
      onClick={async () => {
        if (!confirm(`Make a new QR code for table ${number}? The printed one stops working.`)) return;
        const res = await fetch(`/api/office/${slug}/tables`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "newCode", tableId }) });
        if (!res.ok) return toast("Couldn't change it", { kind: "err" });
        toast(`New code for table ${number}. Reprint it.`, { kind: "ok" });
        router.refresh();
      }}
    >
      New code
    </button>
  );
}
