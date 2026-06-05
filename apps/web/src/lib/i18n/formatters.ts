/**
 * Pure Intl-API wrappers. Pass locale + currency explicitly so the
 * functions are testable in isolation. Hooks in `locale-context.tsx`
 * bind these to the current org's locale.
 */

export function formatDate(
  date: Date | string,
  locale: string,
  style: Intl.DateTimeFormatOptions["dateStyle"] = "medium",
): string {
  const d = parseLocalDate(date);
  return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(d);
}

/**
 * Parse a date input without the UTC off-by-one. A bare "YYYY-MM-DD"
 * (our Postgres `date` columns) is constructed at LOCAL midnight so it
 * renders as the same calendar day everywhere — `new Date("2026-05-20")`
 * parses as UTC midnight, which formats to the prior day in any
 * negative-UTC timezone. Full datetime strings + Date objects pass
 * through unchanged.
 */
function parseLocalDate(date: Date | string): Date {
  if (typeof date !== "string") return date;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return new Date(date);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function formatDateTime(
  date: Date | string,
  locale: string,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export function formatTime(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(d);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Money pair formatter (D-17). Accepts the decimal-string form we use
 * end-to-end + the ISO 4217 currency code. Returns "—" if either input
 * is missing or invalid.
 */
export function formatCurrency(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
  locale: string,
): string {
  if (amount == null || currency == null) return "—";
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    // Invalid currency code — fall back to plain number + suffix.
    return `${formatNumber(value, locale)} ${currency}`;
  }
}

/**
 * "2 days ago" / "in 5 hours" style. Threshold-based — picks the most
 * natural unit. Uses Intl.RelativeTimeFormat under the hood.
 */
export function formatRelative(
  date: Date | string,
  locale: string,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = d.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  const abs = Math.abs(diffMs);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (abs < min) return rtf.format(Math.round(diffMs / 1000), "second");
  if (abs < hour) return rtf.format(Math.round(diffMs / min), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (abs < week) return rtf.format(Math.round(diffMs / day), "day");
  if (abs < month) return rtf.format(Math.round(diffMs / week), "week");
  if (abs < year) return rtf.format(Math.round(diffMs / month), "month");
  return rtf.format(Math.round(diffMs / year), "year");
}
