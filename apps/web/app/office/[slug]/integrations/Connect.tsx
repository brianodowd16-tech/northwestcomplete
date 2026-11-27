import { connectionStatus } from "@round/db/connect";
import { syncHistory, type SyncTarget } from "@round/db/integrations";
import type { Venue } from "@round/db/services";
import { ActionForm } from "@/components/ActionForm";
import { SecretForm } from "@/components/SecretForm";
import { appUrl, secretsKey } from "@/lib/server";

const saved = (has: string[] | undefined, k: string) => (has?.includes(k) ? <span className="muted small"> (saved; type to replace)</span> : null);

async function log(venue: Venue, target: SyncTarget) {
  const rows = (await syncHistory(venue, target)).sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 5);
  if (!rows.length) return null;
  return <table><tbody>{rows.map((h) => <tr key={h.id}><td>{h.businessDate}</td><td><span className={`chip ${h.status === "done" ? "ok" : h.status === "error" ? "warn" : "plain"}`}>{h.status === "done" ? "OK" : h.status === "nothing" ? "Nothing new" : "Problem"}</span></td><td className="small muted">{h.error ?? h.invoiceId ?? ""}</td></tr>)}</tbody></table>;
}

/** WooCommerce, Trybe, Mews, Revolut Business and myPOS reports. Keys are stored encrypted and never shown again. */
export async function ConnectSections({ venue, api }: { venue: Venue; api: string }) {
  const st = await connectionStatus(venue, secretsKey());
  const woo = st.woocommerce, trybe = st.trybe, mews = st.mews, rb = st.revolut_business, mp = st.mypos_reports;
  const cfg = <T,>(x: { config: Record<string, unknown> } | undefined) => (x?.config ?? {}) as Partial<T>;
  const wc = cfg<{ store: string }>(woo), tc = cfg<{ siteId: string; playground: boolean }>(trybe), mc = cfg<{ platform: string; serviceId: string; taxCodes: { "9": string; "23": string }; accountingCategoryId: string }>(mews);
  const rc = cfg<{ env: string; clientId: string; issuer: string; maxFeePct: number }>(rb), pc = cfg<{ env: string }>(mp);
  const on = (x: unknown, label: string) => (x ? <span className="chip ok">{label}</span> : <span className="chip plain">Not set up</span>);
  return (
    <>
      <section className="panel stack">
        <div className="row wrap"><h3>WooCommerce shop</h3>{on(woo, "Connected")}</div>
        <p className="muted small" style={{ margin: 0 }}>
          Orders from your website shop come in live: items that are on your menu (matched by SKU = the item&apos;s external ID, or by name) go to the bar and kitchen screens, take stock out and count in the day&apos;s sales. Vouchers and merchandise stay in WooCommerce. In WooCommerce, Settings, Advanced: create a REST API key (Read) and a webhook (topic Order updated, API version 3) to this address, with a secret you choose:
        </p>
        <div className="token">{appUrl()}/api/integrations/woocommerce/{venue.slug}</div>
        <SecretForm endpoint={api} action="woocommerce" button={woo ? "Save" : "Connect shop"}>
          <div className="two">
            <label className="field">Shop address<input name="store" defaultValue={wc.store ?? ""} placeholder="https://yourpub.ie" /></label>
            <label className="field">Webhook secret{saved(woo?.has, "webhookSecret")}<input name="webhookSecret" type="password" autoComplete="off" /></label>
            <label className="field">Consumer key{saved(woo?.has, "consumerKey")}<input name="consumerKey" autoComplete="off" placeholder="ck_…" /></label>
            <label className="field">Consumer secret{saved(woo?.has, "consumerSecret")}<input name="consumerSecret" type="password" autoComplete="off" placeholder="cs_…" /></label>
          </div>
        </SecretForm>
        {woo && <ActionForm endpoint={api} action="woo-sync" className="row" okText="Done"><button className="btn sm ghost">Fetch the last two days now</button></ActionForm>}
        {await log(venue, "woocommerce")}
      </section>

      <section className="panel stack">
        <div className="row wrap"><h3>Trybe spa and activities</h3>{on(trybe, "Connected")}</div>
        <p className="muted small" style={{ margin: 0 }}>
          Spa, hot tub and activity bookings made in Trybe show on your Bookings screen, and in each guest&apos;s own Complete app (matched by email). Ask your Trybe onboarding manager for an API token, then in Trybe, Settings, Integrations, Webhooks, add this address with a secret and the basket events:
        </p>
        <div className="token">{appUrl()}/api/integrations/trybe/{venue.slug}</div>
        <SecretForm endpoint={api} action="trybe" button={trybe ? "Save" : "Connect Trybe"}>
          <div className="two">
            <label className="field">Trybe site ID<input name="siteId" defaultValue={tc.siteId ?? ""} /></label>
            <label className="field">API token{saved(trybe?.has, "token")}<input name="token" type="password" autoComplete="off" /></label>
            <label className="field">Webhook secret{saved(trybe?.has, "webhookSecret")}<input name="webhookSecret" type="password" autoComplete="off" /></label>
            <label className="toggle small" style={{ alignSelf: "end" }}><input type="checkbox" name="playground" defaultChecked={!!tc.playground} /> Trybe playground (testing)</label>
          </div>
        </SecretForm>
        {trybe && <ActionForm endpoint={api} action="trybe-sync" className="row" okText="Done"><button className="btn sm ghost">Refresh bookings now</button></ActionForm>}
        {await log(venue, "trybe")}
      </section>

      {venue.kind === "hotel" && (
        <section className="panel stack">
          <div className="row wrap"><h3>Mews: charge to room</h3>{on(mews, mc.platform === "production" ? "Live" : "Demo")}</div>
          <p className="muted small" style={{ margin: 0 }}>
            Room charges from the till go straight to the guest&apos;s bill in Mews: Complete finds who is checked in to the room and adds each item with its VAT. If nobody is checked in, managers get an alert to post it by hand. Use the Mews demo first. Your Mews admin gives you the access token; the tax codes come from your Mews tax environment.
          </p>
          <SecretForm endpoint={api} action="mews" button={mews ? "Save" : "Connect Mews"}>
            <div className="two">
              <label className="field">Environment<select name="platform" defaultValue={mc.platform ?? "demo"}><option value="demo">Demo</option><option value="production">Live</option></select></label>
              <label className="field">Bar/restaurant service ID<input name="serviceId" defaultValue={mc.serviceId ?? ""} /></label>
              <label className="field">Client token{saved(mews?.has, "clientToken")}<input name="clientToken" type="password" autoComplete="off" /></label>
              <label className="field">Access token{saved(mews?.has, "accessToken")}<input name="accessToken" type="password" autoComplete="off" /></label>
              <label className="field">Tax code for 9% (food)<input name="tax9" defaultValue={mc.taxCodes?.["9"] ?? ""} /></label>
              <label className="field">Tax code for 23% (drinks)<input name="tax23" defaultValue={mc.taxCodes?.["23"] ?? ""} /></label>
              <label className="field">Accounting category ID (optional)<input name="accountingCategoryId" defaultValue={mc.accountingCategoryId ?? ""} /></label>
            </div>
          </SecretForm>
          {await log(venue, "mews")}
        </section>
      )}

      <section className="panel stack">
        <div className="row wrap"><h3>Money checks: myPOS and Revolut Business</h3>{on(mp || rb, [mp && "myPOS", rb && "Revolut Business"].filter(Boolean).join(" + "))}</div>
        <p className="muted small" style={{ margin: 0 }}>
          Every morning Complete checks yesterday&apos;s card takings against myPOS&apos;s own transaction report, and that each day&apos;s card money actually landed in your Revolut Business account (allowing for fees, within 4 days). Anything that doesn&apos;t add up becomes an alert for managers. Read-only: Complete never moves money.
        </p>
        <SecretForm endpoint={api} action="mypos-reports" button={mp ? "Save myPOS" : "Connect myPOS reports"}>
          <div className="two">
            <label className="field">Environment<select name="env" defaultValue={pc.env ?? "sandbox"}><option value="sandbox">Sandbox</option><option value="production">Live</option></select></label>
            <label className="field">API key{saved(mp?.has, "apiKey")}<input name="apiKey" type="password" autoComplete="off" /></label>
            <label className="field">Client ID{saved(mp?.has, "clientId")}<input name="clientId" autoComplete="off" /></label>
            <label className="field">Client secret{saved(mp?.has, "clientSecret")}<input name="clientSecret" type="password" autoComplete="off" /></label>
          </div>
          <span className="muted small">From your myPOS account: Settings, API keys (Transactions API).</span>
        </SecretForm>
        <SecretForm endpoint={api} action="revolut-business" button={rb ? "Save Revolut Business" : "Connect Revolut Business"}>
          <div className="two">
            <label className="field">Environment<select name="env" defaultValue={rc.env ?? "sandbox"}><option value="sandbox">Sandbox</option><option value="production">Live</option></select></label>
            <label className="field">Client ID<input name="clientId" defaultValue={rc.clientId ?? ""} autoComplete="off" /></label>
            <label className="field">Domain you registered (JWT issuer)<input name="issuer" defaultValue={rc.issuer ?? ""} placeholder="complete.pub" /></label>
            <label className="field">Fees allowed on payouts (%)<input name="maxFeePct" type="number" step="0.1" min={0} max={10} defaultValue={rc.maxFeePct ?? 3} /></label>
            <label className="field">Refresh token{saved(rb?.has, "refreshToken")}<input name="refreshToken" type="password" autoComplete="off" /></label>
          </div>
          <label className="field">Private key (PEM){saved(rb?.has, "privateKey")}<textarea name="privateKey" rows={3} autoComplete="off" placeholder="-----BEGIN PRIVATE KEY-----" /></label>
          <span className="muted small">In Revolut Business: Settings, APIs, Business API: upload the matching public certificate, add the redirect domain, and authorise read access to get the refresh token.</span>
        </SecretForm>
        {(mp || rb) && <ActionForm endpoint={api} action="money-check" className="row" okText="Checked"><button className="btn sm ghost">Check now</button></ActionForm>}
        {mp && (await log(venue, "mypos"))}
        {rb && (await log(venue, "revolut_business"))}
      </section>
    </>
  );
}
