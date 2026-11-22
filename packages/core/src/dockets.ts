import type { Station } from "./pricing";

export type DocketStatus = "new" | "in_progress" | "ready" | "done";

const FLOW: DocketStatus[] = ["new", "in_progress", "ready", "done"];

export const STATUS_LABELS: Record<Station, Record<DocketStatus, string>> = {
  bar: { new: "New", in_progress: "Pouring", ready: "Ready", done: "Collected" },
  kitchen: { new: "New", in_progress: "Cooking", ready: "Ready", done: "Served" },
};

export const LATE_AFTER_MS: Record<Station, number> = { bar: 5 * 60_000, kitchen: 15 * 60_000 };

export function nextStatus(s: DocketStatus): DocketStatus | null {
  const i = FLOW.indexOf(s);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}

export class DocketError extends Error {}

/**
 * Checks a docket may move to `to`. A bar docket carrying an ID check can't be
 * collected until staff have recorded the check.
 */
export function assertCanAdvance(d: { status: DocketStatus; idCheckRequired: boolean; idCheckedAt: Date | null }, to: DocketStatus) {
  if (nextStatus(d.status) !== to) throw new DocketError(`Can't move from ${d.status} to ${to}`);
  if (to === "done" && d.idCheckRequired && !d.idCheckedAt) throw new DocketError("Check ID before handing over");
}

/** Staff can undo a mistaken tap for this long after it. */
export const UNDO_WINDOW_MS = 2 * 60_000;

export function prevStatus(s: DocketStatus): DocketStatus | null {
  const i = FLOW.indexOf(s);
  return i > 0 ? FLOW[i - 1] : null;
}

/** Checks a docket may step back one status: only shortly after it moved forward. */
export function assertCanRevert(
  d: { status: DocketStatus; startedAt: Date | null; readyAt: Date | null; doneAt: Date | null },
  now = new Date(),
): DocketStatus {
  const to = prevStatus(d.status);
  if (!to) throw new DocketError("Nothing to undo");
  const movedAt = { new: null, in_progress: d.startedAt, ready: d.readyAt, done: d.doneAt }[d.status];
  if (!movedAt || now.getTime() - movedAt.getTime() > UNDO_WINDOW_MS) throw new DocketError("Too late to undo");
  return to;
}
