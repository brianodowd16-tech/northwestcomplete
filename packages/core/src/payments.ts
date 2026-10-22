import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type ProviderOrderState = "pending" | "processing" | "authorised" | "completed" | "cancelled" | "failed";

export interface LineItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  externalId?: string | null;
}

export interface CreateOrderInput {
  amountCents: number;
  currency: "EUR";
  reference: string;
  description: string;
  lineItems: LineItem[];
  customerEmail?: string;
}

export interface CreatedOrder {
  providerOrderId: string;
  /** public token for the checkout widget */
  token: string;
}

export interface WebhookEvent {
  event: string;
  providerOrderId: string;
}

export interface PaymentProvider {
  readonly name: "revolut" | "mock";
  /** public key for the client-side widget; null in mock mode */
  readonly publicKey: string | null;
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  getOrder(providerOrderId: string): Promise<{ state: ProviderOrderState }>;
  refund(providerOrderId: string, amountCents: number, reason: string): Promise<void>;
  verifyWebhook(rawBody: string, headers: Headers, now?: number): boolean;
  parseWebhook(rawBody: string): WebhookEvent;
}

// ---------------------------------------------------------------------------
// Revolut webhook signatures: HMAC-SHA256 over `v1.{timestamp}.{rawBody}`.
// Revolut-Signature may hold several comma-separated `v1=` values (key rotation).

export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export function signWebhook(rawBody: string, timestamp: string, secret: string): string {
  return "v1=" + createHmac("sha256", secret).update(`v1.${timestamp}.${rawBody}`).digest("hex");
}

export function verifyRevolutSignature(
  rawBody: string,
  timestamp: string | null,
  signatureHeader: string | null,
  secret: string,
  now = Date.now(),
): boolean {
  if (!timestamp || !signatureHeader || !secret) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > WEBHOOK_TOLERANCE_MS) return false;
  const expected = Buffer.from(signWebhook(rawBody, timestamp, secret));
  return signatureHeader.split(",").some((sig) => {
    const given = Buffer.from(sig.trim());
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

function parseRevolutWebhook(rawBody: string): WebhookEvent {
  const body = JSON.parse(rawBody) as { event?: unknown; order_id?: unknown };
  if (typeof body.event !== "string" || typeof body.order_id !== "string") throw new Error("Malformed webhook");
  return { event: body.event, providerOrderId: body.order_id };
}

// ---------------------------------------------------------------------------

export interface RevolutConfig {
  secretKey: string;
  publicKey: string;
  webhookSecret: string;
  apiBase: string;
  apiVersion: string;
}

export class RevolutProvider implements PaymentProvider {
  readonly name = "revolut" as const;
  constructor(private cfg: RevolutConfig) {}

  get publicKey() {
    return this.cfg.publicKey;
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.cfg.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.secretKey}`,
        "Revolut-Api-Version": this.cfg.apiVersion,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Revolut ${method} ${path} failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as T;
  }

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const order = await this.call<{ id: string; token: string }>("POST", "/api/orders", {
      amount: input.amountCents,
      currency: input.currency,
      description: input.description,
      merchant_order_data: { reference: input.reference },
      customer: input.customerEmail ? { email: input.customerEmail } : undefined,
      line_items: input.lineItems.length === 0 ? undefined : input.lineItems.map((l) => ({
        name: l.name,
        type: "physical",
        quantity: { value: l.quantity },
        unit_price_amount: l.unitPriceCents,
        total_amount: l.totalCents,
        external_id: l.externalId ?? undefined,
      })),
    });
    return { providerOrderId: order.id, token: order.token };
  }

  async getOrder(id: string) {
    const order = await this.call<{ state: string }>("GET", `/api/orders/${id}`);
    return { state: order.state.toLowerCase() as ProviderOrderState };
  }

  async refund(id: string, amountCents: number, reason: string) {
    await this.call("POST", `/api/orders/${id}/refund`, { amount: amountCents, currency: "EUR", description: reason });
  }

  verifyWebhook(rawBody: string, headers: Headers, now?: number) {
    return verifyRevolutSignature(
      rawBody,
      headers.get("revolut-request-timestamp"),
      headers.get("revolut-signature"),
      this.cfg.webhookSecret,
      now,
    );
  }

  parseWebhook = parseRevolutWebhook;
}

// ---------------------------------------------------------------------------
// Mock provider: same contract and same signed-webhook path, no network.

export const MOCK_WEBHOOK_SECRET = "mock-webhook-secret";

interface MockOrder {
  state: ProviderOrderState;
  amountCents: number;
  refundedCents: number;
}

const mockStore: Map<string, MockOrder> = ((globalThis as { __roundMockPay?: Map<string, MockOrder> }).__roundMockPay ??=
  new Map());

export class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly publicKey = null;

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const id = `mock_${randomUUID()}`;
    mockStore.set(id, { state: "pending", amountCents: input.amountCents, refundedCents: 0 });
    return { providerOrderId: id, token: `tok_${id}` };
  }

  async getOrder(id: string) {
    const o = mockStore.get(id);
    if (!o) throw new Error("Unknown mock order");
    return { state: o.state };
  }

  async refund(id: string, amountCents: number) {
    const o = mockStore.get(id);
    if (!o) throw new Error("Unknown mock order");
    o.refundedCents += amountCents;
  }

  verifyWebhook(rawBody: string, headers: Headers, now?: number) {
    return verifyRevolutSignature(
      rawBody,
      headers.get("revolut-request-timestamp"),
      headers.get("revolut-signature"),
      MOCK_WEBHOOK_SECRET,
      now,
    );
  }

  parseWebhook = parseRevolutWebhook;

  /** Marks the order paid and returns the signed webhook Revolut would send. */
  simulatePayment(id: string): { rawBody: string; headers: Headers } {
    const o = mockStore.get(id);
    if (!o) throw new Error("Unknown mock order");
    o.state = "completed";
    const rawBody = JSON.stringify({ event: "ORDER_COMPLETED", order_id: id });
    const timestamp = String(Date.now());
    const headers = new Headers({
      "revolut-request-timestamp": timestamp,
      "revolut-signature": signWebhook(rawBody, timestamp, MOCK_WEBHOOK_SECRET),
    });
    return { rawBody, headers };
  }
}

export function providerFromEnv(env: Record<string, string | undefined>): PaymentProvider {
  if (!env.REVOLUT_SECRET_KEY) return new MockProvider();
  return new RevolutProvider({
    secretKey: env.REVOLUT_SECRET_KEY,
    publicKey: env.REVOLUT_PUBLIC_KEY ?? "",
    webhookSecret: env.REVOLUT_WEBHOOK_SECRET ?? "",
    apiBase: env.REVOLUT_API_BASE ?? "https://sandbox-merchant.revolut.com",
    apiVersion: env.REVOLUT_API_VERSION ?? "2024-09-01",
  });
}
