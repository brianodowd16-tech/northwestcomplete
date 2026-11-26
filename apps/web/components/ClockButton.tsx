"use client";
import { useEffect, useState } from "react";
import { toast } from "./Toasts";

/** Clock in / out for the signed-in staff member (timesheets and payroll). */
export function ClockButton() {
  const [state, setState] = useState<{ clockedIn: boolean; since: string | null } | null>(null);
  useEffect(() => {
    fetch("/api/staff/clock").then((r) => (r.ok ? r.json() : null)).then(setState).catch(() => {});
  }, []);
  if (!state) return null;
  return (
    <button
      className={`btn sm ${state.clockedIn ? "ghost" : ""}`}
      onClick={async () => {
        const res = await fetch("/api/staff/clock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: state.clockedIn ? "out" : "in" }) });
        const d = await res.json();
        if (!res.ok) return toast(d.error, { kind: "err" });
        setState(d);
        toast(d.clockedIn ? "Clocked in" : "Clocked out. Thanks!", { kind: "ok" });
      }}
    >
      {state.clockedIn ? `Clock out · ${new Date(state.since!).toLocaleTimeString("en-IE", { hour: "2-digit", minute: "2-digit" })}` : "Clock in"}
    </button>
  );
}
