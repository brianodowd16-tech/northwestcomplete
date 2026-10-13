"use client";

import { useState } from "react";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "number" | "select" | "textarea";
  required?: boolean;
  options?: string[];
  placeholder?: string;
  full?: boolean;
};

type Props = {
  type: string;
  fields?: Field[];
  submitLabel?: string;
  defaults?: Record<string, string>;
  messageLabel?: string;
};

const baseFields: Field[] = [
  { name: "name", label: "Your name", required: true },
  { name: "email", label: "Email", type: "email", required: true },
  { name: "phone", label: "Phone", type: "tel" },
];

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-slate-900 focus:border-sea-500 focus:outline-none focus:ring-2 focus:ring-sea-200";

export function EnquiryForm({ type, fields = [], submitLabel = "Send enquiry", defaults = {}, messageLabel = "How can we help?" }: Props) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch("/api/enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, type }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Something went wrong.");
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-sea-200 bg-sea-50 p-6 text-sea-900">
        <p className="font-display text-lg font-semibold">Thanks — we&apos;ve got your message.</p>
        <p className="mt-1 text-sm">We&apos;ll get back to you within one working day.</p>
      </div>
    );
  }

  const all = [...baseFields, ...fields];

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {all.map((f) => (
        <label key={f.name} className={`text-sm font-medium text-slate-700 ${f.full || f.type === "textarea" ? "sm:col-span-2" : ""}`}>
          {f.label}
          {f.required && <span className="text-red-600"> *</span>}
          {f.type === "select" ? (
            <select name={f.name} required={f.required} defaultValue={defaults[f.name] ?? ""} className={inputClass}>
              <option value="" disabled>
                Select…
              </option>
              {f.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea name={f.name} required={f.required} rows={3} placeholder={f.placeholder} defaultValue={defaults[f.name]} className={inputClass} />
          ) : (
            <input
              name={f.name}
              type={f.type ?? "text"}
              required={f.required}
              placeholder={f.placeholder}
              defaultValue={defaults[f.name]}
              className={inputClass}
            />
          )}
        </label>
      ))}
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">
        {messageLabel}
        <span className="text-red-600"> *</span>
        <textarea name="message" required rows={5} defaultValue={defaults.message} className={inputClass} />
      </label>
      {/* Honeypot */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="sm:col-span-2">
        {status === "error" && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded-md bg-navy-800 px-6 py-3 text-sm font-semibold text-white transition hover:bg-navy-700 disabled:opacity-60"
        >
          {status === "sending" ? "Sending…" : submitLabel}
        </button>
        <p className="mt-3 text-xs text-slate-500">We only use your details to respond to this enquiry. See our privacy policy.</p>
      </div>
    </form>
  );
}
