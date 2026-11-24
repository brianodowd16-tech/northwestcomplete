"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toasts";

interface Member {
  id: string;
  name: string;
  email: string;
  role: "admin" | "staff";
  mustChangePassword: boolean;
}

export function TeamAdmin({ slug, team, me }: { slug: string; team: Member[]; me: string }) {
  const router = useRouter();
  const [issued, setIssued] = useState<{ email: string; pw: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="stack">
      <section className="panel stack">
        <h3>Your team</h3>
        <div style={{ overflowX: "auto" }}>
          <table>
            <tbody>
              {team.map((m) => (
                <tr key={m.id}>
                  <td>
                    <b>{m.name}</b>
                    {m.id === me && <span className="muted small"> (you)</span>}
                    <div className="muted small">{m.email}</div>
                  </td>
                  <td>{m.role === "admin" ? <span className="chip ok">Manager</span> : <span className="chip plain">Staff</span>}</td>
                  <td className="small muted">{m.mustChangePassword ? "Hasn't signed in yet" : ""}</td>
                  <td className="r">
                    {m.id !== me && (
                      <button
                        className="btn sm ghost"
                        onClick={async () => {
                          if (!confirm(`Remove ${m.name}? They won't be able to sign in.`)) return;
                          const res = await fetch(`/api/office/${slug}/team?id=${m.id}`, { method: "DELETE" });
                          const d = await res.json();
                          if (!res.ok) return toast(d.error, { kind: "err" });
                          toast(`${m.name} removed`);
                          router.refresh();
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {issued && (
        <div className="panel stack">
          <div className="notice">Give this to {issued.email} in person. It works once: they choose their own password when they first sign in.</div>
          <div className="token">{issued.pw}</div>
          <span className="small">They sign in at /staff/login with their email and this password.</span>
          <button className="btn sm ghost" onClick={() => setIssued(null)}>
            Done
          </button>
        </div>
      )}
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          setBusy(true);
          const res = await fetch(`/api/office/${slug}/team`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.get("name"), email: f.get("email"), role: f.get("role") }) });
          const d = await res.json();
          setBusy(false);
          if (!res.ok) return toast(d.error, { kind: "err" });
          setIssued({ email: String(f.get("email")), pw: d.tempPassword });
          form.reset();
          router.refresh();
        }}
      >
        <h3>Add someone</h3>
        <div className="two">
          <label className="field">
            Name
            <input name="name" required maxLength={80} />
          </label>
          <label className="field">
            Email
            <input name="email" type="email" required />
          </label>
          <label className="field">
            Role
            <select name="role" defaultValue="staff">
              <option value="staff">Staff: bar and kitchen screens, sold-out</option>
              <option value="admin">Manager: everything, including money and settings</option>
            </select>
          </label>
        </div>
        <button className="btn" disabled={busy}>
          Add to team
        </button>
      </form>
      <a className="btn ghost sm" href="/staff/password" style={{ alignSelf: "flex-start" }}>
        Change my password
      </a>
    </div>
  );
}
