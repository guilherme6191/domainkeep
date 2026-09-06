const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

const RELATIVE = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${DATE.format(date)} · ${TIME.format(date)}`;
}

export function formatDateTimeSentence(iso: string): string {
  const date = new Date(iso);
  return `${DATE.format(date)} at ${TIME.format(date)}`;
}

const UNITS: [limit: number, seconds: number, unit: Intl.RelativeTimeFormatUnit][] =
  [
    [60, 1, "second"],
    [3600, 60, "minute"],
    [86400, 3600, "hour"],
    [2592000, 86400, "day"],
  ];

/**
 * Signed: "2 days ago" or "in 7 days". Rounded to the nearest unit, so a fresh
 * seven-day challenge reads "in 7 days" rather than "in 6 days". Past a month
 * the absolute date takes over.
 */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const seconds = Math.round((new Date(iso).getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < 15) return "Just now";
  if (seconds > -60 && seconds < 0) return "Seconds ago";
  if (seconds > 0 && seconds < 60) return "In seconds";

  for (const [limit, divisor, unit] of UNITS) {
    const count = Math.round(seconds / divisor);
    // Rounding can reach the next unit: 59m 40s is "1 hour ago", not "60 minutes ago".
    if (Math.abs(count) < limit / divisor) {
      return RELATIVE.format(count, unit);
    }
  }

  return DATE.format(new Date(iso));
}
