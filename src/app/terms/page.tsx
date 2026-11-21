import type { Metadata } from "next";
import { STORE } from "@/lib/config";

export const metadata: Metadata = { title: "Terms & Returns" };

export default function TermsPage() {
  const a = STORE.address;
  return (
    <div className="wrap prose" style={{ maxWidth: 780, paddingBlock: "48px 96px" }}>
      <h1>Terms &amp; returns</h1>
      <h2>Ordering and payment</h2>
      <p>Prices are in euro and include VAT. Card payments are processed securely by myPOS. We never see or store your card details. Your order is confirmed once payment is approved, and you&apos;ll receive a confirmation email.</p>
      <h2>Click &amp; Collect</h2>
      <p>Online orders are currently available for collection only, free of charge, from our showroom at {a.street}, {a.town}. We&apos;ll email you when your order is ready. Please bring your order confirmation when you collect.</p>
      <h2>Cancellations and returns</h2>
      <p>Under Irish consumer law you can cancel an online order within 14 days of collecting the goods, without giving a reason. Contact us to arrange the return. Items must be unused and in their original packaging. Refunds are made to the original card within 14 days of receiving the goods back. This doesn&apos;t affect your statutory rights for faulty goods.</p>
      <h2>Special offers</h2>
      <p>Special offer items may be ex-display. Where that&apos;s the case, the product page will say so. Offers are available while stocks last.</p>
      <h2>Advice and consultations</h2>
      <p>Guidance from our online consultation is general information to help you plan. Final specifications, including heat output, flue and ventilation requirements, are confirmed by our team and your installer after a survey.</p>
      <h2>Contact</h2>
      <p>{STORE.name}, {a.street}, {a.town}, {a.county}, {a.eircode}. Email {STORE.email}.</p>
    </div>
  );
}
