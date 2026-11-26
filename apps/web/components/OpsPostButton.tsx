"use client";
import { useRouter } from "next/navigation";

export function OpsPostButton({ id }: { id: string }) {
  const router = useRouter();
  const go = async (status: string) => {
    await fetch("/api/ops/social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    router.refresh();
  };
  return (
    <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
      <button className="btn sm" onClick={() => go("approved")}>Approve</button>
      <button className="btn sm ghost" onClick={() => go("skipped")}>Skip</button>
    </span>
  );
}
