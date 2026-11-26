import { describe, expect, it, vi } from "vitest";
import {
  checkCustom, cleanLeaderboardName, cleanMessage, eventPost, gamesPost, looksLikeDrinksPromo, metaPages, networkPost, newItemPost, pickLocation,
  postFacebook, postInstagram, rankRows, revolutLink, settleUp, splitByItems, splitEqual, spotifyLink,
} from "./index";

describe("splitting a bill", () => {
  it("splits equally with the leftover cents to the first people", () => {
    expect(splitEqual(1000, 3)).toEqual([334, 333, 333]);
    expect(splitEqual(1000, 3).reduce((a, b) => a + b)).toBe(1000);
    expect(() => splitEqual(0, 2)).toThrow();
  });

  it("splits by item: claimed lines to whoever had them, shared ones equally, unclaimed by everyone", () => {
    const lines = [{ id: "a", cents: 1600 }, { id: "b", cents: 900 }, { id: "c", cents: 1000 }];
    const r = splitByItems(lines, ["me", "x", "y"], { me: ["a"], x: ["b", "c"], y: ["c"] });
    expect(r).toEqual({ me: 1600, x: 900 + 500, y: 500 });
    const unclaimed = splitByItems(lines, ["me", "x"], {});
    expect(unclaimed.me + unclaimed.x).toBe(3500);
  });

  it("checks custom amounts add up exactly", () => {
    expect(checkCustom(2000, { a: 1500, b: 500 })).toEqual({ a: 1500, b: 500 });
    expect(() => checkCustom(2000, { a: 1500, b: 400 })).toThrow(/add up to €19.00, not €20.00/);
  });

  it("settles up in the fewest payments", () => {
    const rows = [
      { payer: "A", debtor: "B", cents: 1000, status: "owed" as const },
      { payer: "B", debtor: "A", cents: 400, status: "owed" as const },
      { payer: "A", debtor: "C", cents: 500, status: "owed" as const },
      { payer: "C", debtor: "B", cents: 500, status: "owed" as const },
      { payer: "A", debtor: "D", cents: 700, status: "paid" as const },
    ];
    expect(settleUp(rows)).toEqual([{ from: "B", to: "A", cents: 1100 }]);
  });

  it("makes Revolut links only from real handles", () => {
    expect(revolutLink("@niamhw")).toBe("https://revolut.me/niamhw");
    expect(revolutLink("https://revolut.me/niamhw")).toBe("https://revolut.me/niamhw");
    expect(revolutLink("javascript:alert(1)")).toBeNull();
  });
});

describe("chat, music and leaderboards", () => {
  it("keeps chat messages sane", () => {
    expect(cleanMessage("  hi\u0007 there ")).toBe("hi there");
    expect(() => cleanMessage("   ")).toThrow();
    expect(() => cleanMessage("x".repeat(1001))).toThrow();
  });

  it("accepts only open.spotify.com track, album and playlist links", () => {
    expect(spotifyLink("https://open.spotify.com/intl-en/track/4uLU6hMCjMI75M1A2tKUQC?si=abc")).toEqual({ kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC", url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC" });
    expect(spotifyLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")?.kind).toBe("playlist");
    expect(spotifyLink("https://evil.example/track/4uLU6hMCjMI75M1A2tKUQC")).toBeNull();
  });

  it("ranks with ties and hides zero scores", () => {
    const r = rankRows([{ score: 50, n: "a" }, { score: 80, n: "b" }, { score: 50, n: "c" }, { score: 0, n: "d" }]);
    expect(r.map((x) => [x.n, x.rank, x.tied])).toEqual([["b", 1, false], ["a", 2, true], ["c", 2, true]]);
  });

  it("only allows plain display names", () => {
    expect(cleanLeaderboardName("  Seán  Ó B ")).toBe("Seán Ó B");
    expect(() => cleanLeaderboardName("me@x.ie")).toThrow();
    expect(() => cleanLeaderboardName("https://x")).toThrow();
  });
});

describe("social posts", () => {
  const v = { name: "MJ O'Connor's", slug: "mj-oconnors", county: "Leitrim", timezone: "Europe/Dublin" };
  const start = new Date("2026-12-04T21:00:00Z");

  it("posts events some hours before, with county hashtags", () => {
    const p = eventPost(v, { id: "e1", title: "Trad session", details: "Bring your fiddle", start, kind: "music" }, "https://complete.pub", 6);
    expect(p.scheduledFor.toISOString()).toBe("2026-12-04T15:00:00.000Z");
    expect(p.text).toContain("🎶 Trad session at MJ O'Connor's");
    expect(p.text).toContain("#Leitrim #WhatsOn #LiveMusic");
    expect(p.needsApproval).toBe(false);
    expect(eventPost(v, { id: "e2", title: "Cheap pints all night", details: "", start, kind: "other" }, "x", 6).needsApproval).toBe(true);
  });

  it("never auto-posts drinks promotions or alcohol items", () => {
    for (const t of ["Happy hour 5-7", "2 for 1 cocktails", "€4 pints", "pints for €4", "free shots", "Bottomless brunch"]) expect(looksLikeDrinksPromo(t)).toBe(true);
    for (const t of ["Trad session", "Six Nations on the big screen", "New seafood chowder"]) expect(looksLikeDrinksPromo(t)).toBe(false);
    expect(newItemPost(v, { id: "i", name: "Craft IPA", description: "", containsAlcohol: true }, "x", start)).toBeNull();
    expect(newItemPost(v, { id: "i", name: "Seafood chowder", description: "With brown bread", containsAlcohol: false }, "x", start)?.text).toContain("New at MJ O'Connor's: Seafood chowder.");
  });

  it("round-ups need games or at least two venues", () => {
    expect(gamesPost(v, "2026-12-04", [], "x", start)).toBeNull();
    expect(networkPost("Leitrim", "2026-11-30", [{ venue: "A", slug: "a", title: "Quiz", start, tz: "Europe/Dublin" }], "x", start)).toBeNull();
    expect(networkPost("Leitrim", "2026-11-30", [{ venue: "A", slug: "a", title: "Quiz", start, tz: "Europe/Dublin" }, { venue: "B", slug: "b", title: "Trad", start, tz: "Europe/Dublin" }], "x", start)?.text).toContain("Out in Leitrim this week");
  });

  it("publishes to Facebook and to Instagram with co-host collaborators", async () => {
    const calls: { url: string; body: URLSearchParams }[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as URLSearchParams });
      return Response.json(url.endsWith("/media") ? { id: "container-1" } : url.endsWith("/media_publish") ? { id: "ig-1" } : { id: "photo", post_id: "fb-1" });
    }) as unknown as typeof fetch;
    const tgt = { pageId: "p1", pageToken: "tok", igUserId: "ig9" };
    expect(await postFacebook(tgt, { text: "Hi", imageUrl: "https://x/i.jpg" }, f)).toBe("fb-1");
    expect(calls[0].url).toBe("https://graph.facebook.com/v26.0/p1/photos");
    expect(await postInstagram(tgt, { text: "Hi", imageUrl: "https://x/i.jpg", collaborators: ["drumhierny"] }, f)).toBe("ig-1");
    expect(calls[1].body.get("collaborators")).toBe('["drumhierny"]');
    expect(calls[2].body.get("creation_id")).toBe("container-1");
  });

  it("lists Pages after the Facebook login and picks the one named like the venue", async () => {
    const f = vi.fn(async (url: string) => Response.json(url.includes("/me/accounts") ? { data: [{ id: "1", name: "Other Bar", access_token: "a" }, { id: "2", name: "MJ O'Connors Pub", access_token: "b", instagram_business_account: { id: "ig2", username: "mjs" } }] } : { access_token: "t" })) as unknown as typeof fetch;
    const pages = await metaPages({ clientId: "c", clientSecret: "s", redirectUri: "r" }, "code", f);
    expect(pages[1]).toMatchObject({ pageId: "2", pageToken: "b", igUserId: "ig2", igUsername: "mjs" });
    expect(pickLocation(pages.map((p) => ({ location: p.pageId, title: p.pageName })), "MJ O'Connor's")?.location).toBe("2");
  });
});
