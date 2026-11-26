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
  /** List Ireland's top televised games each day in What's on. */
  autoSports: boolean("auto_sports").notNull().default(true),
  /** Share anonymised, aggregated sales with drinks brands (never guest data). */
  shareBrandInsights: boolean("share_brand_insights").notNull().default(false),
  /** Table bookings: seats bookable per 30-minute slot (0 = bookings off). */
  bookingSeatsPerSlot: integer("booking_seats_per_slot").notNull().default(0),
  /** Opening hours per station and weekday (0 = Sunday): [["12:00","23:30"], ...]. Null = always open. */
  hours: jsonb("hours").$type<{ bar?: ([string, string] | null)[]; kitchen?: ([string, string] | null)[] } | null>(),
  /** Staff paused new app orders for a station until this time (ISO). */
  pausedUntil: jsonb("paused_until").notNull().default({}).$type<{ bar?: string; kitchen?: string }>(),
  /** Offer a tip at app checkout (all of it goes to the staff). */
  tipsEnabled: boolean("tips_enabled").notNull().default(true),
  /** Sunday premium on top of the hourly rate (Organisation of Working Time Act); 0 if rates already include it. */
  sundayPremiumPct: integer("sunday_premium_pct").notNull().default(0),
  /** The venue's Fantasy Premier League mini-league invite code; guests join via /v/{slug}/fpl. */
  fplCode: text("fpl_code"),
  fplClicks: integer("fpl_clicks").notNull().default(0),
  paymentProvider: text("payment_provider", { enum: ["mock", "revolut", "mypos"] }).notNull().default("mock"),
  googlePlaceId: text("google_place_id"),
  /** setup: test mode while the venue gets ready; live: taking real orders; suspended: closed by the platform. */
  status: text("status", { enum: ["setup", "live", "suspended"] }).notNull().default("live"),
  kind: text("kind", { enum: ["bar", "restaurant", "hotel", "cafe"] }).notNull().default("bar"),
  /** for county and country leaderboards and network posts */
  county: text("county"),
  country: text("country").notNull().default("IE"),
  /** happy to be featured in Complete's own network posts and cross-promotion */
  shareNetwork: boolean("share_network").notNull().default(false),
  /** guests in group sessions can send song requests to the staff Music list */
  songRequests: boolean("song_requests").notNull().default(true),
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
    kind: text("kind", { enum: ["revolut", "mypos", "xero", "delivery", "pms", "sage", "payroll", "deel", "bizimply", "meta", "google_business", "social", "homeassistant", "lifx", "controls_webhook"] }).notNull(),
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
  /** Pay per hour (cents) for labour cost and payroll export. */
  hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
  /** The employee's number in the payroll package (BrightPay, Thesaurus, Sage), for exports. */
  payrollRef: text("payroll_ref").notNull().default(""),
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
  /** EU allergens (FIC 1169/2011) this item contains. */
  allergens: jsonb("allergens").notNull().default([]).$type<string[]>(),
  availableForCollect: boolean("available_for_collect").notNull().default(false),
  active: boolean("active").notNull().default(true),
  soldOut: boolean("sold_out").notNull().default(false),
  /** Sold out because stock ran out (not by staff): comes back automatically after a delivery or count. */
  soldOutByStock: boolean("sold_out_by_stock").notNull().default(false),
  externalItemId: text("external_item_id"),
  sort: integer("sort").notNull().default(0),
  createdAt: createdAt(),
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
  /** Set when the guest deleted their account: personal details are wiped, orders kept for VAT records. */
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  /** Opted in to public leaderboards, shown under this name (never their real name unless they type it) */
  leaderboardOptIn: boolean("leaderboard_opt_in").notNull().default(false),
  leaderboardName: text("leaderboard_name"),
  /** revolut.me handle, so friends can settle a split by Revolut */
  revolutHandle: text("revolut_handle"),
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
    /** counter = rung up on the till by staff (no guest account, earns no loyalty). */
    channel: text("channel", { enum: ["table", "collect", "counter", "delivery"] }).notNull(),
    /** Hotel room the bill was charged to, and the delivery platform an order came from. */
    roomNumber: text("room_number"),
    externalRef: text("external_ref"),
    tableId: uuid("table_id").references(() => venueTable.id),
    customerId: uuid("customer_id").references(() => customer.id),
    membershipId: uuid("membership_id").references(() => membership.id),
    /** Who rang up a till sale. */
    staffId: uuid("staff_id"),
    /** Table number food from the till goes to. */
    tableNumber: integer("table_number"),
    /** open = rung up on a till tab, not paid yet. */
    status: text("status", { enum: ["pending_payment", "open", "paid", "cancelled", "refunded"] }).notNull(),
    /** Tip for the staff (in amount_paid, outside VAT, loyalty and the app fee). */
    tipCents: integer("tip_cents").notNull().default(0),
    /** The non-alcohol part paid by card: the only part that earns points or counts towards levels (Irish law). */
    rewardableCents: integer("rewardable_cents").notNull().default(0),
    /** Discount or comp given at the till, with the reason. */
    discountCents: integer("discount_cents").notNull().default(0),
    discountReason: text("discount_reason"),
    tabId: uuid("tab_id"),
    /** placed during a group session, so the group sees its orders together */
    sessionId: uuid("session_id"),
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
  /** The guest's note for the kitchen or bar ("no onions"). */
  note: text("note"),
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
    /** which system the day (or pay period, keyed by its first day) was sent to */
    target: text("target", { enum: ["xero", "sage", "payroll", "deel", "bizimply"] }).notNull().default("xero"),
    businessDate: date("business_date").notNull(),
    status: text("status", { enum: ["done", "nothing", "error"] }).notNull(),
    invoiceId: text("invoice_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("xero_sync_day").on(t.venueId, t.target, t.businessDate)],
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

// ---------------------------------------------------------------- what's on

export const venueEvent = pgTable(
  "venue_event",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    kind: text("kind", { enum: ["music", "sport", "quiz", "comedy", "other"] }).notNull(),
    title: text("title").notNull(),
    details: text("details").notNull().default(""),
    where: text("where").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMins: integer("duration_mins").notNull().default(120),
    repeatWeekly: boolean("repeat_weekly").notNull().default(false),
    repeatUntil: date("repeat_until"),
    coverCents: integer("cover_cents").notNull().default(0),
    /** co-hosted with another venue on Complete: posted to both venues' social accounts */
    partnerVenueId: uuid("partner_venue_id"),
    createdAt: createdAt(),
  },
  (t) => [index("venue_event_venue").on(t.venueId, t.startsAt)],
);

/** Platform-level: the day's top televised games for Irish pubs (from the fixtures feed, ranked). */
export const sportFixture = pgTable(
  "sport_fixture",
  {
    id: id(),
    externalId: text("external_id").notNull().unique(),
    sport: text("sport").notNull(),
    league: text("league").notNull(),
    home: text("home").notNull(),
    away: text("away").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMins: integer("duration_mins").notNull().default(120),
    score: integer("score").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sport_fixture_time").on(t.startsAt)],
);

// ---------------------------------------------------------------- bookings, shifts

export const booking = pgTable(
  "booking",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    customerId: uuid("customer_id").notNull().references(() => customer.id),
    partySize: integer("party_size").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    /** "Book for Ireland v France": the What's on occurrence key. */
    eventKey: text("event_key"),
    eventTitle: text("event_title"),
    note: text("note").notNull().default(""),
    status: text("status", { enum: ["confirmed", "seated", "no_show", "cancelled"] }).notNull().default("confirmed"),
    createdAt: createdAt(),
  },
  (t) => [index("booking_venue_time").on(t.venueId, t.startsAt)],
);

export const staffShift = pgTable(
  "staff_shift",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    staffId: uuid("staff_id").notNull().references(() => staffUser.id),
    clockIn: timestamp("clock_in", { withTimezone: true }).notNull().defaultNow(),
    clockOut: timestamp("clock_out", { withTimezone: true }),
    /** Pay rate when the shift was worked. */
    hourlyRateCents: integer("hourly_rate_cents").notNull(),
  },
  (t) => [index("staff_shift_venue").on(t.venueId, t.clockIn)],
);

// ---------------------------------------------------------------- till tabs and cash-up

export const tab = pgTable(
  "tab",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    name: text("name").notNull(),
    tableNumber: integer("table_number"),
    openedBy: uuid("opened_by"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    method: text("method"),
  },
  (t) => [index("tab_venue_open").on(t.venueId, t.closedAt)],
);

export const cashUp = pgTable("cash_up", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id),
  businessDate: date("business_date").notNull(),
  staffId: uuid("staff_id"),
  floatCents: integer("float_cents").notNull(),
  expectedCents: integer("expected_cents").notNull(),
  countedCents: integer("counted_cents").notNull(),
  varianceCents: integer("variance_cents").notNull(),
  note: text("note").notNull().default(""),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- rota

export const rotaShift = pgTable(
  "rota_shift",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    staffId: uuid("staff_id").notNull().references(() => staffUser.id),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    role: text("role", { enum: ["bar", "floor", "kitchen", "manager", "other"] }).notNull().default("bar"),
    note: text("note").notNull().default(""),
    published: boolean("published").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("rota_shift_venue_time").on(t.venueId, t.startsAt)],
);

export const staffUnavailable = pgTable(
  "staff_unavailable",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    staffId: uuid("staff_id").notNull().references(() => staffUser.id),
    date: date("date").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [uniqueIndex("staff_unavailable_day").on(t.staffId, t.date)],
);

// ---------------------------------------------------------------- running at scale

/** Shared rate limits (fixed windows), so every app instance counts the same attempts. Not tenant data. */
export const rateBucket = pgTable("rate_bucket", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  hits: integer("hits").notNull(),
});

/** Every email Complete sends: sent at once where possible, retried with back-off when the mail server fails. */
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    /** stops the same email (a nudge, an alert, an invoice) going twice */
    dedupeKey: text("dedupe_key"),
    to: text("to").notNull(),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    html: text("html"),
    replyTo: text("reply_to"),
    attachments: jsonb("attachments").$type<{ filename: string; content: string; contentType: string }[]>(),
    status: text("status", { enum: ["pending", "sent", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("email_outbox_dedupe").on(t.dedupeKey), index("email_outbox_due").on(t.status, t.nextAttemptAt)],
);

/** Server errors, grouped by fingerprint, for the operator console. */
export const appError = pgTable("app_error", {
  fingerprint: text("fingerprint").primaryKey(),
  message: text("message").notNull(),
  context: text("context").notNull().default(""),
  stack: text("stack").notNull().default(""),
  count: integer("count").notNull().default(1),
  firstAt: timestamp("first_at", { withTimezone: true }).notNull().defaultNow(),
  lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One-time links for staff: invitations (set your password) and password resets. Only the SHA-256 is stored. */
export const staffToken = pgTable("staff_token", {
  id: id(),
  staffId: uuid("staff_id").notNull().references(() => staffUser.id),
  tokenHash: text("token_hash").notNull().unique(),
  purpose: text("purpose", { enum: ["invite", "reset"] }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Problems a venue should know about (failed syncs, stuck payments), raised and cleared automatically. */
export const venueAlert = pgTable(
  "venue_alert",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    key: text("key").notNull(),
    severity: text("severity", { enum: ["warn", "error"] }).notNull().default("warn"),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    href: text("href").notNull().default(""),
    firstAt: timestamp("first_at", { withTimezone: true }).notNull().defaultNow(),
    lastAt: timestamp("last_at", { withTimezone: true }).notNull().defaultNow(),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("venue_alert_key").on(t.venueId, t.key)],
);

/** Complete's monthly invoice to a venue: subscription plus the app fee, computed from Complete's own orders. */
export const billingInvoice = pgTable(
  "billing_invoice",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    period: text("period").notNull(), // YYYY-MM
    number: text("number").notNull(),
    statement: jsonb("statement").notNull(),
    totalCents: integer("total_cents").notNull(),
    status: text("status", { enum: ["issued", "paid", "void"] }).notNull().default("issued"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("billing_invoice_period").on(t.venueId, t.period)],
);

// ---------------------------------------------------------------- groups, sessions, splits (guest-level, across venues)

/** A group of guests (friends, a team, a hen party). Not venue data: members are checked in the service layer. */
export const guestGroup = pgTable("guest_group", {
  id: id(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  createdBy: uuid("created_by").notNull().references(() => customer.id),
  /** a personal Spotify playlist the group shares (a link only: Spotify can't be used to play music in venues) */
  playlistUrl: text("playlist_url"),
  createdAt: createdAt(),
});

export const groupMember = pgTable(
  "group_member",
  {
    id: id(),
    groupId: uuid("group_id").notNull().references(() => guestGroup.id),
    customerId: uuid("customer_id").notNull().references(() => customer.id),
    role: text("role", { enum: ["owner", "member"] }).notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("group_member_unique").on(t.groupId, t.customerId)],
);

export const groupMessage = pgTable(
  "group_message",
  {
    id: id(),
    groupId: uuid("group_id").notNull().references(() => guestGroup.id),
    customerId: uuid("customer_id").references(() => customer.id),
    kind: text("kind", { enum: ["text", "system", "song"] }).notNull().default("text"),
    body: text("body").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("group_message_group").on(t.groupId, t.createdAt)],
);

/** A night out at a venue (session, now) or a planned party, for one group. */
export const groupSession = pgTable(
  "group_session",
  {
    id: id(),
    groupId: uuid("group_id").notNull().references(() => guestGroup.id),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    kind: text("kind", { enum: ["session", "party"] }).notNull(),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    bookingId: uuid("booking_id"),
    createdBy: uuid("created_by").notNull().references(() => customer.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("group_session_group").on(t.groupId, t.startsAt)],
);

export const sessionRsvp = pgTable(
  "session_rsvp",
  {
    sessionId: uuid("session_id").notNull().references(() => groupSession.id),
    customerId: uuid("customer_id").notNull().references(() => customer.id),
    answer: text("answer", { enum: ["going", "maybe", "no"] }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("session_rsvp_unique").on(t.sessionId, t.customerId)],
);

/** A song a group asks the venue to play. Staff see these on the Music list and play them on their own licensed system. */
export const songRequest = pgTable(
  "song_request",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    sessionId: uuid("session_id"),
    customerId: uuid("customer_id"),
    title: text("title").notNull(),
    link: text("link"),
    status: text("status", { enum: ["requested", "played", "declined"] }).notNull().default("requested"),
    createdAt: createdAt(),
  },
  (t) => [index("song_request_venue").on(t.venueId, t.createdAt)],
);

/**
 * A shared cost split between group members, like a group bill: someone paid (an app order,
 * tickets, a taxi) and the others owe their share. Money never moves through Complete:
 * shares are settled between friends (Revolut link or marked paid). Balances are sums of shares.
 */
export const billSplit = pgTable("bill_split", {
  id: id(),
  groupId: uuid("group_id").notNull().references(() => guestGroup.id),
  sessionId: uuid("session_id"),
  venueId: uuid("venue_id"),
  orderId: uuid("order_id"),
  title: text("title").notNull(),
  /** who paid the bill in the first place */
  paidBy: uuid("paid_by").notNull().references(() => customer.id),
  totalCents: integer("total_cents").notNull(),
  method: text("method", { enum: ["equal", "items", "custom"] }).notNull(),
  /** bill lines (from the order, or typed in: tickets, deposits), for splitting by item */
  lines: jsonb("lines").$type<{ id: string; name: string; cents: number; ticket?: boolean }[]>().notNull().default([]),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const billShare = pgTable(
  "bill_share",
  {
    id: id(),
    splitId: uuid("split_id").notNull().references(() => billSplit.id),
    customerId: uuid("customer_id").notNull().references(() => customer.id),
    amountCents: integer("amount_cents").notNull(),
    /** line ids this person had, when split by item */
    lineIds: jsonb("line_ids").$type<string[]>().notNull().default([]),
    status: text("status", { enum: ["owed", "paid", "covered"] }).notNull().default("owed"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("bill_share_unique").on(t.splitId, t.customerId)],
);

// ---------------------------------------------------------------- social media

/** A post for a venue's social accounts (or Complete's network accounts when venueId is null). */
export const socialPost = pgTable(
  "social_post",
  {
    id: id(),
    tenantId: uuid("tenant_id"),
    venueId: uuid("venue_id"),
    /** what made it: event:{id}:{date}, games:{date}, weekly:{week}, item:{id}, network:{county}:{week}, manual */
    sourceKey: text("source_key").notNull(),
    channels: jsonb("channels").$type<("facebook" | "instagram" | "google")[]>().notNull(),
    text: text("text").notNull(),
    link: text("link"),
    /** Instagram handles of co-hosting venues (collaborators) */
    collaborators: jsonb("collaborators").$type<string[]>().notNull().default([]),
    imageTitle: text("image_title").notNull().default(""),
    imageSubtitle: text("image_subtitle").notNull().default(""),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["draft", "approved", "posted", "failed", "skipped"] }).notNull().default("draft"),
    results: jsonb("results").$type<Record<string, string>>().notNull().default({}),
    error: text("error"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("social_post_source").on(t.venueId, t.sourceKey), index("social_post_due").on(t.status, t.scheduledFor)],
);

// ---------------------------------------------------------------- venue controls (music, lighting, HVAC)

/** A light, heating/cooling unit, music player, switch or scene found through the venue's control system. */
export const venueDevice = pgTable(
  "venue_device",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    provider: text("provider", { enum: ["homeassistant", "lifx", "webhook"] }).notNull(),
    externalId: text("external_id").notNull(),
    kind: text("kind", { enum: ["light", "climate", "media", "switch", "scene"] }).notNull(),
    name: text("name").notNull(),
    zone: text("zone").notNull().default(""),
    /** shown on the staff Controls screen at all */
    enabled: boolean("enabled").notNull().default(false),
    /** staff (not only managers) may use it */
    staffAllowed: boolean("staff_allowed").notNull().default(false),
    /** heating/cooling limits staff can't go past, in °C */
    minTemp: integer("min_temp").notNull().default(17),
    maxTemp: integer("max_temp").notNull().default(24),
    /** music volume ceiling staff can't go past, 0-100 */
    maxVolume: integer("max_volume").notNull().default(80),
    missingSince: timestamp("missing_since", { withTimezone: true }),
    sort: integer("sort").notNull().default(0),
  },
  (t) => [uniqueIndex("venue_device_ext").on(t.venueId, t.provider, t.externalId)],
);

/** A saved set of device settings ("Opening", "Match on", "Closing"), optionally run on a schedule. */
export const venueScene = pgTable("venue_scene", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id),
  name: text("name").notNull(),
  steps: jsonb("steps").$type<{ deviceId: string; action: string; value?: number | string }[]>().notNull().default([]),
  /** weekdays (0 = Sunday) and local time to run it, if scheduled */
  days: jsonb("days").$type<number[]>().notNull().default([]),
  at: text("at"),
  staffAllowed: boolean("staff_allowed").notNull().default(true),
  createdAt: createdAt(),
});

/** Every control action: who, what, and whether the system accepted it. */
export const controlLog = pgTable(
  "control_log",
  {
    id: id(),
    tenantId: tenantId(),
    venueId: uuid("venue_id").notNull().references(() => venue.id),
    actor: text("actor").notNull(),
    deviceId: uuid("device_id"),
    sceneId: uuid("scene_id"),
    action: text("action").notNull(),
    value: text("value"),
    ok: boolean("ok").notNull(),
    error: text("error"),
    /** scheduled scene runs: scene:{id}:{date}:{time}, run once */
    runKey: text("run_key"),
    createdAt: createdAt(),
  },
  (t) => [index("control_log_venue").on(t.venueId, t.createdAt), uniqueIndex("control_log_run").on(t.runKey)],
);

export const TENANT_TABLES = [
  "venue_device",
  "venue_scene",
  "control_log",
  "song_request",
  "venue_alert",
  "billing_invoice",
  "rota_shift",
  "staff_unavailable",
  "tab",
  "cash_up",
  "booking",
  "staff_shift",
  "venue_event",
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
