import { PAYROLL_FORMATS, sageMapped, type SageMapping } from "@round/core";
import { BIZIMPLY_DEFAULT_HEADINGS, localDate as ld } from "@round/core";
import { listTeam } from "@round/db/admin";
import { integrationStatus, sageOptions, syncHistory } from "@round/db/integrations";
import { deelOverview } from "@/lib/deelsync";
import { ActionForm } from "@/components/ActionForm";
import { SecretForm } from "@/components/SecretForm";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { ConnectSections } from "./Connect";
import { appUrl, requireStaffFor, sageApp, secretsKey } from "@/lib/server";

export const dynamic = "force-dynamic";

const SAGE_NOTICE: Record<string, [string, string]> = {
  connected: ["notice", "Sage is connected. Pick the accounts below."],
  cancelled: ["error", "Sage sign-in was cancelled."],
  failed: ["error", "Sage didn't connect. Try again."],
};

const SAGE_FIELDS: [keyof SageMapping, string, "contacts" | "ledgers" | "taxRates" | "banks"][] = [
  ["contactId", "Customer to invoice (e.g. \u201cApp sales\u201d)", "contacts"],
  ["salesLedgerId", "Sales ledger", "ledgers"],
  ["taxRate9Id", "VAT rate for food (9%)", "taxRates"],
  ["taxRate23Id", "VAT rate for drinks (23%)", "taxRates"],
  ["creditLedgerId", "Ledger for loyalty credit redeemed", "ledgers"],
  ["taxRateNoneId", "VAT rate for loyalty credit (zero or no VAT)", "taxRates"],
  ["bankAccountId", "Bank account card payouts land in", "banks"],
];

export default async function Integrations({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ sage?: string }> }) {
  const { slug } = await params;
  const sageNotice = SAGE_NOTICE[(await searchParams).sage ?? ""];
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const st = await integrationStatus(venue);
  const api = `/api/office/${slug}/integrations`;
  const pmsUrl = (st.pms?.config as { url?: string } | undefined)?.url ?? "";
  const sage = sageApp(), key = secretsKey();
  const sc = (st.sage?.config ?? {}) as Partial<SageMapping> & { businessName?: string };
  let opts: Awaited<ReturnType<typeof sageOptions>> | null = null, optsError = "";
  if (st.sage?.hasSecret && sage && key) opts = await sageOptions(venue, sage, key).catch((e) => ((optsError = String(e instanceof Error ? e.message : e).slice(0, 160)), null));
  const sageLog = st.sage ? (await syncHistory(venue, "sage")).sort((a, b) => b.businessDate.localeCompare(a.businessDate)).slice(0, 7) : [];
  const pc = (st.payroll?.config ?? {}) as { mode?: string; email?: string; url?: string; format?: string; frequency?: string; anchor?: string };
  const payLog = st.payroll ? (await syncHistory(venue, "payroll")).sort((a, b) => b.businessDate.localeCompare(a.businessDate)).slice(0, 6) : [];
  const team = st.deel ? await listTeam(venue) : [];
  let deel: Awaited<ReturnType<typeof deelOverview>> = null, deelError = "";
  if (st.deel?.hasSecret) deel = await deelOverview(venue, team.map((x) => ({ id: x.id, email: x.email }))).catch((e) => ((deelError = String(e instanceof Error ? e.message : e).slice(0, 160)), null));
  const dc = (st.deel?.config ?? {}) as { env?: string; frequency?: string; anchor?: string; payCategoryId?: string; tipsCategoryId?: string };
  const deelLog = st.deel ? (await syncHistory(venue, "deel")).sort((a, b) => b.businessDate.localeCompare(a.businessDate)).slice(0, 6) : [];
  const bc = (st.bizimply?.config ?? {}) as { host?: string; port?: number; username?: string; dir?: string; location?: string; headings?: string[] };
  const bizLog = st.bizimply ? (await syncHistory(venue, "bizimply")).sort((a, b) => b.businessDate.localeCompare(a.businessDate)).slice(0, 7) : [];
  const yday = ld(new Date(Date.now() - 86_400_000), venue.timezone);
  const chip = (s: string) => <span className={`chip ${s === "done" ? "ok" : s === "error" ? "warn" : "plain"}`}>{s === "done" ? "Sent" : s === "nothing" ? "Nothing to send" : "Failed"}</span>;
  return (
    <div className="page stack" style={{ maxWidth: 900 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="integrations" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Integrations</h1>
      </div>

      {sageNotice && <div className={sageNotice[0]}>{sageNotice[1]}</div>}

      <section className="panel stack">
        <div className="row wrap"><h3>Sage Accounting</h3>{st.sage?.hasSecret ? <span className="chip ok">Connected{sc.businessName ? `: ${sc.businessName}` : ""}</span> : <span className="chip plain">Not connected</span>}</div>
        <p className="muted small" style={{ margin: 0 }}>
          Every night, yesterday&apos;s app and till card sales go to Sage as one sales invoice split by VAT rate, with one receipt for the card money into your clearing bank account, the same as the Xero sync (use one or the other). For Sage Accounting (cloud). Sage 50 desktop has no live connection: use your accountant&apos;s import, or Xero.
        </p>
        {!sage ? <span className="muted small">Sage isn&apos;t switched on for this server yet (SAGE_CLIENT_ID).</span> : <a className="btn sm" style={{ alignSelf: "flex-start" }} href={`/api/sage/connect?venue=${slug}`}>{st.sage?.hasSecret ? "Reconnect Sage" : "Connect to Sage"}</a>}
        {optsError && <div className="error">Couldn&apos;t read your Sage accounts: {optsError}. Reconnect Sage.</div>}
        {opts && (
          <ActionForm endpoint={api} action="sage-mapping" className="stack" okText="Saved">
            <div className="two">
              {SAGE_FIELDS.map(([k, label, list]) => (
                <label key={k} className="field">{label}
                  <select name={k} defaultValue={sc[k] ?? ""}>
                    <option value="">Choose…</option>
                    {opts[list].map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <button className="btn sm" style={{ alignSelf: "flex-start" }}>Save mapping</button>
          </ActionForm>
        )}
        {st.sage?.hasSecret && sageMapped(sc) && (
          <ActionForm endpoint={api} action="sage-sync" className="row wrap" okText="Done">
            <input name="date" type="date" className="field-input" style={{ width: 170, textAlign: "left" }} />
            <button className="btn sm ghost">Post a day now</button>
            <span className="muted small">Leave the date empty for yesterday. Each day is posted once.</span>
          </ActionForm>
        )}
        {sageLog.length > 0 && <table><tbody>{sageLog.map((h) => <tr key={h.id}><td>{h.businessDate}</td><td>{chip(h.status)}</td><td className="small muted">{h.error ?? ""}</td></tr>)}</tbody></table>}
      </section>

      <section className="panel stack">
        <div className="row wrap"><h3>Payroll</h3>{st.payroll ? <span className="chip ok">{pc.mode === "webhook" ? "Pushed automatically" : `Emailed to ${pc.email}`}</span> : <span className="chip plain">Not set up</span>}</div>
        <p className="muted small" style={{ margin: 0 }}>
          When a pay period ends, the hours, Sunday hours, pay and tips share from clock-ins are sent automatically, the morning after. BrightPay, Thesaurus Payroll Manager and Sage 50 Payroll don&apos;t take live connections, so most venues send the import file to whoever runs payroll (you, a bureau or your accountant). Payroll systems or middleware with an API can take a signed push instead. PPS numbers are never sent.
        </p>
        <SecretForm endpoint={api} action="payroll" button={st.payroll ? "Save" : "Set up"}>
          <div className="two">
            <label className="field">Send by
              <select name="mode" defaultValue={pc.mode ?? "email"}><option value="email">Email the import file</option><option value="webhook">Push to an API (signed JSON)</option></select>
            </label>
            <label className="field">File layout
              <select name="format" defaultValue={pc.format ?? "brightpay"}>{(Object.entries(PAYROLL_FORMATS) as [string, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
            <label className="field">Payroll email (for email)<input name="email" type="email" defaultValue={pc.email ?? ""} placeholder="payroll@youraccountant.ie" /></label>
            <label className="field">API address (for push, https)<input name="url" defaultValue={pc.url ?? ""} placeholder="https://…" /></label>
            <label className="field">Pay period
              <select name="frequency" defaultValue={pc.frequency ?? "weekly"}><option value="weekly">Weekly (Monday to Sunday)</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select>
            </label>
            <label className="field">Fortnight starts on (a Monday)<input name="anchor" type="date" defaultValue={pc.anchor ?? ""} /></label>
          </div>
        </SecretForm>
        {pc.mode === "webhook" && <span className="muted small">Each push is JSON (employees with payroll ref, hours, Sunday hours, rate, gross and tips in cents, plus the CSV), with headers <code>X-Complete-Signature: sha256=&lt;HMAC of the body&gt;</code> and <code>Idempotency-Key</code>. Saving creates a new secret.</span>}
        {st.payroll && (
          <ActionForm endpoint={api} action="payroll-send" className="row wrap" okText="Sent" confirmText="Send the last pay period now?">
            <button className="btn sm ghost">Send the last pay period now</button>
          </ActionForm>
        )}
        {payLog.length > 0 && <table><tbody>{payLog.map((h) => <tr key={h.id}><td>Period from {h.businessDate}</td><td>{chip(h.status)}</td><td className="small muted">{h.error ?? h.invoiceId ?? ""}</td></tr>)}</tbody></table>}
      </section>

      <section className="panel stack">
        <div className="row wrap"><h3>Deel</h3>{st.deel?.hasSecret ? <span className="chip ok">Connected{dc.env === "sandbox" ? " (sandbox)" : ""}</span> : <span className="chip plain">Not connected</span>}</div>
        <p className="muted small" style={{ margin: 0 }}>
          For staff paid through Deel. When a pay period ends, each person&apos;s hours go to Deel the morning after: hourly contractors as a timesheet, payroll and employer-of-record staff as a pay adjustment (gross pay for the hours, at their rate with the Sunday premium) plus their tips share. Staff are matched to Deel contracts by email, or by their Complete ID as the contract&apos;s external ID, or by hand below.
        </p>
        <ActionForm endpoint={api} action="deel" className="stack" okText="Saved">
          <div className="two">
            <label className="field">Organisation API token {st.deel?.hasSecret && <span className="muted small">(saved; paste a new one to replace it)</span>}<input name="token" type="password" autoComplete="off" placeholder="From Deel: More, Developer, Access tokens" /></label>
            <label className="field">Account
              <select name="env" defaultValue={dc.env ?? "production"}><option value="production">Live Deel account</option><option value="sandbox">Deel sandbox (testing)</option></select>
            </label>
            <label className="field">Pay period
              <select name="frequency" defaultValue={dc.frequency ?? "weekly"}><option value="weekly">Weekly (Monday to Sunday)</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option></select>
            </label>
            <label className="field">Fortnight starts on (a Monday)<input name="anchor" type="date" defaultValue={dc.anchor ?? ""} /></label>
            {deel && (
              <>
                <label className="field">Pay category for hours (payroll staff)
                  <select name="payCategoryId" defaultValue={dc.payCategoryId ?? ""}><option value="">Choose…</option>{deel.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </label>
                <label className="field">Category for tips (optional)
                  <select name="tipsCategoryId" defaultValue={dc.tipsCategoryId ?? ""}><option value="">Don&apos;t send tips</option>{deel.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                </label>
              </>
            )}
          </div>
          {deel && (
            <table>
              <thead><tr><th>Staff</th><th>Deel contract</th></tr></thead>
              <tbody>
                {team.map((x) => (
                  <tr key={x.id}>
                    <td>{x.name}<div className="muted small">{x.email}</div></td>
                    <td>
                      <select name={`contract:${x.id}`} defaultValue={deel.matched[x.id]?.id ?? ""}>
                        <option value="">Not paid through Deel</option>
                        {deel.contracts.map((c) => <option key={c.id} value={c.id}>{c.name || c.email || c.id} · {c.title || c.type}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <button className="btn sm" style={{ alignSelf: "flex-start" }}>{st.deel?.hasSecret ? "Save" : "Connect Deel"}</button>
        </ActionForm>
        {deelError && <div className="error">Couldn&apos;t read your Deel account: {deelError}. Check the token and account.</div>}
        {st.deel?.hasSecret && (
          <ActionForm endpoint={api} action="deel-send" className="row wrap" okText="Sent" confirmText="Send the last pay period to Deel now?">
            <button className="btn sm ghost">Send the last pay period now</button>
          </ActionForm>
        )}
        {deelLog.length > 0 && <table><tbody>{deelLog.map((h) => <tr key={h.id}><td>Period from {h.businessDate}</td><td>{chip(h.status)}</td><td className="small muted">{h.error ?? h.invoiceId ?? ""}</td></tr>)}</tbody></table>}
      </section>

      <section className="panel stack">
        <div className="row wrap"><h3>Bizimply</h3>{st.bizimply ? <span className="chip ok">Uploading daily</span> : <span className="chip plain">Not set up</span>}</div>
        <p className="muted small" style={{ margin: 0 }}>
          If your rota and clock-ins are in Bizimply, send it your sales so it shows labour cost against takings. Bizimply has no open API: it collects a sales file from an SFTP folder at 6.30am. Complete uploads yesterday&apos;s sales (all app, till and delivery sales after refunds; net is ex VAT; tips left out) at 4.35am. Ask your Bizimply Customer Success manager for an SFTP folder and set up a recurring Sales Import in Bizimply (Settings, Company Settings, SFTP). Download Bizimply&apos;s Sample File and copy its column headings below if they differ.
        </p>
        <SecretForm endpoint={api} action="bizimply" button={st.bizimply ? "Save" : "Set up"}>
          <div className="two">
            <label className="field">SFTP server<input name="host" defaultValue={bc.host ?? ""} placeholder="sftp.example.com" /></label>
            <label className="field">Port<input name="port" type="number" defaultValue={bc.port ?? 22} /></label>
            <label className="field">Username<input name="username" defaultValue={bc.username ?? ""} autoComplete="off" /></label>
            <label className="field">Password {st.bizimply && <span className="muted small">(saved; type to replace)</span>}<input name="password" type="password" autoComplete="off" /></label>
            <label className="field">Folder<input name="dir" defaultValue={bc.dir ?? ""} placeholder="/sales" /></label>
            <label className="field">Location name in Bizimply (exactly)<input name="location" defaultValue={bc.location ?? venue.name} /></label>
          </div>
          <label className="field">Column headings (5, comma separated: location, date, net, gross, transactions)<input name="headings" defaultValue={(bc.headings ?? [...BIZIMPLY_DEFAULT_HEADINGS]).join(", ")} /></label>
        </SecretForm>
        <div className="row wrap">
          <a className="btn sm ghost" href={`${api}?bizimply=${yday}`}>Download yesterday&apos;s file</a>
          {st.bizimply && (
            <ActionForm endpoint={api} action="bizimply-send" className="row wrap" okText="Uploaded">
              <input name="date" type="date" className="field-input" style={{ width: 170, textAlign: "left" }} />
              <button className="btn sm ghost">Upload a day now</button>
            </ActionForm>
          )}
        </div>
        {bizLog.length > 0 && <table><tbody>{bizLog.map((h) => <tr key={h.id}><td>{h.businessDate}</td><td>{chip(h.status)}</td><td className="small muted">{h.error ?? h.invoiceId ?? ""}</td></tr>)}</tbody></table>}
      </section>

      <ConnectSections venue={venue} api={api} />

      <ActionForm endpoint={api} action="bookings" className="panel stack">
        <h3>Table bookings</h3>
        <p className="muted small" style={{ margin: 0 }}>Guests book from your app and from games and events in What&apos;s on. Staff see them on the Bookings screen.</p>
        <label className="field" style={{ maxWidth: 260 }}>Seats bookable per half hour (0 = off)<input name="seats" type="number" min={0} max={2000} defaultValue={venue.bookingSeatsPerSlot} /></label>
        <button className="btn sm" style={{ alignSelf: "flex-start" }}>Save</button>
      </ActionForm>

      <section className="panel stack">
        <div className="row wrap"><h3>Delivery platforms</h3>{st.delivery?.hasSecret ? <span className="chip ok">Connected</span> : <span className="chip plain">Not set up</span>}</div>
        <p className="muted small" style={{ margin: 0 }}>
          Deliveroo, Just Eat and Uber Eats orders arrive on your bar and kitchen screens and take stock out, with no extra tablets. Connect through an aggregator such as Deliverect (one connection covers every platform), or a platform&apos;s own API. Give them this address and secret:
        </p>
        <div className="token">{appUrl()}/api/integrations/delivery/{slug}</div>
        <span className="muted small">Each order: <code>{`{ "platform": "deliveroo", "orderId": "…", "items": [{ "plu": "…", "name": "Pint of stout", "qty": 2 }] }`}</code>, signed with header <code>X-Complete-Signature: sha256=&lt;HMAC of the body&gt;</code>. Items match your menu by PLU (the external ID) or name.</span>
        <SecretForm endpoint={api} action="delivery" button={st.delivery?.hasSecret ? "Replace secret" : "Create secret"} />
      </section>

      {venue.kind === "hotel" && (
        <section className="panel stack">
          <div className="row wrap"><h3>Hotel system: charge to room</h3>{st.pms ? <span className="chip ok">{pmsUrl ? "Posting automatically" : "Reception posts charges"}</span> : <span className="chip plain">Not set up</span>}</div>
          <p className="muted small" style={{ margin: 0 }}>
            Staff choose Room on the till and enter the room number. Each charge is sent, signed, to your hotel system or its middleware (Mews, Opera Cloud, Cloudbeds). Without an address, charges are listed on the end-of-day report for reception to post.
          </p>
          <SecretForm endpoint={api} action="pms" button="Save">
            <label className="field">Address to post room charges to (https)<input name="url" defaultValue={pmsUrl} placeholder="https://…" /></label>
          </SecretForm>
        </section>
      )}

      <ActionForm endpoint={api} action="brands" className="panel stack">
        <h3>Drinks brands</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Share anonymised sales (units of each drink, combined with at least two other venues so nobody can single you out, never anything about guests) with drinks brands and wholesalers. It funds promotions and better trade terms for venues on Complete.
        </p>
        <label className="toggle"><input type="checkbox" name="on" defaultChecked={venue.shareBrandInsights} /> Share anonymised sales</label>
        <button className="btn sm" style={{ alignSelf: "flex-start" }}>Save</button>
      </ActionForm>

      <section className="panel stack">
        <h3>Also connected</h3>
        <table><tbody>
          <tr><td>myPOS (payments and the till terminal)</td><td className="r"><a href={`/office/${slug}/settings`}>Settings</a></td></tr>
          <tr><td>Xero (accounts, every night)</td><td className="r"><a href={`/office/${slug}/settings`}>Settings</a></td></tr>
          <tr><td>Google reviews</td><td className="r"><a href={`/office/${slug}/settings`}>Settings</a></td></tr>
          <tr><td>Ireland&apos;s top games (TheSportsDB)</td><td className="r">{process.env.SPORTSDB_KEY ? "Full fixture list" : "Free feed"}</td></tr>
          <tr><td>Payroll files to download (BrightPay, Thesaurus, Sage)</td><td className="r"><a href={`/office/${slug}/payroll`}>Payroll</a></td></tr>
          <tr><td>Fantasy Premier League</td><td className="r"><a href={`/office/${slug}/events`}>What&apos;s on</a></td></tr>
        </tbody></table>
      </section>
    </div>
  );
}
