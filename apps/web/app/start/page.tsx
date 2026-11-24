import type { Metadata } from "next";
import Link from "next/link";
import { BusinessSignup } from "@/components/BusinessSignup";

export const metadata: Metadata = { title: "Start your free trial · Complete" };

export default function Start() {
  return (
    <div className="page stack" style={{ maxWidth: 560 }}>
      <Link href="/" className="label" style={{ textDecoration: "none" }}>
        Complete
      </Link>
      <div className="stack" style={{ gap: 6 }}>
        <h1 style={{ fontSize: 32 }}>Table ordering and loyalty for your venue</h1>
        <p className="muted" style={{ margin: 0 }}>
          Set up in minutes. Free for 30 days, no card needed. Guests pay you straight into your own myPOS account.
        </p>
      </div>
      <BusinessSignup />
      <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Your venue starts in test mode. Try ordering yourself before guests do.</li>
        <li>After the trial: €99 a month plus 1% of app payments. Cancel any time.</li>
        <li>Your data stays in the EU.</li>
      </ul>
    </div>
  );
}
