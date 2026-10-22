export function VenueTheme({ color }: { color: string }) {
  // Venue branding: one accent colour per venue (validated hex only).
  const safe = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#2b5a4a";
  return <style>{`:root{--vacc:${safe}}`}</style>;
}
