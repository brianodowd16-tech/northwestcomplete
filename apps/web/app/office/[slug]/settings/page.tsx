import { redemptionRules } from "@round/db/ai";
import { integrationStatus, xeroHistory } from "@round/db/integrations";
import { SettingsForms } from "@/components/SettingsForms";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { appUrl, requireStaffFor, secretsKey, xeroApp } from "@/lib/server";

export const dynamic = "force-dynamic";

const XERO_NOTICE: Record<string, [string, string]> = {
  connected: ["notice", "Xero is connected. Check the account mapping below."],
  cancelled: ["error", "Xero sign-in was cancelled."],
  failed: ["error", "Xero didn't connect. Try again, and pick one organisation."],
};

export default async function Settings({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ xero?: string }> }) {
  const { slug } = await params;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const status = await integrationStatus(venue);
  const history = await xeroHistory(venue);
  const rules = await redemptionRules(venue);
  const xeroNotice = XERO_NOTICE[(await searchParams).xero ?? ""];
  const xc = (status.xero?.config ?? {}) as Record<string, string>;
  const mc = (status.mypos?.config ?? {}) as Record<string, string | number>;
  const rc = (status.revolut?.config ?? {}) as Record<string, string>;
  return (
    <div className="page stack" style={{ maxWidth: 900 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="settings" admin={staff.role === "admin"} />
        <h1 style={{ fontSize: 28 }}>Settings</h1>
      </div>
      {xeroNotice && <div className={xeroNotice[0]}>{xeroNotice[1]}</div>}
      <SettingsForms
        slug={slug}
        notifyUrl={`${appUrl()}/api/webhooks/mypos/${slug}`}
        provider={venue.paymentProvider}
        mypos={{ sid: mc.sid as string, walletNumber: mc.walletNumber as string, keyIndex: Number(mc.keyIndex) || undefined, mode: mc.mode as string, myposCertPem: mc.myposCertPem as string, hasKey: !!status.mypos?.hasSecret }}
        revolut={{ publicKey: rc.publicKey, apiBase: rc.apiBase, hasKey: !!status.revolut?.hasSecret }}
        placeId={venue.googlePlaceId ?? ""}
        xero={{
          available: !!xeroApp(),
          connected: !!status.xero?.hasSecret,
          orgName: xc.tenantName,
          mapping: xc,
          history: history
            .sort((a, b) => b.businessDate.localeCompare(a.businessDate))
            .slice(0, 10)
            .map((h) => ({ date: h.businessDate, status: h.status, error: h.error })),
        }}
        serverReady={!!secretsKey()}
        rules={rules}
        details={{ name: venue.name, tagline: venue.tagline, town: venue.town, vatNumber: venue.vatNumber, brandColor: venue.brandColor }}
      />
    </div>
  );
}
