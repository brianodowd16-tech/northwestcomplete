"use client";
import { useRouter } from "next/navigation";
import { useLive } from "./useLive";

export function LiveRefresh({ slug, orderId }: { slug: string; orderId: string }) {
  const router = useRouter();
  useLive(slug, () => router.refresh(), orderId);
  return null;
}
