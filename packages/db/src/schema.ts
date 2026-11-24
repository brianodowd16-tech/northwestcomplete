import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  index,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const tenantId = () => uuid("tenant_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// Tenant-scoped tables carry tenant_id and are protected by RLS (sql/rls.sql).
// customer, otp_code and webhook_event are platform-level: no tenant.

export const tenant = pgTable("tenant", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const programme = pgTable("programme", {
  id: id(),
  tenantId: tenantId(),
  name: text("name").notNull(),
  pointsPerEuro: integer("points_per_euro").notNull(),
  pointsPerCreditEuro: integer("points_per_credit_euro").notNull(),
  signupCreditCents: integer("signup_credit_cents").notNull(),
  referralPoints: integer("referral_points").notNull(),
  /** venue redemption rules: see RedemptionRules in packages/core/src/decisions.ts */
  redemptionRules: jsonb("redemption_rules").notNull().default({}).$type<Record<string, unknown>>(),
});

export const programmeLevel = pgTable("programme_level", {
  id: id(),
  tenantId: tenantId(),
  programmeId: uuid("programme_id").notNull().references(() => programme.id),
  name: text("name").notNull(),
  minSpend12mCents: integer("min_spend_12m_cents").notNull(),
  levelupPoints: integer("levelup_points").notNull(),
  doublePointsCount: integer("double_points_count").notNull(),
  birthdayCreditCents: integer("birthday_credit_cents").notNull(),
});

export const venue = pgTable("venue", {
  id: id(),
  tenantId: tenantId(),
  programmeId: uuid("programme_id").notNull().references(() => programme.id),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull().default(""),
  town: text("town").notNull().default(""),
  brandColor: text("brand_color").notNull().default("#1f4d3a"),
  vatNumber: text("vat_number").notNull().default(""),
  timezone: text("timezone").notNull().default("Europe/Dublin"),
  bookingMaxAdvanceDays: integer("booking_max_advance_days").notNull().default(31),
  /** Mark menu items sold out when an ingredient runs out. */
  autoSoldOut: boolean("auto_sold_out").notNull().default(false),
  paymentProvider: text("payment_provider", { enum: ["mock", "revolut", "mypos"] }).notNull().default("mock"),
  googlePlaceId: text("google_place_id"),
  /** setup: test mode while the venue gets ready; live: taking real orders; suspended: closed by the platform. */
  status: text("status", { enum: ["setup", "live", "suspended"] }).notNull().default("live"),
  kind: text("kind", { enum: ["bar", "restaurant", "hotel", "cafe"] }).notNull().default("bar"),
  liveAt: timestamp("live_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** A venue's connection to an outside service. Secrets are AES-GCM encrypted (packages/core/src/secrets.ts). */
export const venueIntegration = pgTable(
  "venue_integration",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    kind: text("kind", { enum: ["revolut", "mypos", "xero"] }).notNull(),
    config: jsonb("config").notNull().$type<Record<string, unknown>>(),
    secretEnc: text("secret_enc"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("venue_integration_kind").on(t.venueId, t.kind)],
);

export const venueTable = pgTable(
  "venue_table",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    number: integer("number").notNull(),
    qrToken: text("qr_token").notNull().unique(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("venue_table_number").on(t.venueId, t.number)],
);

export const staffUser = pgTable("staff_user", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "staff"] }).notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Set for invited staff with a temporary password: they choose their own on first sign-in. */
  mustChangePassword: boolean("must_change_password").notNull().default(false),
});

export const menuCategory = pgTable("menu_category", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const menuItem = pgTable("menu_item", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id),
  categoryId: uuid("category_id").notNull().references(() => menuCategory.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  vatRate: smallint("vat_rate").notNull().$type<9 | 23>(),
  station: text("station", { enum: ["bar", "kitchen"] }).notNull(),
  containsAlcohol: boolean("contains_alcohol").notNull().default(false),
  availableForCollect: boolean("available_for_collect").notNull().default(false),
  active: boolean("active").notNull().default(true),
  soldOut: boolean("sold_out").notNull().default(false),
  /** Sold out because stock ran out (not by staff): comes back automatically after a delivery or count. */
  soldOutByStock: boolean("sold_out_by_stock").notNull().default(false),
  externalItemId: text("external_item_id"),
  sort: integer("sort").notNull().default(0),
});

export const customer = pgTable("customer", {
  id: id(),
  phone: text("phone").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  marketingConsent: boolean("marketing_consent").notNull().default(false),
  ageVerifiedAt: timestamp("age_verified_at", { withTimezone: true }),
  ageVerifiedByStaffId: uuid("age_verified_by_staff_id"),
  ageVerificationMethod: text("age_verification_method", { enum: ["staff_id_check", "digital_id"] }),
  ageDocumentType: text("age_document_type", { enum: ["age_card", "passport", "driving_licence"] }),
  createdAt: createdAt(),
});

export const otpCode = pgTable("otp_code", {
  phone: text("phone").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
});

export const membership = pgTable(
  "membership",
  {
    id: id(),
    tenantId: tenantId(),
    programmeId: uuid("programme_id").notNull().references(() => programme.id),
    customerId: uuid("customer_id").notNull().references(() => customer.id),
    referralCode: text("referral_code").notNull().unique(),
    referredByMembershipId: uuid("referred_by_membership_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("membership_programme_customer").on(t.programmeId, t.customerId)],
);

export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: id(),
    tenantId: tenantId(),
    membershipId: uuid("membership_id").notNull().references(() => membership.id),
    kind: text("kind", { enum: ["points", "credit", "double"] }).notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    orderId: uuid("order_id"),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_membership").on(t.membershipId)],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    number: serial("number").notNull(),
    channel: text("channel", { enum: ["table", "collect"] }).notNull(),
    tableId: uuid("table_id").references(() => venueTable.id),
    customerId: uuid("customer_id").notNull().references(() => customer.id),
    membershipId: uuid("membership_id").notNull().references(() => membership.id),
    status: text("status", { enum: ["pending_payment", "paid", "cancelled", "refunded"] }).notNull(),
    grossCents: integer("gross_cents").notNull(),
    vat9Cents: integer("vat9_cents").notNull(),
    vat23Cents: integer("vat23_cents").notNull(),
    creditUsedCents: integer("credit_used_cents").notNull().default(0),
    amountPaidCents: integer("amount_paid_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    useDouble: boolean("use_double").notNull().default(false),
    provider: text("provider").notNull(),
    providerOrderId: text("provider_order_id").unique(),
    providerToken: text("provider_token"),
    providerTxnRef: text("provider_txn_ref"),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    reviewClickedAt: timestamp("review_clicked_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("orders_venue_created").on(t.venueId, t.createdAt)],
);

export const orderLine = pgTable("order_line", {
  id: id(),
  tenantId: tenantId(),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  menuItemId: uuid("menu_item_id").notNull().references(() => menuItem.id),
  name: text("name").notNull(),
  qty: integer("qty").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  grossCents: integer("gross_cents").notNull(),
  vatRate: smallint("vat_rate").notNull().$type<9 | 23>(),
  vatCents: integer("vat_cents").notNull(),
  station: text("station", { enum: ["bar", "kitchen"] }).notNull(),
  containsAlcohol: boolean("contains_alcohol").notNull(),
});

export const docket = pgTable(
  "docket",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    station: text("station", { enum: ["bar", "kitchen"] }).notNull(),
    status: text("status", { enum: ["new", "in_progress", "ready", "done"] }).notNull().default("new"),
    idCheckRequired: boolean("id_check_required").notNull().default(false),
    idCheckedAt: timestamp("id_checked_at", { withTimezone: true }),
    idCheckedByStaffId: uuid("id_checked_by_staff_id"),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("docket_order_station").on(t.orderId, t.station), index("docket_venue_status").on(t.venueId, t.status)],
);

export const webhookEvent = pgTable("webhook_event", {
  id: id(),
  provider: text("provider").notNull(),
  event: text("event"),
  providerOrderId: text("provider_order_id"),
  raw: text("raw").notNull(),
  signatureValid: boolean("signature_valid").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One row per venue per trading day pushed to Xero, so the nightly job never posts a day twice. */
export const xeroSync = pgTable(
  "xero_sync",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    businessDate: date("business_date").notNull(),
    status: text("status", { enum: ["done", "nothing", "error"] }).notNull(),
    invoiceId: text("invoice_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("xero_sync_day").on(t.venueId, t.businessDate)],
);

/**
 * An AI assistant a guest has allowed to act for them at one venue. The token is shown
 * to the guest once; only its SHA-256 hash is stored.
 */
export const agentGrant = pgTable(
  "agent_grant",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    customerId: uuid("customer_id").notNull().references(() => customer.id),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    tokenHint: text("token_hint").notNull(),
    scopes: jsonb("scopes").notNull().$type<string[]>(),
    maxOrderCents: integer("max_order_cents").notNull(),
    maxCreditCents: integer("max_credit_cents").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("agent_grant_customer").on(t.customerId)],
);

/** Every request an AI assistant made, what was decided, and what happened. */
export const agentAction = pgTable(
  "agent_action",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    grantId: uuid("grant_id").notNull().references(() => agentGrant.id),
    customerId: uuid("customer_id").notNull(),
    tool: text("tool").notNull(),
    input: jsonb("input"),
    allowed: boolean("allowed").notNull(),
    reasons: jsonb("reasons").notNull().$type<string[]>(),
    outcome: text("outcome"),
    createdAt: createdAt(),
  },
  (t) => [index("agent_action_venue").on(t.venueId, t.createdAt), index("agent_action_grant").on(t.grantId)],
);

export const subscription = pgTable("subscription", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id).unique(),
  monthlyFeeCents: integer("monthly_fee_cents").notNull(),
  appFeeBps: integer("app_fee_bps").notNull().default(100),
  /** No subscription or app fee for months that end before this. Null: no trial. */
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
});

/** Platform-level: email codes for business sign-up. No tenant yet. */
export const signupCode = pgTable("signup_code", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: id(),
  tenantId: tenantId(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  detail: jsonb("detail"),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- push notifications (platform-level, like customer)

export const pushSubscription = pgTable("push_subscription", {
  id: id(),
  customerId: uuid("customer_id").notNull().references(() => customer.id),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- inventory
// Stock on hand is the sum of stock_movement, like loyalty balances. Quantities are integers in
// base units (ml, g or each); money is integer cents excluding VAT.

export const supplier = pgTable("supplier", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id),
  name: text("name").notNull(),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  createdAt: createdAt(),
});

export const stockItem = pgTable(
  "stock_item",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    name: text("name").notNull(),
    category: text("category").notNull().default(""),
    unit: text("unit", { enum: ["ml", "g", "each"] }).notNull(),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    /** What one pack holds, in base units (a 50 L keg = 50000 ml). */
    packSize: integer("pack_size").notNull(),
    packName: text("pack_name").notNull().default("pack"),
    /** Latest price paid per pack, excluding VAT. */
    packCostCents: integer("pack_cost_cents").notNull().default(0),
    /** Reorder when stock falls below this (base units). */
    parLevel: integer("par_level").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("stock_item_venue_name").on(t.venueId, t.name)],
);

export const recipeLine = pgTable(
  "recipe_line",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    menuItemId: uuid("menu_item_id").notNull().references(() => menuItem.id),
    stockItemId: uuid("stock_item_id").notNull().references(() => stockItem.id),
    qty: integer("qty").notNull(),
  },
  (t) => [uniqueIndex("recipe_line_item_stock").on(t.menuItemId, t.stockItemId)],
);

export const stockMovement = pgTable(
  "stock_movement",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    stockItemId: uuid("stock_item_id").notNull().references(() => stockItem.id),
    kind: text("kind", { enum: ["delivery", "sale", "till_sale", "refund", "waste", "count"] }).notNull(),
    /** Signed base units: deliveries add, sales and waste take away, counts correct. */
    qty: integer("qty").notNull(),
    /** Signed value at cost when it happened (excl. VAT). */
    costCents: integer("cost_cents").notNull(),
    reason: text("reason"),
    orderId: uuid("order_id"),
    menuItemId: uuid("menu_item_id"),
    /** Delivery, count or till import this belongs to. */
    refId: uuid("ref_id"),
    staffId: uuid("staff_id"),
    createdAt: createdAt(),
  },
  (t) => [index("stock_movement_venue_time").on(t.venueId, t.createdAt), index("stock_movement_item").on(t.stockItemId), index("stock_movement_ref").on(t.refId)],
);

export const delivery = pgTable("delivery", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id),
  supplierId: uuid("supplier_id").references(() => supplier.id),
  purchaseOrderId: uuid("purchase_order_id"),
  reference: text("reference").notNull().default(""),
  totalCents: integer("total_cents").notNull(),
  staffId: uuid("staff_id"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockCount = pgTable("stock_count", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id),
  staffId: uuid("staff_id"),
  /** Per item: expected (from the ledger), counted, difference at cost. */
  lines: jsonb("lines").notNull().$type<{ stockItemId: string; name: string; unit: string; expected: number; counted: number; diffCents: number }[]>(),
  valueCents: integer("value_cents").notNull(),
  varianceCents: integer("variance_cents").notNull(),
  countedAt: timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const purchaseOrder = pgTable("purchase_order", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id),
  supplierId: uuid("supplier_id").notNull().references(() => supplier.id),
  status: text("status", { enum: ["draft", "sent", "received", "cancelled"] }).notNull().default("draft"),
  lines: jsonb("lines").notNull().$type<{ stockItemId: string; name: string; packs: number; packName: string; packCostCents: number }[]>(),
  totalCents: integer("total_cents").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const tillImport = pgTable(
  "till_import",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    businessDate: date("business_date").notNull(),
    lines: jsonb("lines").notNull().$type<{ name: string; qty: number; menuItemId: string | null }[]>(),
    staffId: uuid("staff_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("till_import_venue_date").on(t.venueId, t.businessDate)],
);

export const TENANT_TABLES = [
  "supplier",
  "stock_item",
  "recipe_line",
  "stock_movement",
  "delivery",
  "stock_count",
  "purchase_order",
  "till_import",
  "programme",
  "programme_level",
  "venue",
  "venue_table",
  "staff_user",
  "menu_category",
  "menu_item",
  "membership",
  "loyalty_ledger",
  "orders",
  "order_line",
  "docket",
  "subscription",
  "audit_log",
  "venue_integration",
  "xero_sync",
  "agent_grant",
  "agent_action",
] as const;
