"use client";
import { useRouter } from "next/navigation";
import { toast } from "./Toasts";

/** "Kitchen slammed": stop new app orders for a while. Till sales are unaffected. */
export function PauseControl({ station, until }: { station: "bar" | "kitchen"; until: string | null }) {
  const router = useRouter();
  const paused = until && new Date(until) > new Date();
  const set = async (minutes: number) => {
    const res = await fetch("/api/staff/pause", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ station, minutes }) });
    const d = await res.json();
    if (!res.ok) return toast(d.error, { kind: "err" });
    toast(minutes ? `New app orders paused for ${minutes} minutes` : "Taking app orders again", { kind: "ok" });
    router.refresh();
  };
  return (
    <div className="row wrap" style={{ justifyContent: "flex-start", gap: 6, marginBottom: 10 }}>
      {paused ? (
        <>
          <span className="chip warn">App orders paused until {new Date(until!).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}</span>
          <button className="btn sm" onClick={() => set(0)}>Resume now</button>
        </>
      ) : (
        <>
          <span className="muted small">Too busy? Pause new app orders:</span>
          {[15, 30, 60].map((m) => (
            <button key={m} className="btn sm ghost" onClick={() => set(m)}>
              {m} min
            </button>
          ))}
        </>
      )}
    </div>
  );
}
