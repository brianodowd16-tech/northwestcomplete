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
  createdAt: createdAt(),
});

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

export const subscription = pgTable("subscription", {
  id: id(),
  tenantId: tenantId(),
  venueId: uuid("venue_id").notNull().references(() => venue.id).unique(),
  monthlyFeeCents: integer("monthly_fee_cents").notNull(),
  appFeeBps: integer("app_fee_bps").notNull().default(100),
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

export const TENANT_TABLES = [
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
] as const;
