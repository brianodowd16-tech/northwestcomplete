/**
 * Clients for the partner systems a venue can connect: WooCommerce (online shop), Trybe (spa and
 * activities), Mews (hotel PMS room charges), Revolut Business and myPOS (bank and card reports, for
 * reconciling payouts). Pure helpers here are unit-tested; network calls take an injectable fetch.
 */
import { createHmac, createSign, randomUUID, timingSafeEqual } from "node:crypto";

type Fetch = typeof fetch;
const sameText = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const toCents = (v: unknown) => Math.round(Number(String(v ?? "0").replace(",", ".")) * 100) || 0;

async function call<T>(f: Fetch, url: string, init: RequestInit, what: string): Promise<T> {
  const res = await f(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${what} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------------------------------------------------------------- WooCommerce

/** WooCommerce signs each webhook: X-WC-Webhook-Signature = base64 HMAC-SHA256 of the raw body. */
export function verifyWooSignature(rawBody: string, secret: string, header: string | null): boolean {
  if (!header || !secret) return false;
  return sameText(createHmac("sha256", secret).update(rawBody, "utf8").digest("base64"), header.trim());
}

export interface WooOrder {
  id: number;
  status: string;
  currency: string;
  total: string;
  date_paid_gmt?: string | null;
  billing?: { first_name?: string; last_name?: string; email?: string };
  line_items: { sku?: string | null; name: string; quantity: number; total: string; total_tax: string }[];
}

/** Paid shop orders only: processing (paid, being prepared) or completed. */
export const wooPaid = (o: Pick<WooOrder, "status">) => o.status === "processing" || o.status === "completed";

/** Shop lines as items to match against the menu (by SKU = the menu item's external ID, else by name). */
export function wooItems(o: WooOrder): { plu?: string; name: string; qty: number }[] {
  return (o.line_items ?? []).filter((l) => l.quantity > 0).map((l) => ({ plu: l.sku?.trim() || undefined, name: l.name, qty: Math.round(l.quantity) }));
}

export const wooTotalCents = (o: WooOrder) => toCents(o.total);

export class WooClient {
  constructor(private store: string, private key: string, private secret: string, private f: Fetch = fetch) {}
  /** Paid orders created after `after` (ISO), newest pages first. Auth: consumer key + secret over HTTPS. */
  async paidOrders(after: string, page = 1): Promise<WooOrder[]> {
    const q = new URLSearchParams({ after, per_page: "50", page: String(page), status: "processing,completed" });
    const auth = Buffer.from(`${this.key}:${this.secret}`).toString("base64");
    return call<WooOrder[]>(this.f, `${this.store.replace(/\/+$/, "")}/wp-json/wc/v3/orders?${q}`, { headers: { Authorization: `Basic ${auth}` } }, "WooCommerce");
  }
}

// ---------------------------------------------------------------- Trybe

/** Trybe signs webhooks: header `signature` = hex HMAC-SHA256 of the raw body with the webhook secret. */
export function verifyTrybeSignature(rawBody: string, secret: string, header: string | null): boolean {
  if (!header || !secret) return false;
  return sameText(createHmac("sha256", secret).update(rawBody, "utf8").digest("hex"), header.trim().toLowerCase());
}

export interface TrybeOrder {
  id: string;
  order_ref?: string;
  status?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  currency?: string;
  total_cost?: number;
  booking_items_start_date?: string | null;
  booking_items_end_date?: string | null;
  booking_items?: { offering_name?: string; item_name?: string; name?: string; start_time?: string; item_date?: string }[];
  items?: { offering_name?: string; name?: string }[];
  site_id?: string;
}

export interface PartnerBookingInput {
  externalId: string;
  ref: string | null;
  status: "confirmed" | "cancelled";
  guestName: string;
  email: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  items: string[];
  totalCents: number;
}

/** A Trybe order (their basket) as a spa/activity booking. Amounts are in the smallest unit. */
export function trybeBooking(o: TrybeOrder, cancelled = false): PartnerBookingInput {
  const items = [...(o.booking_items ?? []), ...(o.items ?? [])].map((i) => String((i as { offering_name?: string; item_name?: string; name?: string }).offering_name ?? (i as { item_name?: string }).item_name ?? i.name ?? "").trim()).filter(Boolean);
  const d = (v?: string | null) => (v && !Number.isNaN(Date.parse(v)) ? new Date(v) : null);
  return {
    externalId: String(o.id),
    ref: o.order_ref ?? null,
    status: cancelled || o.status === "cancelled" ? "cancelled" : "confirmed",
    guestName: [o.first_name, o.last_name].filter(Boolean).join(" ").trim() || "Guest",
    email: o.email?.trim().toLowerCase() || null,
    startsAt: d(o.booking_items_start_date ?? o.booking_items?.[0]?.start_time ?? o.booking_items?.[0]?.item_date),
    endsAt: d(o.booking_items_end_date),
    items: [...new Set(items)].slice(0, 10),
    totalCents: Math.round(Number(o.total_cost ?? 0)) || 0,
  };
}

export const TRYBE_BASE = { production: "https://api.try.be", playground: "https://api.playground.try.be" } as const;

export class TrybeClient {
  constructor(private token: string, private base: string = TRYBE_BASE.production, private f: Fetch = fetch) {}
  private get<T>(path: string) {
    return call<T>(this.f, `${this.base}${path}`, { headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" } }, "Trybe");
  }
  /** Checks the token (200 = valid). */
  tokenInfo() {
    return this.get<{ sub?: string }>("/token-info");
  }
  /** Orders with items between two dates at one site. */
  async orders(siteId: string, from: Date, to: Date, page = 1) {
    const q = new URLSearchParams({ site_id: siteId, item_date_from: from.toISOString(), item_date_to: to.toISOString(), per_page: "50", page: String(page) });
    return this.get<{ data: TrybeOrder[]; meta?: { last_page?: number } }>(`/shop/orders?${q}`);
  }
}

// ---------------------------------------------------------------- Mews

export const MEWS_BASE = { production: "https://api.mews.com", demo: "https://api.mews-demo.com" } as const;

export interface MewsConfig {
  platform: keyof typeof MEWS_BASE;
  /** the outlet/F&B service in Mews that charges are posted under */
  serviceId: string;
  /** Mews tax codes for each Irish VAT rate, from taxations/getAll (e.g. for 9% and 23%) */
  taxCodes: { "9": string; "23": string };
  accountingCategoryId?: string | null;
}

/** One Mews order item per line: gross pricing, one tax code per item. */
export function mewsItems(lines: { name: string; qty: number; grossCents: number; vatRate: 9 | 23 }[], cfg: Pick<MewsConfig, "taxCodes" | "accountingCategoryId">) {
  return lines
    .filter((l) => l.qty > 0 && l.grossCents > 0)
    .map((l) => ({
      Name: l.name.slice(0, 100),
      UnitCount: l.qty,
      UnitAmount: { Currency: "EUR", GrossValue: Math.round(l.grossCents / l.qty) / 100, TaxCodes: [cfg.taxCodes[String(l.vatRate) as "9" | "23"]] },
      ...(cfg.accountingCategoryId ? { AccountingCategoryId: cfg.accountingCategoryId } : {}),
    }));
}

export class MewsClient {
  constructor(private cfg: { platform: keyof typeof MEWS_BASE; clientToken: string; accessToken: string }, private f: Fetch = fetch) {}
  private post<T>(path: string, body: Record<string, unknown>) {
    return call<T>(this.f, `${MEWS_BASE[this.cfg.platform]}/api/connector/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ClientToken: this.cfg.clientToken, AccessToken: this.cfg.accessToken, Client: "Complete 1.0", ...body }),
    }, "Mews");
  }
  /** The checked-in reservation in a room (by the room's name in Mews), or null. */
  async inHouse(room: string): Promise<{ reservationId: string; accountId: string } | null> {
    const r = await this.post<{ Resources: { Id: string; Name: string }[] }>("resources/getAll", { Names: [room], Extent: { Resources: true }, Limitation: { Count: 10 } });
    const res = r.Resources?.find((x) => x.Name.trim().toLowerCase() === room.trim().toLowerCase());
    if (!res) return null;
    const v = await this.post<{ Reservations: { Id: string; AccountId: string; State: string }[] }>("reservations/getAll/2023-06-06", { AssignedResourceIds: [res.Id], States: ["Started"], Limitation: { Count: 10 } });
    const s = v.Reservations?.[0];
    return s ? { reservationId: s.Id, accountId: s.AccountId } : null;
  }
  /** Posts the charge to the guest's bill, linked to their stay. */
  async addOrder(input: { serviceId: string; accountId: string; reservationId: string; items: ReturnType<typeof mewsItems>; notes: string }) {
    const r = await this.post<{ OrderId: string }>("orders/add", { ServiceId: input.serviceId, AccountId: input.accountId, LinkedReservationId: input.reservationId, Items: input.items, Notes: input.notes.slice(0, 200) });
    return r.OrderId;
  }
}

// ---------------------------------------------------------------- Revolut Business

export const REVOLUT_BUSINESS_BASE = { production: "https://b2b.revolut.com/api/1.0", sandbox: "https://sandbox-b2b.revolut.com/api/1.0" } as const;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** The signed client assertion Revolut Business takes when exchanging a refresh token (RS256). */
export function revolutBusinessAssertion(clientId: string, issuerDomain: string, privateKeyPem: string, now = Date.now()) {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: issuerDomain, sub: clientId, aud: "https://revolut.com", exp: Math.floor(now / 1000) + 300 }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKeyPem);
  return `${head}.${body}.${b64url(sig)}`;
}

export interface RevolutBusinessTxn {
  id: string;
  type: string;
  state: string;
  created_at: string;
  completed_at?: string;
  reference?: string;
  legs: { account_id: string; amount: number; currency: string; description?: string }[];
}

export interface BankCredit { id: string; date: string; cents: number; description: string }

/** Completed money coming into EUR accounts: the candidates for card-payout settlements. */
export function bankCredits(txns: RevolutBusinessTxn[], timezone = "Europe/Dublin"): BankCredit[] {
  const out: BankCredit[] = [];
  for (const t of txns) {
    if (t.state !== "completed") continue;
    for (const l of t.legs ?? []) {
      if (l.currency !== "EUR" || !(l.amount > 0)) continue;
      const at = new Date(t.completed_at ?? t.created_at);
      out.push({ id: `${t.id}:${l.account_id}`, date: at.toLocaleDateString("en-CA", { timeZone: timezone }), cents: Math.round(l.amount * 100), description: String(l.description ?? t.reference ?? "").slice(0, 120) });
    }
  }
  return out;
}

export class RevolutBusinessClient {
  private access: { token: string; until: number } | null = null;
  constructor(
    private cfg: { env: keyof typeof REVOLUT_BUSINESS_BASE; clientId: string; issuer: string; privateKey: string; refreshToken: string },
    private f: Fetch = fetch,
  ) {}
  private get base() {
    return REVOLUT_BUSINESS_BASE[this.cfg.env];
  }
  /** Access tokens last 40 minutes; refreshed with the stored refresh token and a fresh assertion. */
  async token() {
    if (this.access && this.access.until > Date.now() + 60_000) return this.access.token;
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.cfg.refreshToken,
      client_id: this.cfg.clientId,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: revolutBusinessAssertion(this.cfg.clientId, this.cfg.issuer, this.cfg.privateKey),
    });
    const r = await call<{ access_token: string; expires_in: number }>(this.f, `${this.base}/auth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form }, "Revolut Business");
    this.access = { token: r.access_token, until: Date.now() + (r.expires_in || 2400) * 1000 };
    return r.access_token;
  }
  private async get<T>(path: string) {
    return call<T>(this.f, `${this.base}${path}`, { headers: { Authorization: `Bearer ${await this.token()}` } }, "Revolut Business");
  }
  accounts() {
    return this.get<{ id: string; name?: string; balance: number; currency: string; state: string }[]>("/accounts");
  }
  transactions(from: Date, to: Date) {
    return this.get<RevolutBusinessTxn[]>(`/transactions?${new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), count: "1000" })}`);
  }
}

// ---------------------------------------------------------------- myPOS transactions (reports)

export const MYPOS_REPORTS_BASE = {
  production: { auth: "https://auth-api.mypos.com", api: "https://transactions-api.mypos.com" },
  sandbox: { auth: "https://sandbox-auth-api.mypos.com", api: "https://sandbox-transactions-api.mypos.com" },
} as const;

export interface MyposTxn { amount: number; currency: string; date: string; type: string; reference: string | null }

/** Reads myPOS transaction rows, whatever their exact field names, into amounts in cents by local day. */
export function myposDayTotals(rows: Record<string, unknown>[], timezone = "Europe/Dublin"): Map<string, number> {
  const days = new Map<string, number>();
  for (const r of rows) {
    const type = String(r.transaction_type ?? r.type ?? "").toLowerCase();
    if (type && !/(purchase|sale|payment|refund)/.test(type)) continue;
    const when = String(r.date ?? r.transaction_date ?? r.created_at ?? "");
    if (!when || Number.isNaN(Date.parse(when))) continue;
    const cur = String(r.currency ?? "EUR").toUpperCase();
    if (cur !== "EUR") continue;
    let cents = toCents(r.amount);
    if (/refund/.test(type) && cents > 0) cents = -cents;
    const day = new Date(when).toLocaleDateString("en-CA", { timeZone: timezone });
    days.set(day, (days.get(day) ?? 0) + cents);
  }
  return days;
}

export class MyposReportsClient {
  private access: { token: string; until: number } | null = null;
  constructor(private cfg: { env: keyof typeof MYPOS_REPORTS_BASE; clientId: string; clientSecret: string; apiKey: string }, private f: Fetch = fetch) {}
  private get base() {
    return MYPOS_REPORTS_BASE[this.cfg.env];
  }
  async token() {
    if (this.access && this.access.until > Date.now() + 60_000) return this.access.token;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const r = await call<{ access_token: string; expires_in: number }>(this.f, `${this.base.auth}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "client_credentials" }) }, "myPOS");
    this.access = { token: r.access_token, until: Date.now() + (r.expires_in || 3600) * 1000 };
    return r.access_token;
  }
  /** Completed transactions between two dates (all pages). */
  async transactions(fromDate: string, toDate: string): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let page = 1; page <= 50; page++) {
      const q = new URLSearchParams({ from_date: fromDate, to_date: toDate, page: String(page), size: "100" });
      const r = await call<{ items?: Record<string, unknown>[]; data?: Record<string, unknown>[]; transactions?: Record<string, unknown>[]; pagination?: { page_count?: number } }>(
        this.f,
        `${this.base.api}/v1.1/transactions?${q}`,
        { headers: { Authorization: `Bearer ${await this.token()}`, "API-Key": this.cfg.apiKey, "X-Request-ID": randomUUID() } },
        "myPOS",
      );
      const rows = r.items ?? r.data ?? r.transactions ?? [];
      out.push(...rows);
      if (rows.length < 100 || (r.pagination?.page_count && page >= r.pagination.page_count)) break;
    }
    return out;
  }
}

// ---------------------------------------------------------------- reconciliation

export interface PayoutMatch { date: string; expectedCents: number; status: "matched" | "waiting" | "missing" | "nothing"; credit: BankCredit | null }

/**
 * Matches each trading day's card takings to a payout landing in the bank. A payout is the day's
 * takings less the provider's fees, so it must be between (1 - maxFee) × expected and expected,
 * and land within `maxLagDays`. Each payout is used once, oldest day first.
 */
export function matchPayouts(days: { date: string; expectedCents: number }[], credits: BankCredit[], today: string, opts: { maxFee?: number; maxLagDays?: number } = {}): PayoutMatch[] {
  const maxFee = opts.maxFee ?? 0.03, lag = opts.maxLagDays ?? 4;
  const used = new Set<string>();
  const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  return [...days].sort((a, b) => a.date.localeCompare(b.date)).map((d) => {
    if (d.expectedCents <= 0) return { ...d, status: "nothing" as const, credit: null };
    const c = credits
      .filter((x) => !used.has(x.id) && dayNum(x.date) >= dayNum(d.date) && dayNum(x.date) - dayNum(d.date) <= lag && x.cents <= d.expectedCents && x.cents >= Math.floor(d.expectedCents * (1 - maxFee)))
      .sort((a, b) => a.date.localeCompare(b.date) || b.cents - a.cents)[0];
    if (c) {
      used.add(c.id);
      return { ...d, status: "matched" as const, credit: c };
    }
    return { ...d, status: dayNum(today) - dayNum(d.date) > lag ? ("missing" as const) : ("waiting" as const), credit: null };
  });
}

/** Card takings by Complete against the card provider's own report for a day. Within €1 is a match. */
export function compareTakings(completeCents: number, providerCents: number, toleranceCents = 100) {
  const diff = providerCents - completeCents;
  return { ok: Math.abs(diff) <= toleranceCents, diffCents: diff };
}
