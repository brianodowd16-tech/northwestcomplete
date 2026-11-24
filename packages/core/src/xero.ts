// Xero: one invoice per venue per trading day summarising app sales by VAT
// rate, less loyalty credit redeemed and refunds, then one payment for the card
// money into the venue's payments clearing account. Account codes and tax types
// differ per Xero organisation, so they come from the venue's settings.

export interface XeroMapping {
  contactName: string;
  salesAccountCode: string;
  taxType9: string;
  taxType23: string;
  creditAccountCode: string;
  creditTaxType: string;
  /** bank/clearing account the card payments land in (e.g. "myPOS clearing") */
  paymentAccountCode: string;
}

export interface DayOrder {
  lines: { grossCents: number; vatRate: 9 | 23 }[];
  creditUsedCents: number;
  amountPaidCents: number;
}

export interface DaySummaryInput {
  date: string; // YYYY-MM-DD, venue local date
  venueName: string;
  paid: DayOrder[]; // orders paid that day
  refunded: DayOrder[]; // orders refunded that day (whenever they were paid)
}

export interface XeroLine {
  Description: string;
  Quantity: 1;
  UnitAmount: number;
  AccountCode: string;
  TaxType: string;
}

export interface DaySummary {
  invoice: {
    Type: "ACCREC";
    Contact: { Name: string };
    Date: string;
    DueDate: string;
    LineAmountTypes: "Inclusive";
    Reference: string;
    Status: "AUTHORISED";
    LineItems: XeroLine[];
  };
  totalCents: number;
  paymentCents: number;
}

const euros = (cents: number) => Math.round(cents) / 100;

function byRate(orders: DayOrder[], rate: 9 | 23) {
  return orders.reduce((s, o) => s + o.lines.filter((l) => l.vatRate === rate).reduce((a, l) => a + l.grossCents, 0), 0);
}

/**
 * Builds the day's invoice. Returns null when there is nothing to post.
 * Throws when refunds exceed sales (needs a credit note, done by hand).
 */
export function buildDaySummary(input: DaySummaryInput, m: XeroMapping): DaySummary | null {
  if (!input.paid.length && !input.refunded.length) return null;
  const items: [string, number, string, string][] = [
    ["Food & hot drinks (9% VAT)", byRate(input.paid, 9), m.salesAccountCode, m.taxType9],
    ["Drinks (23% VAT)", byRate(input.paid, 23), m.salesAccountCode, m.taxType23],
    ["Loyalty credit redeemed", -input.paid.reduce((s, o) => s + o.creditUsedCents, 0), m.creditAccountCode, m.creditTaxType],
    ["Refunds: food & hot drinks (9% VAT)", -byRate(input.refunded, 9), m.salesAccountCode, m.taxType9],
    ["Refunds: drinks (23% VAT)", -byRate(input.refunded, 23), m.salesAccountCode, m.taxType23],
    // A refund returns the card amount; credit spent on a refunded order goes back to the guest.
    ["Refunds: loyalty credit returned", input.refunded.reduce((s, o) => s + o.creditUsedCents, 0), m.creditAccountCode, m.creditTaxType],
  ];
  const lines = items.filter(([, c]) => c !== 0);
  const totalCents = lines.reduce((s, [, c]) => s + c, 0);
  const paymentCents = input.paid.reduce((s, o) => s + o.amountPaidCents, 0) - input.refunded.reduce((s, o) => s + o.amountPaidCents, 0);
  if (totalCents < 0) throw new Error(`Refunds exceed sales on ${input.date}: post a credit note by hand`);
  return {
    invoice: {
      Type: "ACCREC",
      Contact: { Name: m.contactName },
      Date: input.date,
      DueDate: input.date,
      LineAmountTypes: "Inclusive",
      Reference: `Complete app sales ${input.date}`,
      Status: "AUTHORISED",
      LineItems: lines.map(([d, c, a, tt]) => ({ Description: `${input.venueName}: ${d}`, Quantity: 1, UnitAmount: euros(c), AccountCode: a, TaxType: tt })),
    },
    totalCents,
    paymentCents,
  };
}

// ---------------------------------------------------------------- client

export const XERO = {
  authorize: "https://login.xero.com/identity/connect/authorize",
  token: "https://identity.xero.com/connect/token",
  connections: "https://api.xero.com/connections",
  api: "https://api.xero.com/api.xro/2.0",
};

export const DEFAULT_XERO_SCOPES = "openid profile email offline_access accounting.transactions accounting.contacts accounting.settings.read";

export interface XeroTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface XeroApp {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes?: string;
}

export function xeroAuthorizeUrl(app: XeroApp, state: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: app.clientId, redirect_uri: app.redirectUri, scope: app.scopes || DEFAULT_XERO_SCOPES, state });
  return `${XERO.authorize}?${q}`;
}

export class XeroClient {
  constructor(
    private app: XeroApp,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async tokenCall(body: Record<string, string>): Promise<XeroTokens> {
    const res = await this.fetchImpl(XERO.token, {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${this.app.clientId}:${this.app.clientSecret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body),
    });
    if (!res.ok) throw new Error(`Xero token request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000 };
  }

  exchangeCode(code: string) {
    return this.tokenCall({ grant_type: "authorization_code", code, redirect_uri: this.app.redirectUri });
  }

  /** Xero rotates refresh tokens: always store the returned one. */
  refresh(refreshToken: string) {
    return this.tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async connections(accessToken: string): Promise<{ tenantId: string; tenantName: string }[]> {
    const res = await this.fetchImpl(XERO.connections, { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } });
    if (!res.ok) throw new Error(`Xero connections failed: ${res.status}`);
    return (await res.json()) as { tenantId: string; tenantName: string }[];
  }

  private async api<T>(method: string, path: string, accessToken: string, tenantId: string, body: unknown, idempotencyKey: string): Promise<T> {
    const res = await this.fetchImpl(`${XERO.api}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "xero-tenant-id": tenantId,
        "Idempotency-Key": idempotencyKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Xero ${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  /** Posts the day's invoice and its payment. Idempotency keys make retries safe. */
  async postDay(tokens: XeroTokens, tenantId: string, s: DaySummary, paymentAccountCode: string, key: string) {
    const inv = await this.api<{ Invoices: { InvoiceID: string }[] }>("POST", "/Invoices", tokens.accessToken, tenantId, { Invoices: [s.invoice] }, `${key}:inv`);
    const invoiceId = inv.Invoices[0].InvoiceID;
    if (s.paymentCents > 0) {
      await this.api("PUT", "/Payments", tokens.accessToken, tenantId, {
        Payments: [{ Invoice: { InvoiceID: invoiceId }, Account: { Code: paymentAccountCode }, Date: s.invoice.Date, Amount: euros(Math.min(s.paymentCents, s.totalCents)) }],
      }, `${key}:pay`);
    }
    return invoiceId;
  }
}

/** Venue-local calendar date for a timestamp. */
export function localDate(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
