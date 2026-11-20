import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap empty">
      <h1>Page not found</h1>
      <p className="lead" style={{ margin: "0 auto 24px" }}>That page may have moved. Try our special offers or browse the range.</p>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        <Link href="/shop" className="btn btn--primary">Special offers</Link>
        <Link href="/range" className="btn btn--ghost">Our range</Link>
      </div>
    </div>
  );
}
