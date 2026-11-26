"use client";
import { useRouter } from "next/navigation";
import { toast } from "./Toasts";

export function GroupStart() {
  const router = useRouter();
  const post = async (url: string, body: object) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) return toast(j.error, { kind: "err" });
    router.push(`/me/groups/${j.id}`);
  };
  return (
    <div className="two">
      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); post("/api/groups", { name: new FormData(e.currentTarget).get("name") }); }}>
        <h3>Start a group</h3>
        <label className="field">Name<input name="name" required minLength={2} maxLength={60} placeholder="Friday crew" /></label>
        <button className="btn sm" style={{ alignSelf: "flex-start" }}>Create</button>
      </form>
      <form className="panel stack" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("code") ?? "").trim(); post("/api/groups/join", { code: v.split("/").pop() }); }}>
        <h3>Join with a link</h3>
        <label className="field">Invite link or code<input name="code" required placeholder="complete.pub/g/…" /></label>
        <button className="btn sm" style={{ alignSelf: "flex-start" }}>Join</button>
      </form>
    </div>
  );
}
