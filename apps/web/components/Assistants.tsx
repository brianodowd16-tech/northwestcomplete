"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { eur } from "./format";
import { toast } from "./Toasts";

interface GrantView {
  id: string;
  name: string;
  scopes: string[];
  maxOrderCents: number;
  maxCreditCents: number;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  tokenHint: string;
}
interface ActivityView {
  id: string;
  grantName: string;
  tool: string;
  allowed: boolean;
  reasons: string[];
  outcome: string | null;
  createdAt: string;
}

const SCOPES: [string, string][] = [
  ["profile:read", "See my level, points and recent orders"],
  ["benefits:read", "See my credit, offers and suggestions"],
  ["orders:quote", "Price an order with my best rewards"],
  ["points:convert", "Turn my points into credit"],
  ["orders:create", "Prepare orders for me to approve"],
];
const TOOL_TEXT: Record<string, string> = {
  get_profile: "Read your profile",
  list_benefits: "Checked your benefits",
  get_menu: "Read the menu",
  recommend_items: "Got suggestions",
  check_eligibility: "Checked a reward",
  quote_order: "Priced an order",
  start_order: "Prepared an order",
  convert_points: "Converted points",
};

/** Lets the guest connect an AI assistant (Claude, ChatGPT…) with limits, see what it did, and switch it off. */
export function Assistants({ slug, grants, activity }: { slug: string; grants: GrantView[]; activity: ActivityView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ token: string; mcpUrl: string } | null>(null);

  async function connect(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const res = await fetch(`/api/v/${slug}/assistants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        scopes: f.getAll("scope"),
        maxOrderCents: Math.round(Number(f.get("maxOrder")) * 100),
        maxCreditCents: Math.round(Number(f.get("maxCredit")) * 100),
        days: Number(f.get("days")),
      }),
    });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) return toast(d.error, { kind: "err" });
    setIssued({ token: d.token, mcpUrl: d.mcpUrl });
    setOpen(false);
    router.refresh();
  }

  async function revoke(id: string, name: string) {
    const res = await fetch(`/api/v/${slug}/assistants/${id}`, { method: "DELETE" });
    if (!res.ok) return toast("Couldn't switch it off. Try again.", { kind: "err" });
    toast(`${name} can no longer act for you`, { kind: "ok" });
    router.refresh();
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Select the text and copy it");
    }
  };

  const live = grants.filter((g) => !g.revokedAt && new Date(g.expiresAt) > new Date());
  return (
    <section className="card stack" aria-label="AI assistants">
      <div className="row">
        <b>AI assistants</b>
        {!open && !issued && (
          <button className="btn sm ghost" onClick={() => setOpen(true)}>
            Connect one
          </button>
        )}
      </div>
      <span className="muted small">Let Claude, ChatGPT or another assistant check your rewards and prepare orders for you. It only does what you allow, and you approve every order.</span>

      {issued && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="notice">Copy this now: it won&apos;t be shown again.</div>
          <span className="small">Add a custom connector in your assistant with this server address:</span>
          <div className="token">{issued.mcpUrl}</div>
          <button className="btn sm ghost" onClick={() => copy(issued.mcpUrl)}>Copy address</button>
          <span className="small">and this access token (as a Bearer token):</span>
          <div className="token">{issued.token}</div>
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <button className="btn sm" onClick={() => copy(issued.token)}>Copy token</button>
            <button className="btn sm ghost" onClick={() => setIssued(null)}>Done</button>
          </div>
        </div>
      )}

      {open && (
        <form className="stack" onSubmit={connect} style={{ gap: 10 }}>
          <label className="field">
            Name it
            <input name="name" defaultValue="Claude" required maxLength={40} />
          </label>
          <fieldset className="scopes" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="small" style={{ marginBottom: 4 }}>It may:</legend>
            {SCOPES.map(([k, label]) => (
              <label key={k} className="toggle small">
                <input type="checkbox" name="scope" value={k} defaultChecked={k !== "points:convert"} /> {label}
              </label>
            ))}
          </fieldset>
          <div className="two">
            <label className="field">
              Largest order (€)
              <input name="maxOrder" type="number" min={0} step={1} defaultValue={40} />
            </label>
            <label className="field">
              Most credit per order (€)
              <input name="maxCredit" type="number" min={0} step={1} defaultValue={10} />
            </label>
          </div>
          <label className="field">
            Works for
            <select name="days" defaultValue={30}>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <div className="row" style={{ justifyContent: "flex-start" }}>
            <button className="btn" disabled={busy}>
              {busy ? "Connecting…" : "Connect"}
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {live.map((g) => (
        <div key={g.id} className="benefit">
          <div>
            <b>{g.name}</b> <span className="muted small">· token …{g.tokenHint}</span>
            <div className="muted small">
              Up to {eur(g.maxOrderCents)} per order, {eur(g.maxCreditCents)} credit · until {new Date(g.expiresAt).toLocaleDateString("en-IE")}
              {g.lastUsedAt ? ` · last used ${new Date(g.lastUsedAt).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}` : " · not used yet"}
            </div>
          </div>
          <button className="btn sm danger" onClick={() => revoke(g.id, g.name)}>
            Switch off
          </button>
        </div>
      ))}

      {activity.length > 0 && (
        <details>
          <summary className="small" style={{ cursor: "pointer" }}>
            What your assistants did ({activity.length})
          </summary>
          <div style={{ marginTop: 8 }}>
            {activity.map((a) => (
              <div key={a.id} className="sumrow small" style={{ padding: "4px 0" }}>
                <span>
                  {a.allowed ? "✓" : "✗"} {a.grantName}: {TOOL_TEXT[a.tool] ?? a.tool}
                  {!a.allowed && a.reasons[0] ? <span className="muted"> ({a.reasons[0]})</span> : null}
                </span>
                <span className="muted num">{new Date(a.createdAt).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
