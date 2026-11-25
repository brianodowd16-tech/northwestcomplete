// Deel (global payroll, EOR and contractors), over its REST API. When a pay period
// closes, each matched staff member's hours go to Deel: hourly contractors as a
// timesheet, payroll (GP/EOR) employees as an adjustment for gross pay (and tips,
// if a tips category is set). Idempotency keys are derived from venue, period and
// person, so a retry never doubles pay.
import { createHash } from "node:crypto";
import type { payrollPeriod } from "./rota";

export const DEEL = { production: "https://api.letsdeel.com/rest", sandbox: "https://api-staging.letsdeel.com/rest" } as const;
export type DeelEnv = keyof typeof DEEL;

export interface DeelContract { id: string; type: string; title: string; email: string; name: string; externalId: string | null }
export interface DeelCategory { id: string; name: string }

/** Contracts paid by the hour take timesheets; everything else (payroll, EOR) takes adjustments. */
export const isTimeBased = (type: string) => /time_based/.test(type);

/** Stable UUID-shaped key (Deel wants a UUID, at most 64 characters) from our own key. */
export function stableUuid(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type DeelItem =
  | { kind: "timesheet"; staffId: string; key: string; body: { data: { contract_id: string; quantity: number; description: string; date_submitted: string } } }
  | { kind: "adjustment"; staffId: string; key: string; body: { contract_id: string; title: string; amount: string; adjustment_category_id: string; date_of_adjustment: string; description: string } };

/**
 * What to send for one closed period. `lastDay` is the period's last date (YYYY-MM-DD).
 * Staff without a contract, or with nothing worked, are skipped and listed.
 */
export function deelPeriodItems(
  rows: ReturnType<typeof payrollPeriod>,
  contracts: Record<string, DeelContract>,
  opts: { venueId: string; venueName: string; start: string; lastDay: string; payCategoryId: string; tipsCategoryId?: string },
): { items: DeelItem[]; unmatched: string[] } {
  const items: DeelItem[] = [];
  const unmatched: string[] = [];
  const key = (staffId: string, what: string) => stableUuid(`complete:${opts.venueId}:${opts.start}:${staffId}:${what}`);
  const span = `${opts.start} to ${opts.lastDay}`;
  for (const r of rows) {
    const c = contracts[r.staffId];
    if (!c) { unmatched.push(r.name); continue; }
    if (r.hours <= 0 && r.tipsCents <= 0) continue;
    if (isTimeBased(c.type)) {
      if (r.hours > 0) items.push({ kind: "timesheet", staffId: r.staffId, key: key(r.staffId, "hours"), body: { data: { contract_id: c.id, quantity: r.hours, description: `${opts.venueName}: ${r.hours.toFixed(2)} hours, ${span}${r.sundayHours ? ` (${r.sundayHours.toFixed(2)} on Sunday)` : ""}`, date_submitted: opts.lastDay } } });
      continue;
    }
    if (!opts.payCategoryId) { unmatched.push(r.name); continue; }
    if (r.grossCents > 0)
      items.push({ kind: "adjustment", staffId: r.staffId, key: key(r.staffId, "pay"), body: { contract_id: c.id, title: `Hours ${span}`, amount: (r.grossCents / 100).toFixed(2), adjustment_category_id: opts.payCategoryId, date_of_adjustment: opts.lastDay, description: `${opts.venueName}: ${r.hours.toFixed(2)} hours (${r.sundayHours.toFixed(2)} Sunday) at €${(r.rateCents / 100).toFixed(2)}` } });
    if (r.tipsCents > 0 && opts.tipsCategoryId)
      items.push({ kind: "adjustment", staffId: r.staffId, key: key(r.staffId, "tips"), body: { contract_id: c.id, title: `Tips ${span}`, amount: (r.tipsCents / 100).toFixed(2), adjustment_category_id: opts.tipsCategoryId, date_of_adjustment: opts.lastDay, description: `${opts.venueName}: tips shared by hours worked` } });
  }
  return { items, unmatched };
}

export class DeelClient {
  private last = 0;
  constructor(
    private token: string,
    private env: DeelEnv = "production",
    private fetchImpl: typeof fetch = fetch,
    private minGapMs = 250, // Deel allows 5 requests a second per organisation
  ) {}

  private async call<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const wait = this.last + this.minGapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.last = Date.now();
      const res = await this.fetchImpl(`${DEEL[this.env]}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (res.status === 429 && attempt < 3) { await new Promise((r) => setTimeout(r, this.minGapMs * 4 * (attempt + 1))); continue; }
      if (!res.ok) throw new Error(`Deel ${method} ${path} failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return (await res.json()) as T;
    }
  }

  /** All active contracts, following Deel's cursor. */
  async contracts(): Promise<DeelContract[]> {
    const out: DeelContract[] = [];
    let cursor = "";
    for (let page = 0; page < 40; page++) {
      const r = await this.call<{ data: { id: string; type: string; title?: string; external_id?: string | null; worker?: { email?: string; full_name?: string } | null; invitations?: { worker_email?: string } }[]; page?: { cursor?: string } }>(
        "GET", `/contracts?limit=100${cursor ? `&after_cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      for (const c of r.data ?? []) out.push({ id: c.id, type: c.type, title: c.title ?? "", externalId: c.external_id ?? null, email: (c.worker?.email ?? c.invitations?.worker_email ?? "").toLowerCase(), name: c.worker?.full_name ?? "" });
      cursor = r.page?.cursor ?? "";
      if (!cursor || !(r.data ?? []).length) break;
    }
    return out;
  }

  async categories(): Promise<DeelCategory[]> {
    const r = await this.call<{ data: { id: string; name?: string; label?: string }[] }>("GET", "/adjustments/categories");
    return (r.data ?? []).map((c) => ({ id: c.id, name: c.label || c.name || c.id }));
  }

  async send(item: DeelItem): Promise<string> {
    const r = await this.call<{ data?: { id?: string } }>("POST", item.kind === "timesheet" ? "/timesheets" : "/adjustments", item.body, item.key);
    return r.data?.id ?? "";
  }
}

/** Matches staff to Deel contracts: our id as the contract's external_id first, then email. */
export function matchContracts(staff: { id: string; email: string }[], contracts: DeelContract[], manual: Record<string, string> = {}): Record<string, DeelContract> {
  const out: Record<string, DeelContract> = {};
  for (const s of staff) {
    const c = (manual[s.id] && contracts.find((x) => x.id === manual[s.id])) || contracts.find((x) => x.externalId === s.id) || contracts.find((x) => !!s.email && x.email === s.email.toLowerCase());
    if (c) out[s.id] = c;
  }
  return out;
}
