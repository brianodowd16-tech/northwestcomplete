import "server-only";
import { readyNotice } from "@round/core";
import { deletePushSubscriptions, docketNotice } from "@round/db/push";
import type { Staff } from "@round/db/services";
import webpush from "web-push";
import { appUrl } from "./server";

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PUBLIC_KEY : null;
}

let ready = false;
function init() {
  if (!ready) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@complete.pub", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    ready = true;
  }
}

/** "Your drinks are ready": sent to every device the guest opted in on. Expired subscriptions are removed. */
export async function notifyDocketReady(staff: Staff, docketId: string) {
  if (!pushPublicKey()) return;
  const n = await docketNotice(staff, docketId);
  if (!n || n.status !== "ready" || !n.subs.length) return;
  init();
  const msg = readyNotice(n.station, n.orderNumber, n.venueName, n.idCheck);
  const payload = JSON.stringify({ ...msg, url: `${appUrl()}/v/${n.slug}/order/${n.orderId}`, tag: `order-${n.orderId}-${n.station}` });
  const gone: string[] = [];
  await Promise.all(
    n.subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 900, urgency: "high" }).catch((e: { statusCode?: number }) => {
        if (e.statusCode === 404 || e.statusCode === 410) gone.push(s.endpoint);
        else console.error("push", e.statusCode ?? e);
      }),
    ),
  );
  await deletePushSubscriptions(gone);
}
