"use client";
import { ActionButton } from "./ActionButton";
import { ActionForm } from "./ActionForm";
import { eur } from "./format";

export interface PartyRow { id: string; packageName: string; contactName: string; contactPhone: string; occasion: string; notes: string; guests: number; totalCents: number; depositCents: number; status: string; when: string; source: "app" | "staff" }
export interface PackageRow { id: string; name: string; description: string; pricePerPersonCents: number; minGuests: number; maxGuests: number; depositPerPersonCents: number; vatRate: number; minNoticeDays: number; active: boolean }

const API = "/api/staff/parties";

/** Parties on the staff Bookings screen: confirm/decline requests, take bookings by phone, and (managers) edit packages. */
export function PartyStaff({ parties, packages, admin, today }: { parties: PartyRow[]; packages: PackageRow[]; admin: boolean; today: string }) {
  const active = packages.filter((p) => p.active);
  return (
    <section className="panel stack">
      <div className="row wrap"><h3>🎉 Parties</h3><span className="chip plain">{parties.filter((p) => p.status === "requested").length} to confirm</span></div>
      {parties.length === 0 ? <span className="muted small">No parties in the next 60 days.</span> : (
        <table><tbody>
          {parties.map((b) => (
            <tr key={b.id}>
              <td className="num small">{b.when}</td>
              <td>
                <b>{b.contactName}</b> · {b.guests} people · {b.packageName}
                <div className="muted small">{[b.occasion, b.contactPhone, b.notes, `${eur(b.totalCents)} total`, b.depositCents ? `${eur(b.depositCents)} deposit paid` : b.source === "staff" ? "taken by staff" : "no deposit"].filter(Boolean).join(" · ")}</div>
              </td>
              <td className="r">
                {b.status === "requested" ? (
                  <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <ActionButton url={API} body={{ action: "status", id: b.id, to: "confirmed" }} label="Confirm" />
                    <ActionButton url={API} body={{ action: "status", id: b.id, to: "declined" }} label={b.depositCents ? "Decline & refund" : "Decline"} ghost confirmText="Decline this party? Any deposit is refunded." />
                  </span>
                ) : b.status === "confirmed" ? (
                  <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                    <span className="chip ok">Confirmed</span>
                    <ActionButton url={API} body={{ action: "status", id: b.id, to: "completed" }} label="Done" ghost />
                    <ActionButton url={API} body={{ action: "status", id: b.id, to: "cancelled" }} label="Cancel" ghost confirmText="Cancel this party? Any deposit is refunded." />
                  </span>
                ) : <span className="chip plain">Done</span>}
              </td>
            </tr>
          ))}
        </tbody></table>
      )}
      {active.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer" }}><b>Take a party booking</b> <span className="muted small">(phone or walk-in: confirmed straight away, nothing paid online)</span></summary>
          <ActionForm endpoint={API} action="book" className="stack" okText="Party booked" reset style={{ marginTop: 8 }}>
            <div className="two">
              <label className="field">Package<select name="packageId" required>{active.map((p) => <option key={p.id} value={p.id}>{p.name} · {eur(p.pricePerPersonCents)} pp · min {p.minGuests}</option>)}</select></label>
              <label className="field">People<input name="guests" type="number" min={1} required /></label>
              <label className="field">Date<input name="date" type="date" min={today} required /></label>
              <label className="field">Time<input name="time" type="time" step={1800} defaultValue="19:00" required /></label>
              <label className="field">Name<input name="contactName" required maxLength={80} /></label>
              <label className="field">Phone<input name="contactPhone" type="tel" maxLength={30} /></label>
              <label className="field">Email<input name="contactEmail" type="email" maxLength={200} /></label>
              <label className="field">Occasion<input name="occasion" maxLength={80} /></label>
            </div>
            <label className="field">Notes<input name="notes" maxLength={500} /></label>
            <button className="btn sm" style={{ alignSelf: "flex-start" }}>Book party</button>
          </ActionForm>
        </details>
      )}
      {admin && (
        <details>
          <summary style={{ cursor: "pointer" }}><b>Party packages</b> <span className="muted small">(managers)</span></summary>
          <div className="stack" style={{ marginTop: 8 }}>
            {[...packages, null].map((p) => (
              <ActionForm key={p?.id ?? "new"} endpoint={API} action="package" className="card stack" okText="Package saved" reset={!p}>
                {p && <input type="hidden" name="id" value={p.id} />}
                <b>{p ? p.name : "New package"}</b>
                <div className="two">
                  <label className="field">Name<input name="name" defaultValue={p?.name ?? ""} required maxLength={80} placeholder="Party package" /></label>
                  <label className="field">Price per person (€)<input name="price" inputMode="decimal" defaultValue={p ? (p.pricePerPersonCents / 100).toFixed(2) : ""} required placeholder="30.00" /></label>
                  <label className="field">Minimum people<input name="minGuests" type="number" min={1} defaultValue={p?.minGuests ?? 20} required /></label>
                  <label className="field">Maximum people<input name="maxGuests" type="number" min={1} defaultValue={p?.maxGuests ?? 100} /></label>
                  <label className="field">Deposit per person (€, 0 = none)<input name="deposit" inputMode="decimal" defaultValue={p ? (p.depositPerPersonCents / 100).toFixed(2) : "5.00"} /></label>
                  <label className="field">Book at least (days ahead)<input name="minNoticeDays" type="number" min={0} max={90} defaultValue={p?.minNoticeDays ?? 2} /></label>
                  <label className="field">VAT<select name="vatRate" defaultValue={String(p?.vatRate ?? 9)}><option value="9">9% (mainly food)</option><option value="23">23% (mainly drink)</option></select></label>
                  <label className="toggle small" style={{ alignSelf: "end" }}><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Guests can book it</label>
                </div>
                <label className="field">What&apos;s included<textarea name="description" rows={2} maxLength={600} defaultValue={p?.description ?? ""} /></label>
                <button className="btn sm" style={{ alignSelf: "flex-start" }}>{p ? "Save" : "Add package"}</button>
              </ActionForm>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
