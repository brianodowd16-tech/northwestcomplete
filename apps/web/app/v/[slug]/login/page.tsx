import { LoginForm } from "@/components/LoginForm";
import { loadVenue } from "@/lib/server";

export default async function LoginPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ next?: string }> }) {
  const venue = await loadVenue((await params).slug);
  const next = (await searchParams).next;
  // Only same-venue relative paths, so ?next can't redirect off-site.
  const safeNext = next && (next.startsWith(`/v/${venue.slug}`) || /^\/(me|g\/[A-Za-z0-9]+)(\/|$|\?)/.test(next)) && !next.startsWith("//") ? next : `/v/${venue.slug}`;
  return <LoginForm next={safeNext} venueName={venue.name} />;
}
