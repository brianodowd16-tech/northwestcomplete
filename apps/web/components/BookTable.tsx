"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "./Toasts";

/** Slots are offered in the venue's time; `slots` are ISO instants with their local label. */
export function BookTable({ slug, days, event, signedIn }: { slug: string; days: { label: string; slots: { iso: string; label: string }[] }[]; event: { key: string; title: string; iso: string } | null; signedIn: boolean }) {
  const router = useRouter();
  const [day, setDay] = useState(() => (event ? Math.max(0, days.findIndex((d) => d.slots.some((s) => s.iso === event.iso))) : 0));
  const [slot, setSlot] = useState(event?.iso ?? "");
  const [party, setParty] = useState(2);
  const [busy, setBusy] = useState(false);
  if (!signedIn)
    return (
      <a className="btn block" href={`/v/${slug}/login?next=${encodeURIComponent(`/v/${slug}/book`)}`}>
        Sign in to book
      </a>
    );
  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!slot) return toast("Choose a time", { kind: "err" });
        setBusy(true);
        const res = await fetch(`/api/v/${slug}/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startsAt: slot, partySize: party, note: new FormData(e.currentTarget).get("note"), eventKey: event?.key, eventTitle: event?.title }),
        });
        const d = await res.json();
        setBusy(false);
        if (!res.ok) return toast(d.error, { kind: "err" });
        toast("Booked! See you then.", { kind: "ok" });
        router.refresh();
      }}
    >
      {event && <div className="notice">For {event.title}</div>}
      <label className="field">
        How many
        <select value={party} onChange={(e) => setParty(Number(e.target.value))}>
          {Array.from({ length: 20 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {i + 1} {i ? "people" : "person"}
            </option>
          ))}
        </select>
      </label>
      <div className="chips2">
        {days.map((d, i) => (
          <button type="button" key={d.label} className="chipbtn" aria-current={day === i ? "page" : undefined} onClick={() => setDay(i)}>
            {d.label}
          </button>
        ))}
      </div>
      <div className="slots">
        {days[day]?.slots.map((s) => (
          <button type="button" key={s.iso} className={`slot ${slot === s.iso ? "on" : ""}`} onClick={() => setSlot(s.iso)}>
            {s.label}
          </button>
        ))}
      </div>
      <label className="field">
        Anything we should know? (optional)
        <input name="note" maxLength={200} placeholder="Birthday, high chair, near the screen…" />
      </label>
      <button className="btn block" disabled={busy || !slot}>
        {busy ? "Booking…" : "Book a table"}
      </button>
    </form>
  );
}

export function CancelBooking({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  return (
    <button
      className="btn sm ghost"
      onClick={async () => {
        if (!confirm("Cancel this booking?")) return;
        const res = await fetch(`/api/v/${slug}/bookings?id=${id}`, { method: "DELETE" });
        if (!res.ok) return toast("Couldn't cancel", { kind: "err" });
        toast("Booking cancelled");
        router.refresh();
      }}
    >
      Cancel
    </button>
  );
}
