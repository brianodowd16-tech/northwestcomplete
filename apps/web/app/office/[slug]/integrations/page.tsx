import { integrationStatus } from "@round/db/integrations";
import { ActionForm } from "@/components/ActionForm";
import { SecretForm } from "@/components/SecretForm";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { appUrl, requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function Integrations({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const st = await integrationStatus(venue);
  const api = `/api/office/${slug}/integrations`;
  const pmsUrl = (st.pms?.config as { url?: string } | undefined)?.url ?? "";
  return (
    <div className="page stack" style={{ maxWidth: 900 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="integrations" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Integrations</h1>
      </div>

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
          <tr><td>Payroll (BrightPay, Sage)</td><td className="r"><a href={`/office/${slug}/planner`}>Planner → CSV</a></td></tr>
          <tr><td>Fantasy Premier League</td><td className="r"><a href={`/office/${slug}/events`}>What&apos;s on</a></td></tr>
        </tbody></table>
      </section>
    </div>
  );
}
