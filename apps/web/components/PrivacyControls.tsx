"use client";
import { toast } from "./Toasts";

export function PrivacyControls({ slug }: { slug: string }) {
  return (
    <section className="card stack" aria-label="Your data">
      <b>Your data</b>
      <span className="muted small">Download everything we hold about you, or delete your account. Deleting removes your name, number, email and birthday; your past orders stay on the venue&apos;s records without them, as VAT law requires.</span>
      <div className="row" style={{ justifyContent: "flex-start" }}>
        <a className="btn sm ghost" href="/api/me/export">Download my data</a>
        <button
          className="btn sm danger"
          onClick={async () => {
            const c = prompt("This deletes your account at every venue, with your points and credit. Type DELETE to confirm.");
            if (c !== "DELETE") return;
            const res = await fetch("/api/me/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: c }) });
            if (!res.ok) return toast("Couldn't delete the account. Try again.", { kind: "err" });
            toast("Your account has been deleted");
            location.href = `/v/${slug}`;
          }}
        >
          Delete my account
        </button>
      </div>
    </section>
  );
}
