import Link from "next/link";
import { STORE } from "@/lib/config";

export function Enquire({ subject }: { subject: string }) {
  return (
    <div className="cta-band">
      <div>
        <h2>Interested in {subject}?</h2>
        <p>Prices depend on model, finish and installation. Start a consultation and our team will advise on the right option for your home.</p>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link className="btn btn--primary" href="/#consultation">Start a consultation</Link>
        <a className="btn btn--outline-light" href={`mailto:${STORE.email}?subject=${encodeURIComponent(`Enquiry: ${subject}`)}`}>Email the team</a>
      </div>
    </div>
  );
}
