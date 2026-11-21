import "server-only";
import { z } from "zod";

export const EnquirySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  town: z.string().trim().max(80).default(""),
  message: z.string().trim().max(2000).default(""),
  /** Guided consultation answers and recommendation, if any. */
  consultation: z.string().max(2000).default(""),
  priority: z.enum(["high", "normal", "low"]).default("normal"),
  source: z.string().max(40).default("website"),
  /** Honeypot: real people never fill this in. */
  company: z.string().max(0).optional().or(z.literal("")),
});

export type Enquiry = z.infer<typeof EnquirySchema>;

export const enquiriesEnabled = () => Boolean(process.env.ENQUIRY_WEBHOOK_URL);

/**
 * Sends a lead to the team. ENQUIRY_WEBHOOK_URL can be any endpoint that takes
 * JSON: a CRM (HubSpot, Pipedrive), Zapier/Make (to email, Teams or a shared
 * inbox), or Slack. If ENQUIRY_WEBHOOK_SECRET is set it's sent as a bearer token.
 */
export async function sendEnquiry(e: Enquiry): Promise<void> {
  const url = process.env.ENQUIRY_WEBHOOK_URL;
  if (!url) throw new Error("ENQUIRY_WEBHOOK_URL is not set");
  const { company: _honeypot, ...lead } = e;
  const body = {
    ...lead,
    receivedAt: new Date().toISOString(),
    // Slack/Teams-friendly one-liner.
    text: `New ${lead.priority === "high" ? "PRIORITY " : ""}consultation request from ${lead.name} (${lead.email}${lead.town ? `, ${lead.town}` : ""}). ${lead.consultation} ${lead.message}`.trim(),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.ENQUIRY_WEBHOOK_SECRET ? { Authorization: `Bearer ${process.env.ENQUIRY_WEBHOOK_SECRET}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Enquiry webhook → ${res.status}`);
}
