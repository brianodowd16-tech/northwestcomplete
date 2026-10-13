import type { Metadata } from "next";
import { PageHeader } from "@/components/PageHeader";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Terms & Conditions" };

export default function TermsPage() {
  return (
    <>
      <PageHeader title="Terms & Conditions" />
      <article className="prose-legal mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <p className="rounded-md bg-brass-400/20 p-4 text-sm">
          Template terms — please have these reviewed by a solicitor before launch.
        </p>
        <h2>1. About us</h2>
        <p>This website is operated by {site.name} ({site.domain}), based in the North West of Ireland. Contact: {site.email}.</p>
        <h2>2. Prices & payment</h2>
        <p>All prices are in euro and include VAT at the applicable Irish rate. Payments are processed securely by Stripe; we never see or store your full card details.</p>
        <h2>3. Services & bookings</h2>
        <ul>
          <li>Online service purchases and deposits secure a booking. We will contact you within one working day to agree a date.</li>
          <li>Per-foot pricing is based on the overall boat length you provide. If the actual length differs, we will adjust the price before starting work.</li>
          <li>Parts and materials are extra unless stated. Any additional work found during a job will be quoted and agreed before we proceed.</li>
          <li>You may cancel a service booking for a full refund up to 48 hours before the agreed date. Deposits for bespoke work (including ordered components) are refundable less any costs already incurred.</li>
          <li>Inspection fees are deducted from the final invoice if you proceed with the quoted work.</li>
        </ul>
        <h2>4. Shop orders, delivery & returns</h2>
        <ul>
          <li>We deliver to the Republic of Ireland and Northern Ireland, usually within 2–4 working days of dispatch.</li>
          <li>Under EU consumer law you may cancel a shop order within 14 days of receipt. Items must be unused and in original packaging. Parts ordered specifically for your engine may be excluded where permitted by law.</li>
          <li>Gift vouchers are valid for two years from purchase and are non-refundable once issued.</li>
        </ul>
        <h2>5. Boat sales</h2>
        <ul>
          <li>Boat listings are provided on behalf of the vendor. Specifications are given in good faith but buyers should satisfy themselves through viewing, sea trial and independent survey.</li>
          <li>Reservation deposits are fully refundable if you decide not to proceed following viewing or survey, unless otherwise agreed in writing.</li>
        </ul>
        <h2>6. Liability</h2>
        <p>Nothing in these terms limits your statutory rights as a consumer under Irish law.</p>
        <h2>7. Governing law</h2>
        <p>These terms are governed by the laws of Ireland.</p>
      </article>
    </>
  );
}
