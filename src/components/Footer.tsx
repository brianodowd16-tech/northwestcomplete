import Link from "next/link";
import { STORE } from "@/lib/config";
import { RANGE_CATEGORIES } from "@/lib/content";

export function Footer() {
  const a = STORE.address;
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer__grid">
          <div>
            <h4>{STORE.name}</h4>
            <p>
              {a.street}, {a.town}, {a.county}, {a.eircode}
            </p>
            <p>
              <a href={`tel:${STORE.phoneIntl}`}>{STORE.phone}</a>
              <br />
              <a href={`mailto:${STORE.email}`}>{STORE.email}</a>
            </p>
          </div>
          <div>
            <h4>Shop</h4>
            <ul>
              <li><Link href="/shop">Special offers</Link></li>
              <li><Link href="/cart">Your basket</Link></li>
              <li><Link href="/servicing">Servicing &amp; parts</Link></li>
            </ul>
          </div>
          <div>
            <h4>Our range</h4>
            <ul>
              {RANGE_CATEGORIES.slice(0, 6).map((c) => (
                <li key={c.slug}><Link href={`/range/${c.slug}`}>{c.name}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li><Link href="/about">About us</Link></li>
              <li><Link href="/contact">Contact &amp; directions</Link></li>
              <li><Link href="/terms">Terms, delivery &amp; returns</Link></li>
              <li><Link href="/privacy">Privacy</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer__base">
          <span>© {new Date().getFullYear()} {STORE.name}. Family-run since {STORE.since}.</span>
          <span>Secure card payments by myPOS</span>
        </div>
      </div>
    </footer>
  );
}
