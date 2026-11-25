// Sage Accounting (Sage Business Cloud Accounting, UK & Ireland, API v3.1): the same
// daily posting as Xero. One sales invoice per venue per trading day by VAT rate, less
// loyalty credit and refunds, then one customer receipt for the card money into the
// venue's clearing bank account. Ledger, tax rate, contact and bank IDs differ per
// Sage business, so they are picked by the manager from lists read from Sage.
import { dayLines, type DaySummaryInput } from "./xero";

export const SAGE = {
  authorize: "https://www.sageone.com/oauth2/auth/central",
  token: "https://oauth.accounting.sage.com/token",
  api: "https://api.accounting.sage.com/v3.1",
};

export interface SageMapping {
  contactId: string;
  salesLedgerId: string;
  creditLedgerId: string;
  taxRate9Id: string;
  taxRate23Id: string;
  taxRateNoneId: string;
  /** bank account the card payouts land in (e.g. "myPOS clearing") */
  bankAccountId: string;
}

export const SAGE_MAPPING_FIELDS: (keyof SageMapping)[] = ["contactId", "salesLedgerId", "creditLedgerId", "taxRate9Id", "taxRate23Id", "taxRateNoneId", "bankAccountId"];
export const sageMapped = (m: Partial<SageMapping>) => SAGE_MAPPING_FIELDS.every((k) => !!m[k]);

export interface SageApp {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface SageTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export function sageAuthorizeUrl(app: SageApp, state: string): string {
  const q = new URLSearchParams({ filter: "apiv3.1", response_type: "code", client_id: app.clientId, redirect_uri: app.redirectUri, scope: "full_access", state });
  return `${SAGE.authorize}?${q}`;
}

/** Short reference Sage can search on (its reference field is short); the full key goes in the notes. */
export const sageReference = (venueId: string, date: string) => `CMP${date.replace(/-/g, "")}-${venueId.replace(/-/g, "").slice(0, 6)}`;

export interface SageDay {
  invoice: {
    sales_invoice: {
      contact_id: string;
      date: string;
      due_date: string;
      reference: string;
      notes: string;
      invoice_lines: { description: string; ledger_account_id: string; quantity: 1; unit_price: number; unit_price_includes_tax: true; tax_rate_id: string }[];
    };
  };
  totalCents: number;
  paymentCents: number;
}

const euros = (cents: number) => Math.round(cents) / 100;

export function buildSageDay(input: DaySummaryInput, m: SageMapping, venueId: string): SageDay | null {
  const day = dayLines(input);
  if (!day) return null;
  const map = { sales9: [m.salesLedgerId, m.taxRate9Id], sales23: [m.salesLedgerId, m.taxRate23Id], credit: [m.creditLedgerId, m.taxRateNoneId] } as const;
  return {
    invoice: {
      sales_invoice: {
        contact_id: m.contactId,
        date: input.date,
        due_date: input.date,
        reference: sageReference(venueId, input.date),
        notes: `Complete app sales ${input.date} (complete:${venueId}:${input.date})`,
        invoice_lines: day.lines.map((l) => ({
          description: `${input.venueName}: ${l.label}`,
          ledger_account_id: map[l.kind][0],
          quantity: 1,
          unit_price: euros(l.cents),
          unit_price_includes_tax: true,
          tax_rate_id: map[l.kind][1],
        })),
      },
    },
    totalCents: day.totalCents,
    paymentCents: day.paymentCents,
  };
}

export interface SageOption { id: string; name: string }

export class SageClient {
  constructor(
    private app: SageApp,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async tokenCall(body: Record<string, string>): Promise<SageTokens> {
    const res = await this.fetchImpl(SAGE.token, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ ...body, client_id: this.app.clientId, client_secret: this.app.clientSecret }),
    });
    if (!res.ok) throw new Error(`Sage token request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + j.expires_in * 1000 };
  }

  exchangeCode(code: string) {
    return this.tokenCall({ grant_type: "authorization_code", code, redirect_uri: this.app.redirectUri });
  }

  /** Sage refresh tokens rotate and expire: always store the returned one. */
  refresh(refreshToken: string) {
    return this.tokenCall({ grant_type: "refresh_token", refresh_token: refreshToken });
  }

  async api<T>(method: string, path: string, token: string, businessId: string | null, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${SAGE.api}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(businessId ? { "X-Business": businessId } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new Error(`Sage ${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }

  async businesses(token: string): Promise<SageOption[]> {
    const r = await this.api<{ id: string; name: string }[] | { $items: { id: string; name?: string; displayed_as?: string }[] }>("GET", "/businesses", token, null);
    const items = Array.isArray(r) ? r : r.$items;
    return items.map((b) => ({ id: b.id, name: (b as { name?: string }).name ?? (b as { displayed_as?: string }).displayed_as ?? b.id }));
  }

  /** Lists for the mapping screen: customers, income ledgers, tax rates and bank accounts. */
  async options(token: string, businessId: string) {
    const list = async (path: string) =>
      ((await this.api<{ $items: { id: string; displayed_as: string }[] }>("GET", path, token, businessId)).$items ?? []).map((i) => ({ id: i.id, name: i.displayed_as }));
    const [contacts, ledgers, taxRates, banks] = await Promise.all([
      list("/contacts?contact_type_id=CUSTOMER&items_per_page=200"),
      list("/ledger_accounts?visible_in=sales&items_per_page=200"),
      list("/tax_rates?items_per_page=200"),
      list("/bank_accounts?items_per_page=200"),
    ]);
    return { contacts, ledgers, taxRates, banks };
  }

  /**
   * Posts the day's invoice and receipt. Sage has no idempotency key, so a retry first
   * looks for an invoice with the day's reference and only pays what is still outstanding.
   */
  async postDay(token: string, businessId: string, d: SageDay, m: SageMapping): Promise<string> {
    const ref = d.invoice.sales_invoice.reference;
    const found = await this.api<{ $items: { id: string; reference?: string; displayed_as?: string }[] }>("GET", `/sales_invoices?search=${encodeURIComponent(ref)}&items_per_page=20`, token, businessId);
    let id = (found.$items ?? []).find((i) => i.reference === ref || i.displayed_as?.includes(ref))?.id;
    let outstandingCents = d.totalCents;
    if (id) {
      const inv = await this.api<{ outstanding_amount: string | number }>("GET", `/sales_invoices/${id}`, token, businessId);
      outstandingCents = Math.round(Number(inv.outstanding_amount) * 100);
    } else {
      id = (await this.api<{ id: string }>("POST", "/sales_invoices", token, businessId, d.invoice)).id;
    }
    const pay = Math.min(d.paymentCents, outstandingCents);
    if (pay > 0) {
      await this.api("POST", "/contact_payments", token, businessId, {
        contact_payment: {
          transaction_type_id: "CUSTOMER_RECEIPT",
          contact_id: m.contactId,
          bank_account_id: m.bankAccountId,
          date: d.invoice.sales_invoice.date,
          total_amount: euros(pay),
          reference: ref,
          allocated_artefacts: [{ artefact_id: id, amount: euros(pay) }],
        },
      });
    }
    return id;
  }
}
