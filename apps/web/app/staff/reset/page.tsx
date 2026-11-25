import { staffTokenInfo } from "@round/db/platform";
import { StaffPasswordLink } from "@/components/StaffPasswordLink";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const info = token ? await staffTokenInfo(token) : null;
  return (
    <div className="page">
      {info ? (
        <StaffPasswordLink mode="reset" token={token} who={`${info.name} (${info.email})`} />
      ) : (
        <div className="panel stack" style={{ maxWidth: 380, margin: "40px auto" }}>
          <h1 style={{ fontSize: 24 }}>This link has expired</h1>
          <p className="muted" style={{ margin: 0 }}>Links work once, for 30 minutes (password resets) or 7 days (invitations).</p>
          <a className="btn block" href="/staff/forgot">Email me a new link</a>
        </div>
      )}
    </div>
  );
}
