import type { Metadata } from "next";
import { STORE } from "@/lib/config";

export const metadata: Metadata = { title: "Terms, Delivery & Returns" };

export default function TermsPage() {
  return (
    <div className="wrap prose" style={{ maxWidth: 760, padding: "48px var(--gutter) 72px" }}>
      <h1>Terms, delivery &amp; returns</h1>
      <h2>Ordering and payment</h2>
      <p>Prices are in euro and include VAT. Card payments are processed securely by myPOS. We never see or store your card details. Your order is confirmed once payment is approved.</p>
      <h2>Collection</h2>
      <p>Click &amp; Collect is free. We'll call you when your order is ready to collect from {STORE.address.street}, {STORE.address.town}.</p>
      <h2>Delivery</h2>
      <p>For delivery orders we'll contact you to agree a date and any delivery charge before dispatch. If you'd rather not go ahead at that point, we'll refund you in full.</p>
      <h2>Cancellations and returns</h2>
      <p>Under Irish consumer law you can cancel an online order within 14 days of receiving the goods, without giving a reason. Contact us to arrange the return. Items must be unused and in their original packaging. Refunds are made to the original card within 14 days of receiving the goods back. This doesn't affect your statutory rights for faulty goods.</p>
      <h2>Special offers</h2>
      <p>Special offer items may be ex-display. Where that's the case, the product page will say so. Offers are available while stocks last.</p>
      <h2>Contact</h2>
      <p>{STORE.name}, {STORE.address.street}, {STORE.address.town}, {STORE.address.county}, {STORE.address.eircode}. Phone {STORE.phone}, email {STORE.email}.</p>
    </div>
  );
}
