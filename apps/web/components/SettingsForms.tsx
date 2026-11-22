"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  slug: string;
  notifyUrl: string;
  provider: "mock" | "revolut" | "mypos";
  mypos: { sid?: string; walletNumber?: string; keyIndex?: number; mode?: string; myposCertPem?: string; hasKey: boolean };
  revolut: { publicKey?: string; apiBase?: string; hasKey: boolean };
  placeId: string;
  xero: {
    available: boolean;
    connected: boolean;
    orgName?: string;
    mapping: Record<string, string>;
    history: { date: string; status: string; error: string | null }[];
  };
  serverReady: boolean;
}

function useSave(slug: string) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ section: string; ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function save(section: string, form: HTMLFormElement | null, extra: Record<string, unknown> = {}) {
    setBusy(section);
    setMsg(null);
    const body = { section, ...(form ? Object.fromEntries(new FormData(form)) : {}), ...extra };
    const res = await fetch(`/api/office/${slug}/settings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    setBusy(null);
    setMsg({ section, ok: res.ok, text: res.ok ? (d.result ? `Xero ${d.day}: ${d.result.replace("_", " ")}` : "Saved") : d.error });
    router.refresh();
  }
  return { save, msg, busy };
}

const Msg = ({ m, section }: { m: { section: string; ok: boolean; text: string } | null; section: string }) =>
  m && m.section === section ? <div className={m.ok ? "notice" : "error"}>{m.text}</div> : null;

export function SettingsForms(p: Props) {
  const { save, msg, busy } = useSave(p.slug);
  const [provider, setProvider] = useState(p.provider);

  return (
    <div className="stack">
      {!p.serverReady && <div className="error">SECRETS_KEY isn&apos;t set on the server, so payment keys and Xero can&apos;t be saved yet.</div>}

      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          save("payments", e.currentTarget);
        }}
      >
        <h3>Payments</h3>
        <label className="field">
          Card payments go through
          <select name="provider" value={provider} onChange={(e) => setProvider(e.target.value as Props["provider"])}>
            <option value="mypos">myPOS</option>
            <option value="revolut">Revolut</option>
            <option value="mock">Test payments (no money moves)</option>
          </select>
        </label>
        {provider === "mypos" && (
          <>
            <div className="two">
              <label className="field">Store ID (SID)<input name="sid" defaultValue={p.mypos.sid} required /></label>
              <label className="field">Wallet number<input name="walletNumber" defaultValue={p.mypos.walletNumber} required /></label>
              <label className="field">Key index<input name="keyIndex" type="number" min={1} defaultValue={p.mypos.keyIndex ?? 1} /></label>
              <label className="field">
                Mode
                <select name="mode" defaultValue={p.mypos.mode ?? "test"}>
                  <option value="test">Test (sandbox)</option>
                  <option value="live">Live</option>
                </select>
              </label>
            </div>
            <label className="field">
              myPOS public certificate (from the myPOS merchant portal)
              <textarea name="myposCertPem" rows={4} defaultValue={p.mypos.myposCertPem} required style={{ fontFamily: "var(--f-mono)", fontSize: 12 }} />
            </label>
            <label className="field">
              Your private key {p.mypos.hasKey ? "(stored, encrypted; paste a new one to replace it)" : "(RSA 2048, PEM)"}
              <textarea name="privateKeyPem" rows={4} required={!p.mypos.hasKey} placeholder="-----BEGIN PRIVATE KEY-----" style={{ fontFamily: "var(--f-mono)", fontSize: 12 }} />
            </label>
            <p className="muted small" style={{ margin: 0 }}>
              In myPOS, set the notification URL to <code>{p.notifyUrl}</code>.
            </p>
          </>
        )}
        {provider === "revolut" && (
          <div className="two">
            <label className="field">Public key<input name="publicKey" defaultValue={p.revolut.publicKey} /></label>
            <label className="field">API base<input name="apiBase" defaultValue={p.revolut.apiBase ?? "https://sandbox-merchant.revolut.com"} /></label>
            <label className="field">Secret key {p.revolut.hasKey && "(stored)"}<input name="secretKey" type="password" autoComplete="off" /></label>
            <label className="field">Webhook signing secret {p.revolut.hasKey && "(stored)"}<input name="webhookSecret" type="password" autoComplete="off" /></label>
          </div>
        )}
        <Msg m={msg} section="payments" />
        <button className="btn" disabled={busy === "payments"}>Save payments</button>
      </form>

      <form
        className="panel stack"
        onSubmit={(e) => {
          e.preventDefault();
          save("reviews", e.currentTarget);
        }}
      >
        <h3>Google reviews</h3>
        <p className="muted small" style={{ margin: 0 }}>
          After paying, every guest sees a &quot;Leave a Google review&quot; button. Nobody is rewarded and nobody is filtered out first, because Google bans both.
        </p>
        <label className="field">
          Google Place ID (from Google&apos;s Place ID Finder)
          <input name="placeId" defaultValue={p.placeId} placeholder="ChIJ…" />
        </label>
        <Msg m={msg} section="reviews" />
        <button className="btn" disabled={busy === "reviews"}>Save</button>
      </form>

      <section className="panel stack">
        <h3>Xero</h3>
        {!p.xero.available ? (
          <p className="muted small" style={{ margin: 0 }}>Xero isn&apos;t configured on the server yet (XERO_CLIENT_ID and XERO_CLIENT_SECRET).</p>
        ) : !p.xero.connected ? (
          <>
            <p className="muted small" style={{ margin: 0 }}>Each night, yesterday&apos;s app sales go to Xero as one invoice, split by VAT rate, with the card payment applied.</p>
            <a className="btn" href={`/api/xero/connect?venue=${p.slug}`}>Connect to Xero</a>
          </>
        ) : (
          <>
            <div className="row wrap">
              <span>
                Connected to <b>{p.xero.orgName}</b>
              </span>
              <a className="btn ghost sm" href={`/api/xero/connect?venue=${p.slug}`}>Reconnect</a>
            </div>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                save("xero-mapping", e.currentTarget);
              }}
            >
              <p className="muted small" style={{ margin: 0 }}>Use the codes from your Xero chart of accounts and tax rates. Ask your accountant if unsure.</p>
              <div className="two">
                {(
                  [
                    ["salesAccountCode", "Sales account code"],
                    ["taxType9", "Tax rate for 9% (food & hot drinks)"],
                    ["taxType23", "Tax rate for 23% (drinks)"],
                    ["creditAccountCode", "Account for loyalty credit redeemed"],
                    ["creditTaxType", "Tax rate for loyalty credit"],
                    ["paymentAccountCode", "Bank/clearing account card payments land in"],
                    ["contactName", "Xero contact for the daily invoice"],
                  ] as const
                ).map(([k, label]) => (
                  <label className="field" key={k}>
                    {label}
                    <input name={k} defaultValue={p.xero.mapping[k] ?? ""} required={k !== "contactName"} />
                  </label>
                ))}
              </div>
              <Msg m={msg} section="xero-mapping" />
              <button className="btn" disabled={busy === "xero-mapping"}>Save account mapping</button>
            </form>
            <div className="row wrap">
              <span className="muted small">The nightly sync runs at 03:15. Missed or failed days are retried for a week.</span>
              <button className="btn ghost sm" disabled={busy === "xero-sync"} onClick={() => save("xero-sync", null)}>
                Send yesterday now
              </button>
            </div>
            <Msg m={msg} section="xero-sync" />
            {p.xero.history.length > 0 && (
              <table>
                <tbody>
                  {p.xero.history.map((h) => (
                    <tr key={h.date}>
                      <td className="num">{h.date}</td>
                      <td>{h.status === "done" ? <span className="chip ok">Sent</span> : h.status === "nothing" ? <span className="chip plain">No sales</span> : <span className="chip crit">Failed</span>}</td>
                      <td className="muted small">{h.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </div>
  );
}
