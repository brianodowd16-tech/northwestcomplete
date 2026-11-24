import type { XeroMapping } from "@round/core";
import { localDate, parseConfigPack } from "@round/core";
import { saveIntegration, saveXeroMapping, setGooglePlaceId, setPaymentProvider, syncXeroDay } from "@round/db/integrations";
import { saveRedemptionRules } from "@round/db/ai";
import { normaliseRules } from "@round/core";
import { venueBySlug } from "@round/db/services";
import { currentStaff, errorJson, json, secretsKey, xeroApp } from "@/lib/server";

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const staff = await currentStaff();
    const venue = await venueBySlug((await ctx.params).slug);
    if (!staff || staff.venueId !== venue.id || staff.role !== "admin") return json({ error: "Managers only" }, 403);
    const b = (await req.json()) as Record<string, unknown>;
    const key = secretsKey();

    switch (b.section) {
      case "payments": {
        const provider = b.provider === "mypos" || b.provider === "revolut" ? b.provider : "mock";
        if (provider === "mypos" && str(b.configPack)) {
          // The quickest route: myPOS's own configuration pack carries every value.
          if (!key) return json({ error: "SECRETS_KEY isn't set on the server, so keys can't be stored safely." }, 400);
          let c;
          try {
            c = parseConfigPack(str(b.configPack), b.mode === "live" ? "live" : "test");
          } catch (e) {
            return json({ error: (e as Error).message }, 400);
          }
          await saveIntegration(venue, "mypos", { sid: c.sid, walletNumber: c.walletNumber, keyIndex: c.keyIndex, mode: c.mode, myposCertPem: c.myposCertPem }, JSON.stringify({ privateKeyPem: c.privateKeyPem }), key);
        } else if (provider === "mypos") {
          if (!key) return json({ error: "SECRETS_KEY isn't set on the server, so keys can't be stored safely." }, 400);
          const cfg = { sid: str(b.sid), walletNumber: str(b.walletNumber), keyIndex: Number(b.keyIndex) || 1, mode: b.mode === "live" ? "live" : "test", myposCertPem: str(b.myposCertPem) };
          if (!cfg.sid || !cfg.walletNumber || !cfg.myposCertPem.includes("BEGIN")) return json({ error: "Fill in the store ID, wallet number and myPOS certificate." }, 400);
          const pk = str(b.privateKeyPem);
          if (pk && !pk.includes("PRIVATE KEY")) return json({ error: "That private key doesn't look like a PEM key." }, 400);
          await saveIntegration(venue, "mypos", cfg, pk ? JSON.stringify({ privateKeyPem: pk }) : null, key);
        }
        if (provider === "revolut") {
          if (!key) return json({ error: "SECRETS_KEY isn't set on the server, so keys can't be stored safely." }, 400);
          const secretKey = str(b.secretKey), webhookSecret = str(b.webhookSecret);
          await saveIntegration(
            venue,
            "revolut",
            { publicKey: str(b.publicKey), apiBase: str(b.apiBase) || "https://sandbox-merchant.revolut.com", apiVersion: "2024-09-01" },
            secretKey && webhookSecret ? JSON.stringify({ secretKey, webhookSecret }) : null,
            key,
          );
        }
        await setPaymentProvider(venue, provider);
        return json({ ok: true });
      }
      case "redemption": {
        const euros = (v: unknown) => (str(v) === "" ? null : Math.round(Number(str(v)) * 100));
        const budget = euros(b.monthlyCreditBudget);
        await saveRedemptionRules(
          venue,
          normaliseRules({
            creditMinOrderCents: euros(b.creditMinOrder) ?? 0,
            doubleMinOrderCents: euros(b.doubleMinOrder) ?? 0,
            monthlyCreditBudgetCents: budget,
            allowCreditWithDouble: b.allowCreditWithDouble === "on" || b.allowCreditWithDouble === true,
          }),
        );
        return json({ ok: true });
      }
      case "reviews":
        await setGooglePlaceId(venue, str(b.placeId) || null);
        return json({ ok: true });
      case "xero-mapping": {
        const m: XeroMapping = {
          contactName: str(b.contactName) || "The Snug Club app sales",
          salesAccountCode: str(b.salesAccountCode),
          taxType9: str(b.taxType9),
          taxType23: str(b.taxType23),
          creditAccountCode: str(b.creditAccountCode),
          creditTaxType: str(b.creditTaxType) || "NONE",
          paymentAccountCode: str(b.paymentAccountCode),
        };
        await saveXeroMapping(venue, m);
        return json({ ok: true });
      }
      case "xero-sync": {
        const app = xeroApp();
        if (!app || !key) return json({ error: "Xero isn't configured on the server." }, 400);
        const day = /^\d{4}-\d{2}-\d{2}$/.test(str(b.date)) ? str(b.date) : localDate(new Date(Date.now() - 86_400_000), venue.timezone);
        return json({ result: await syncXeroDay(venue, day, app, key), day });
      }
      default:
        return json({ error: "Unknown section" }, 400);
    }
  } catch (e) {
    return errorJson(e);
  }
}
