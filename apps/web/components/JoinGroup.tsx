"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function JoinGroup({ code }: { code: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      {err && <div className="error">{err}</div>}
      <button className="btn block" onClick={async () => {
        const r = await fetch("/api/groups/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
        const j = await r.json();
        if (!r.ok) return setErr(j.error);
        router.push(`/me/groups/${j.id}`);
      }}>Join the group</button>
    </>
  );
}
