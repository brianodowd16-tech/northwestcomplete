import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-display text-6xl font-extrabold text-navy-200">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold text-navy-900">We couldn&apos;t find that page</h1>
      <p className="mt-2 text-slate-600">It may have sailed. Try one of these instead:</p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/services" className="rounded-md bg-sea-600 px-5 py-2.5 text-sm font-semibold text-white">Services</Link>
        <Link href="/shop" className="rounded-md bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white">Shop</Link>
      </div>
    </div>
  );
}
