"use client";
import { useState } from "react";
import { PasskeyButton } from "./PasskeyButton";

export function ClockKiosk({ slug }: { slug: string }) {
  const [last, setLast] = useState<{ text: string; in: boolean } | null>(null);
  return (
    <div className="stack" style={{ alignItems: "center" }}>
      <PasskeyButton purpose="clock" as="staff" venue={slug} label="Clock in or out with a passkey" block onDone={(r) => { setLast({ text: String(r.message), in: !!r.clockedIn }); setTimeout(() => setLast(null), 8000); }} />
      {last && <div className={last.in ? "notice" : "card"} style={{ fontSize: 20, width: "100%" }}>{last.in ? "👋 " : "🌙 "}{last.text}</div>}
    </div>
  );
}
