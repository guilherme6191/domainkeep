const TAKEOVER_NOTICE_MS = 10 * 60 * 1000;

/** Presentation only: this window never restricts verification or transfers. */
export function takeoverNoticeRemainingMs(tookOverAt: string, now: number): number {
  const age = now - Date.parse(tookOverAt);
  if (!Number.isFinite(age) || age < 0) return 0;
  return Math.max(0, TAKEOVER_NOTICE_MS - age);
}
