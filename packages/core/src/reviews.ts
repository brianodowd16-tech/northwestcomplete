// Google reviews. Google's policy bans incentives for reviews (points, credit,
// discounts) and "review gating" (asking for a rating first and only sending
// happy guests to Google). So every guest sees the same prompt, nothing is
// rewarded, and the guest writes the review on Google's own page.

export function isValidPlaceId(placeId: string): boolean {
  return /^[A-Za-z0-9_-]{10,200}$/.test(placeId);
}

/** Google's "write a review" page for a business, from its Place ID. */
export function googleReviewUrl(placeId: string): string {
  if (!isValidPlaceId(placeId)) throw new Error("Invalid Google Place ID");
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
