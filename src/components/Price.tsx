import { formatPrice } from "@/lib/money";

export function Price({ now, was, currency = "EUR", large }: { now: number; was?: number; currency?: string; large?: boolean }) {
  const onSale = was !== undefined && was > now;
  return (
    <div className={`price${large ? " price--lg" : ""}`}>
      <span className="price__now">{formatPrice(now, currency)}</span>
      {onSale && (
        <>
          <span className="price__was">
            <span className="sr-only">Was </span>
            {formatPrice(was, currency)}
          </span>
          <span className="price__save">Save {formatPrice(was - now, currency)}</span>
        </>
      )}
    </div>
  );
}
