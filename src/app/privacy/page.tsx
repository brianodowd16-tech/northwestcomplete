import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacy Policy" />
      <article className="prose-legal mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="rounded-md bg-brass-400/20 p-4 text-sm">
          Template policy — please review for GDPR compliance before launch.
        </p>
        <h2>Who we are</h2>
        <p>{site.name} is the data controller for personal data collected through {site.domain}. Contact {site.email} with any privacy question.</p>
        <h2>What we collect</h2>
        <ul>
          <li>Details you give us in enquiry forms: name, email, phone, boat details and your message.</li>
          <li>Order details: name, email, phone, billing and delivery address, and what you bought. Card payments are handled by Stripe.</li>
          <li>Your basket is stored in your own browser (local storage) — it isn&apos;t sent to us until you check out.</li>
        </ul>
        <h2>Why we use it</h2>
        <p>To respond to enquiries, deliver services and products you have paid for, and meet our legal and tax obligations. We do not sell your data or use it for marketing without your consent.</p>
        <h2>Who we share it with</h2>
        <ul>
          <li>Stripe (payment processing)</li>
          <li>Our email provider (to deliver enquiry and order notifications)</li>
          <li>Couriers, for shop deliveries</li>
        </ul>
        <h2>How long we keep it</h2>
        <p>Enquiries are kept for up to 2 years. Order and invoice records are kept for 6 years as required by Irish Revenue.</p>
        <h2>Your rights</h2>
        <p>You can request access to, correction or deletion of your data, or object to its processing, by emailing us. You can also complain to the Data Protection Commission (dataprotection.ie).</p>
      </article>
    </>
  );
}
