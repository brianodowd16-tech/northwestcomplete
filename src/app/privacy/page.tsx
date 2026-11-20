import type { Metadata } from "next";
import { STORE } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="wrap prose" style={{ maxWidth: 760, padding: "48px var(--gutter) 72px" }}>
      <h1>Privacy</h1>
      <p>When you order, we collect your name, contact details and address so we can process and fulfil your order. We keep order records as required for accounting and tax purposes.</p>
      <p>Card payments are handled by myPOS, who receive your payment details directly on their secure payment page. We don't see or store your card number.</p>
      <p>Your basket is stored in your own browser so it's still there when you come back. We don't use advertising cookies.</p>
      <p>We never sell your data. To see, correct or delete the information we hold about you, contact {STORE.email} or call {STORE.phone}.</p>
    </div>
  );
}
