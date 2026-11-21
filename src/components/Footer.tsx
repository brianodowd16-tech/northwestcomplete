import Link from "next/link";
import { STORE } from "@/lib/config";
import { RANGE_CATEGORIES } from "@/lib/content";

export function Footer() {
  const a = STORE.address;
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__top">
          <div className="footer__brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo-mark" src={STORE.logo} alt={STORE.name} width={150} height={77} loading="lazy" />
            <p>Fireplaces, stoves, gas and electric fires from Europe's leading makers, chosen with care in our Carrick-on-Shannon showroom since {STORE.since}.</p>
            <p>
              {a.street}, {a.town}, {a.county} {a.eircode}
              <br />
              <a href={`mailto:${STORE.email}`}>{STORE.email}</a>
            </p>
          </div>
          <div>
            <h4>The Range</h4>
            <ul>
              {RANGE_CATEGORIES.slice(0, 6).map((c) => (
                <li key={c.slug}><Link href={`/range/${c.slug}`}>{c.name}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Shop</h4>
            <ul>
              <li><Link href="/shop">Special offers</Link></li>
              <li><Link href="/#consultation">Book a consultation</Link></li>
              <li><Link href="/servicing">Servicing &amp; parts</Link></li>
              <li><Link href="/cart">Your basket</Link></li>
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><Link href="/about">About us</Link></li>
              <li><Link href="/contact">Visit the showroom</Link></li>
              <li><Link href="/terms">Terms &amp; returns</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer__base">
          <span>© {new Date().getFullYear()} {STORE.name}. All rights reserved.</span>
          <span>Secure card payments by myPOS · Prices include VAT</span>
        </div>
      </div>
    </footer>
  );
}
