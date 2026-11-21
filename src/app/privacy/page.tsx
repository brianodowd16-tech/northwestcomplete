import type { Metadata } from "next";
import { STORE } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="wrap prose" style={{ maxWidth: 780, paddingBlock: "48px 96px" }}>
      <h1>Privacy</h1>
      <h2>Orders</h2>
      <p>When you order, we collect your name, contact details and billing address so we can process your order and arrange collection. We keep order records as required for accounting and tax purposes.</p>
      <p>Card payments are handled by myPOS, who receive your payment details directly on their secure payment page. We don&apos;t see or store your card number.</p>
      <h2>Consultations and enquiries</h2>
      <p>When you request a consultation or send a message, we receive your name, email, location and the answers you gave, and use them only to respond to you.</p>
      <p>Questions typed into the online consultation assistant are processed by our AI provider, Anthropic, to generate an answer. Please don&apos;t include sensitive personal information in your questions.</p>
      <h2>Your browser</h2>
      <p>Your basket is stored in your own browser so it&apos;s still there when you come back. We don&apos;t use advertising cookies.</p>
      <h2>Your rights</h2>
      <p>We never sell your data. To see, correct or delete the information we hold about you, email {STORE.email}.</p>
    </div>
  );
}
