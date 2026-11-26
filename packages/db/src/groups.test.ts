import { MockProvider } from "@round/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as g from "./groups";
import { eq } from "drizzle-orm";
import { pool, systemDb } from "./index";
import * as t from "./schema";
import { exportGuestData, deleteGuest } from "./privacy";
import { seed } from "./seed";
import * as svc from "./services";
import { resetDatabase } from "./setup";
import * as social from "./social";
import { saveIntegration } from "./integrations";
import { randomBytes } from "node:crypto";
import { saveEvent, setEventPartner } from "./events";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://round:round@localhost:5432/round_test";
const provider = new MockProvider();
const KEY = randomBytes(32).toString("base64");
let mj: svc.Venue, drum: svc.Venue;
let a: svc.Customer, b: svc.Customer, c: svc.Customer;

beforeAll(async () => {
  await seed(await resetDatabase());
  mj = await svc.venueBySlug("mj-oconnors");
  drum = await svc.venueBySlug("drumhierny");
  const mk = (phone: string, name: string) => svc.createCustomer({ phone, name, email: `${phone}@x.ie`, dateOfBirth: "1990-01-01", marketingConsent: false });
  [a, b, c] = [await mk("+353871110001", "Niamh Walsh"), await mk("+353871110002", "Seán Kelly"), await mk("+353871110003", "Aoife Byrne")];
});
afterAll(() => pool().end());

async function item(v: svc.Venue, name: string) {
  return (await svc.menu(v)).flatMap((x) => x.items).find((i) => i.name === name)!.id;
}
async function paidOrder(v: svc.Venue, who: svc.Customer, lines: [string, number][]) {
  const { order } = await svc.createOrder({ venue: v, customer: who, channel: "collect", tableId: null, lines: await Promise.all(lines.map(async ([n, q]) => ({ menuItemId: await item(v, n), qty: q }))), creditRequestedCents: 0, useDouble: false, idempotencyKey: `k-${Math.random()}`, appUrl: "https://app.test" }, provider);
  const { rawBody, headers } = provider.simulatePayment(order.providerOrderId!);
  await svc.handleWebhook(provider, rawBody, headers);
  return order;
}

let groupId = "";
describe("groups and chat", () => {
  it("creates, invites, joins, chats and reports", async () => {
    const grp = await g.createGroup(a, "Friday crew");
    groupId = grp.id;
    expect(await g.groupInvite(grp.inviteCode)).toMatchObject({ name: "Friday crew", members: 1 });
    await g.joinGroup(b, grp.inviteCode);
    await g.joinGroup(c, grp.inviteCode);
    await g.postMessage(b, grp.id, "Pints at 8? https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC");
    const msgs = await g.messages(grp.id, a.id);
    expect(msgs.map((m) => m.kind)).toEqual(["system", "system", "system", "song"]);
    expect(msgs.at(-1)).toMatchObject({ from: "Seán K.", mine: false });
    await g.reportMessage(a, msgs.at(-1)!.id);
    expect((await g.messages(grp.id, c.id)).some((m) => m.body.startsWith("Pints"))).toBe(false);
    const d = await g.groupDetail(grp.id, a.id);
    expect(d.members.map((m) => m.name)).toEqual(["Niamh W.", "Seán K.", "Aoife B."]);
    expect(JSON.stringify(d)).not.toContain("+3538711");
  });

  it("keeps outsiders out and lets the owner remove someone (the link changes)", async () => {
    const outsider = await svc.createCustomer({ phone: "+353871110009", name: "Out Sider", email: "o@x.ie", dateOfBirth: "1990-01-01", marketingConsent: false });
    await expect(g.messages(groupId, outsider.id)).rejects.toThrow(/not found/);
    await expect(g.postMessage(outsider, groupId, "hi")).rejects.toThrow(/not found/);
    const before = (await g.groupDetail(groupId, a.id)).inviteCode;
    await g.joinGroup(outsider, before);
    await expect(g.removeMember(b, groupId, outsider.id)).rejects.toThrow(/owner/);
    await g.removeMember(a, groupId, outsider.id);
    expect((await g.groupDetail(groupId, a.id)).inviteCode).not.toBe(before);
    await expect(g.joinGroup(outsider, before)).rejects.toThrow(/doesn't work/);
  });
});

describe("nights out and song requests", () => {
  it("groups the members' orders under tonight's session", async () => {
    const s = await g.createSession(a, groupId, { venueSlug: "mj-oconnors", kind: "session" });
    expect((await g.liveSessionFor(b.id, mj.id))?.id).toBe(s.id);
    expect(await g.liveSessionFor(b.id, drum.id)).toBeNull();
    const o = await paidOrder(mj, b, [["Soft drink", 2]]);
    await g.tagOrderSession(mj, o.id, s.id);
    await g.rsvp(c, s.id, "maybe");
    const [ses] = await g.groupSessions(groupId, a.id);
    expect(ses).toMatchObject({ live: true, venue: { slug: "mj-oconnors" } });
    expect(ses.orders.map((x) => x.who)).toEqual(["Seán K."]);
    expect(ses.rsvps.map((r) => r.answer).sort()).toEqual(["going", "maybe"]);
  });

  it("sends song requests to the staff list, three per half hour, only where the venue allows", async () => {
    const [ses] = await g.groupSessions(groupId, a.id);
    await g.requestSong(a, ses.id, { title: "Galway Girl", link: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" });
    await g.requestSong(a, ses.id, { title: "The Rare Ould Times" });
    await g.requestSong(a, ses.id, { title: "Whiskey in the Jar" });
    await expect(g.requestSong(a, ses.id, { title: "One more" })).rejects.toThrow(/Three requests/);
    await expect(g.requestSong(b, ses.id, { title: "x", link: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M" })).rejects.toThrow(/song link/);
    const [staff] = await systemDb().select().from(t.staffUser).where(eq(t.staffUser.venueId, mj.id));
    const list = await g.songRequests(staff);
    expect(list.map((s) => s.title)).toContain("Galway Girl");
    await g.setSongStatus(staff, list[0].id, "played");
    await g.saveVenueCommunity(mj, { songRequests: false });
    await expect(g.requestSong(b, ses.id, { title: "Zombie" })).rejects.toThrow(/isn't taking song requests/);
    await g.saveVenueCommunity(mj, { songRequests: true });
  });
});

describe("sharing costs", () => {
  it("splits an order by item and settles up, with cover and reminders", async () => {
    const o = await paidOrder(mj, a, [["Soft drink", 1], ["Flat white", 2]]);
    const [mine] = await g.recentOrdersToSplit(a.id);
    expect(mine.id).toBe(o.id);
    const soft = mine.lines.find((l) => l.name.includes("Soft drink"))!;
    const split = await g.createSplit(a, groupId, { title: "Coffees", method: "items", people: [a.id, b.id, c.id], orderId: o.id, claims: { [b.id]: [soft.id] } });
    let money = await g.groupMoney(groupId, b.id);
    const s = money.splits.find((x) => x.id === split.id)!;
    expect(s.shares.reduce((t, x) => t + x.cents, 0)).toBe(o.amountPaidCents);
    expect(s.shares.find((x) => x.me)!.cents).toBeGreaterThan(s.shares.find((x) => x.name === "Aoife B.")!.cents);
    const bShare = s.shares.find((x) => x.me)!, cShare = s.shares.find((x) => x.name === "Aoife B.")!;
    expect(money.settle.find((x) => x.iOwe)).toMatchObject({ to: "Niamh W.", cents: bShare.cents });
    await g.remindShare(a, bShare.id);
    await expect(g.remindShare(a, bShare.id)).rejects.toThrow(/12 hours/);
    await expect(g.coverShare(b, cShare.id)).rejects.toThrow(/Only the person who paid/);
    await g.coverShare(a, cShare.id);
    await g.markSharePaid(b, bShare.id);
    money = await g.groupMoney(groupId, a.id);
    expect(money.settle).toEqual([]);
  });

  it("splits a custom bill with tickets, by amount, and checks the total", async () => {
    await expect(g.createSplit(a, groupId, { title: "Gig", method: "custom", people: [a.id, b.id], lines: [{ name: "Tickets × 2", cents: 6000, ticket: true }], amounts: { [a.id]: 3000, [b.id]: 2000 } })).rejects.toThrow(/add up/);
    const sp = await g.createSplit(b, groupId, { title: "Gig", method: "custom", people: [a.id, b.id], lines: [{ name: "Tickets × 2", cents: 6000, ticket: true }], amounts: { [a.id]: 3500, [b.id]: 2500 } });
    const money = await g.groupMoney(groupId, a.id);
    expect(money.splits.find((x) => x.id === sp.id)!.lines[0]).toMatchObject({ ticket: true });
    expect(money.settle).toEqual([{ from: "Niamh W.", to: "Seán K.", cents: 3500, iOwe: true, owedToMe: false, payUrl: null }]);
    await g.setGuestSocial(b, { revolutHandle: "seank" });
    expect((await g.groupMoney(groupId, a.id)).settle[0].payUrl).toBe("https://revolut.me/seank");
    await expect(g.createSplit(a, groupId, { title: "x", method: "equal", people: [a.id, "00000000-0000-0000-0000-000000000000"], totalCents: 100 })).rejects.toThrow(/in the group/);
  });
});

describe("leaderboards", () => {
  it("ranks opted-in guests by points and by non-alcohol spend only", async () => {
    await paidOrder(mj, c, [["Pint of stout", 3]]); // alcohol: no points, no leaderboard spend
    await paidOrder(mj, c, [["Soft drink", 1]]);
    await g.setGuestSocial(c, { leaderboardOptIn: true, leaderboardName: "Aoife B" });
    const spend = await g.leaderboard({ kind: "venue", slug: "mj-oconnors" }, "spend", "month", b.id);
    const soft = (await svc.menu(mj)).flatMap((x) => x.items).find((i) => i.name === "Soft drink")!.priceCents;
    expect(spend.rows.find((r) => r.name === "Aoife B")?.score).toBe(soft);
    expect(spend.rows.some((r) => r.name === "Seán Kelly" || r.name === "Seán K.")).toBe(false); // not opted in
    expect(spend.me).toMatchObject({ listed: false });
    const pts = await g.leaderboard({ kind: "country", country: "IE" }, "points", "all");
    expect(pts.rows.length).toBeGreaterThan(0);
    await g.saveVenueCommunity(mj, { county: "Leitrim" });
    expect((await g.leaderboard({ kind: "county", county: "Leitrim" }, "spend", "all")).rows.map((r) => r.name)).toContain("Aoife B");
    await expect(g.setGuestSocial(c, { leaderboardOptIn: true, leaderboardName: "x@y.ie" })).rejects.toThrow(/display name/);
  });
});

describe("social automation", () => {
  it("plans event posts for both co-hosts, waits for approval on drinks promos, and publishes due posts", async () => {
    await social.connectMeta(mj, { pageId: "p-mj", pageName: "MJ's", igUserId: "ig-mj", igUsername: "mjoconnors" }, "tok-mj", KEY);
    await social.connectMeta(drum, { pageId: "p-dr", pageName: "Drumhierny", igUserId: "ig-dr", igUsername: "drumhierny" }, "tok-dr", KEY);
    await social.saveSocialRules(mj, { autoPublish: true, eventHoursBefore: 6, games: false, weekly: false }, KEY);
    await social.saveSocialRules(drum, { autoPublish: true, eventHoursBefore: 6, games: false, weekly: false }, KEY);
    const soon = new Date(Date.now() + 3 * 3_600_000);
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: mj.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(soon).replace(" ", "T");
    const trad = await saveEvent(mj, { kind: "music", title: "Co-hosted session", details: "", where: "", startsLocal: local, durationMins: 120, repeatWeekly: false, repeatUntil: null, coverCents: 0 });
    await setEventPartner(mj, trad.id, drum.id);
    await saveEvent(mj, { kind: "other", title: "Happy hour 5 to 7", details: "", where: "", startsLocal: local, durationMins: 120, repeatWeekly: false, repeatUntil: null, coverCents: 0 });
    expect(await social.planVenuePosts(mj, "https://app.test")).toBeGreaterThanOrEqual(2);
    expect(await social.planVenuePosts(mj, "https://app.test")).toBe(0); // each source once
    await social.planVenuePosts(drum, "https://app.test");
    const mine = await social.venuePosts(mj);
    const tradPost = mine.find((p) => p.text.includes("Co-hosted session"))!;
    expect(tradPost).toMatchObject({ status: "approved", collaborators: ["drumhierny"], channels: ["facebook", "instagram"] });
    expect(mine.find((p) => p.text.includes("Happy hour"))!.status).toBe("draft");
    expect((await social.venuePosts(drum)).find((p) => p.text.includes("Co-hosted session"))!.collaborators).toEqual(["mjoconnors"]);
    const due = await social.duePosts(new Date(Date.now() + 4 * 3_600_000));
    expect(due.map((p) => p.id)).toContain(tradPost.id);
    expect(due.some((p) => p.text.includes("Happy hour"))).toBe(false);
    await social.markPost(tradPost.id, true, { facebook: "fb-1" }, null);
    expect((await social.postById(tradPost.id))!.status).toBe("posted");
    await expect(social.updateVenuePost(mj, tradPost.id, { text: "late edit" })).rejects.toThrow(/already gone out/);
    await expect(social.updateVenuePost(drum, mine.find((p) => p.text.includes("Happy hour"))!.id, { status: "approved" })).rejects.toThrow(/not found/);
  });
});

describe("guest data", () => {
  it("exports groups and wipes chat on deletion", async () => {
    const ex = await exportGuestData(b.id);
    expect(ex!.groups.map((x) => x.name)).toContain("Friday crew");
    expect(ex!.sharedBills.length).toBeGreaterThan(0);
    await deleteGuest(c.id);
    expect((await g.leaderboard({ kind: "venue", slug: "mj-oconnors" }, "spend", "all")).rows.some((r) => r.name === "Aoife B")).toBe(false);
    await expect(g.groupDetail(groupId, c.id)).rejects.toThrow(/not found/);
    void saveIntegration;
  });
});
