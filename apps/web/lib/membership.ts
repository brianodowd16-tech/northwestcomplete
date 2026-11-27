import "server-only";
import { buildProvider, type PaymentProvider } from "@round/core";

/**
 * Complete's own payment account, for memberships and points (venues' accounts are never used for these).
 * COMPLETE_PAYMENTS=revolut with COMPLETE_REVOLUT_SECRET_KEY / _PUBLIC_KEY / _WEBHOOK_SECRET (sandbox until
 * launch, and the Central Bank limited-network notification is filed); otherwise test payments outside production.
 */
export function completeProvider(): PaymentProvider | null {
  if (process.env.COMPLETE_PAYMENTS === "revolut") {
    const secretKey = process.env.COMPLETE_REVOLUT_SECRET_KEY, publicKey = process.env.COMPLETE_REVOLUT_PUBLIC_KEY, webhookSecret = process.env.COMPLETE_REVOLUT_WEBHOOK_SECRET;
    if (!secretKey || !publicKey || !webhookSecret) return null;
    return buildProvider({ provider: "revolut", secretKey, publicKey, webhookSecret, apiBase: process.env.COMPLETE_REVOLUT_API_BASE || "https://sandbox-merchant.revolut.com", apiVersion: "2024-09-01" });
  }
  if (process.env.NODE_ENV === "production" && process.env.COMPLETE_PAYMENTS !== "mock") return null;
  return buildProvider({ provider: "mock" });
}
