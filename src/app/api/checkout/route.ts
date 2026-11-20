import { NextResponse } from "next/server";
import { deliveryPrice, getCatalogItem, getCountry } from "@/lib/catalog";
import { sendEmail } from "@/lib/email";
import { buildPurchase, getMyposConfig, sealToken, tokenSecret, type MyposCartItem } from "@/lib/mypos";
import { formatPrice, site } from "@/lib/site";

type Body = {
  lines?: { id: unknown; quantity: unknown }[];
  customer?: Record<string, unknown>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (o: Record<string, unknown> | undefined, k: string, max = 120) =>
  typeof o?.[k] === "string" ? (o[k] as string).trim().slice(0, max) : "";
/** myPOS article names are plain text; keep them short and free of separators. */
const article = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 100);

function orderId() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `NWBM-${t}-${r}`;
}

export async function POST(request: Request) {
  const cfg = getMyposConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: `Online payments are being set up. Please WhatsApp ${site.contactName} on ${site.phone} to complete your order.` },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const c = body.customer;
  const customer = {
    firstNames: str(c, "firstName", 60),
    familyName: str(c, "lastName", 60),
    email: str(c, "email", 120),
    phone: str(c, "phone", 30),
    address: str(c, "address", 160),
    city: str(c, "city", 60),
    zip: str(c, "zip", 20),
  };
  const country = getCountry(str(c, "country", 4));
  const method = str(c, "delivery", 10) === "collect" ? "collect" : "delivery";
  const boat = str(c, "boat", 120);
  const location = str(c, "location", 120);
  const notes = str(c, "notes", 500);

  if (!customer.firstNames || !customer.familyName || !EMAIL_RE.test(customer.email) || !country) {
    return NextResponse.json({ error: "Please fill in your name, a valid email and your country." }, { status: 400 });
  }

  const requested = Array.isArray(body.lines) ? body.lines.slice(0, 50) : [];
  if (requested.length === 0) return NextResponse.json({ error: "Your basket is empty." }, { status: 400 });

  const items: MyposCartItem[] = [];
  const summary: string[] = [];
  let goods = 0;
  let hasService = false;

  for (const line of requested) {
    const item = typeof line.id === "string" ? getCatalogItem(line.id) : undefined;
    const quantity = Number(line.quantity);
    if (!item) return NextResponse.json({ error: "An item in your basket is no longer available." }, { status: 400 });
    if (!item.available) return NextResponse.json({ error: `${item.name} is currently unavailable.` }, { status: 400 });
    if (!Number.isInteger(quantity) || quantity < item.minQty || quantity > item.maxQty) {
      return NextResponse.json({ error: `Invalid quantity for ${item.name}.` }, { status: 400 });
    }
    const perFoot = item.unit === "per-foot";
    items.push({ article: article(perFoot ? `${item.name} (${quantity} ft)` : item.name), quantity, price: item.price });
    summary.push(`- ${perFoot ? `${quantity} ft` : `${quantity} ×`} ${item.name} — ${formatPrice(item.price * quantity)}`);
    if (item.shippable) goods += item.price * quantity;
    if (item.kind === "service") hasService = true;
  }

  if (hasService && (!boat || !location)) {
    return NextResponse.json({ error: "Please tell us about your boat and where it's kept." }, { status: 400 });
  }
  if (goods > 0 && method === "delivery" && (!customer.address || !customer.city)) {
    return NextResponse.json({ error: "Please enter your delivery address, or choose collection." }, { status: 400 });
  }

  const delivery = goods > 0 ? deliveryPrice(country, goods, method) : 0;
  if (delivery > 0) {
    items.push({ article: `Tracked delivery to ${country.name}`, quantity: 1, price: delivery });
    summary.push(`- Delivery to ${country.name} — ${formatPrice(delivery)}`);
  }

  const id = orderId();
  // myPOS calls these server-to-server and redirects the customer to them, so they must be the public https URL.
  const base = site.url.replace(/\/$/, "");
  const token = sealToken({ e: customer.email, n: customer.firstNames }, tokenSecret(cfg));
  const purchase = buildPurchase(cfg, {
    orderId: id,
    currency: "EUR",
    items,
    customer: { ...customer, country: country.iso3 },
    urlOk: `${base}/api/mypos/ok`,
    urlCancel: `${base}/api/mypos/cancel`,
    urlNotify: `${base}/api/mypos/notify?c=${token}`,
    note: [boat && `Boat: ${boat}`, location && `Kept at: ${location}`].filter(Boolean).join(" | ").slice(0, 200),
  });

  const total = purchase.amount;
  await sendEmail({
    subject: `Order ${id} started — ${formatPrice(total)} (awaiting payment)`,
    replyTo: customer.email,
    text: [
      `A customer has gone to the myPOS payment page. You'll get a second email when payment is confirmed.`,
      "",
      `Order: ${id}`,
      `Name: ${customer.firstNames} ${customer.familyName}`,
      `Email: ${customer.email}`,
      `Phone: ${customer.phone || "-"}`,
      `Country: ${country.name}`,
      goods > 0 ? `Delivery: ${method === "collect" ? "Collect / bring to boat" : [customer.address, customer.city, customer.zip].filter(Boolean).join(", ")}` : "",
      boat ? `Boat: ${boat}` : "",
      location ? `Kept at: ${location}` : "",
      notes ? `Notes: ${notes}` : "",
      "",
      ...summary,
      "",
      `Total: ${formatPrice(total)}`,
    ]
      .filter((l, i, a) => l !== "" || a[i - 1] !== "")
      .join("\n"),
  });

  return NextResponse.json({ orderId: id, url: purchase.url, fields: purchase.fields });
}
