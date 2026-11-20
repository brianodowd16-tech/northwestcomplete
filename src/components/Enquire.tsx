import { STORE } from "@/lib/config";

export function Enquire({ subject }: { subject: string }) {
  return (
    <div className="panel" style={{ marginTop: 40, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
      <div>
        <h2 style={{ fontSize: "1.4rem", margin: 0 }}>Interested in {subject}?</h2>
        <p className="muted" style={{ margin: 0 }}>Prices depend on finish and installation. Call or email for a quote, or visit the showroom.</p>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <a className="btn btn--primary" href={`tel:${STORE.phoneIntl}`}>Call {STORE.phone}</a>
        <a className="btn btn--ghost" href={`mailto:${STORE.email}?subject=${encodeURIComponent(`Enquiry: ${subject}`)}`}>Email us</a>
      </div>
    </div>
  );
}
