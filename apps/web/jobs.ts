// Background jobs for the prototype. Production moves these to pg-boss.
import { providerFromEnv } from "@round/core";
import { reconcilePending } from "@round/db/services";

const provider = providerFromEnv(process.env);
setInterval(() => {
  reconcilePending(provider).catch((e) => console.error("reconcile failed", e));
}, 60_000);
