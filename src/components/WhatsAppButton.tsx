import { site } from "@/lib/site";
import { Icon } from "./Icon";

/** Floating click-to-chat button, bottom right on every page. */
export function WhatsAppButton() {
  return (
    <a
      href={site.whatsapp}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`WhatsApp ${site.contactName} on ${site.phone}`}
      className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 font-semibold text-[#062b16] shadow-xl transition hover:scale-105 hover:brightness-105 focus:outline-none focus:ring-4 focus:ring-[#25D366]/40"
      style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <Icon name="whatsapp" className="h-6 w-6" />
      <span className="hidden sm:inline">WhatsApp {site.contactName}</span>
    </a>
  );
}
