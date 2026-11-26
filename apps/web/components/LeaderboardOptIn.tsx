"use client";
import { useRouter } from "next/navigation";
import { toast } from "./Toasts";

export function LeaderboardOptIn({ optIn, name }: { optIn: boolean; name: string }) {
  const router = useRouter();
  return (
    <form className="row wrap" style={{ gap: 6 }} onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const r = await fetch("/api/me/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ leaderboardOptIn: f.get("on") === "on", leaderboardName: String(f.get("name") ?? "") }) });
      const j = await r.json();
      toast(r.ok ? (f.get("on") === "on" ? "You're on the leaderboards" : "You're off the leaderboards") : j.error, { kind: r.ok ? "ok" : "err" });
      router.refresh();
    }}>
      <label className="toggle"><input type="checkbox" name="on" defaultChecked={optIn} /> Show me on leaderboards as</label>
      <input name="name" className="field-input" style={{ width: 160, textAlign: "left" }} defaultValue={name} maxLength={24} placeholder="Display name" />
      <button className="btn sm ghost">Save</button>
    </form>
  );
}
