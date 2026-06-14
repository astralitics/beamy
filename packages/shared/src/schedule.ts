// Schedule triggers — a structured, dependency-free cadence (no raw cron) that's dropdown-authorable
// and pure-testable. `nextDueAfter` computes the next fire instant AFTER a given time; the cron scan
// stores it as a cursor (so missed/overlapping ticks fire at-most-once then re-align). daily/weekly
// resolve a local wall-clock time in an IANA tz via Intl (built-in, DST-correct — no offset math).
import { z } from "zod";

export const scheduleConfigSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("every"), minutes: z.number().int().min(1).max(60 * 24 * 7) }),
  z.object({ kind: z.literal("daily"), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), tz: z.string().default("UTC") }),
  z.object({
    kind: z.literal("weekly"),
    days: z.array(z.number().int().min(0).max(6)).min(1),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    tz: z.string().default("UTC"),
  }),
]);
export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>;

/** Offset (local − UTC) in ms for `instant` in `tz`, derived by formatting the instant in that tz. */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!);
  return asUtc - instant.getTime();
}

/** The UTC instant for a local wall-clock Y-M-D H:M in `tz` (two-pass to settle DST boundaries). */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const once = guess - tzOffsetMs(new Date(guess), tz);
  return new Date(guess - tzOffsetMs(new Date(once), tz));
}

/** The local calendar date (in `tz`) of an instant. */
function localDate(instant: Date, tz: string): { y: number; mo: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  return { y: +p.year!, mo: +p.month!, d: +p.day! };
}

function addDay(date: { y: number; mo: number; d: number }): { y: number; mo: number; d: number } {
  const dt = new Date(Date.UTC(date.y, date.mo - 1, date.d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return { y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Weekday (0=Sun..6=Sat) of a local calendar date. */
function weekdayOf(date: { y: number; mo: number; d: number }): number {
  return new Date(Date.UTC(date.y, date.mo - 1, date.d)).getUTCDay();
}

/** The next instant strictly after `from` matching the schedule. */
export function nextDueAfter(config: ScheduleConfig, from: Date): Date {
  if (config.kind === "every") return new Date(from.getTime() + config.minutes * 60_000);
  const [hh, mm] = config.time.split(":").map(Number) as [number, number];
  const days = config.kind === "weekly" ? new Set(config.days) : null;
  let date = localDate(from, config.tz);
  for (let i = 0; i < 8; i++) {
    const cand = zonedToUtc(date.y, date.mo, date.d, hh, mm, config.tz);
    const dayOk = !days || days.has(weekdayOf(date));
    if (dayOk && cand.getTime() > from.getTime()) return cand;
    date = addDay(date);
  }
  // Unreachable for valid configs; keep the cursor moving rather than throw.
  return new Date(from.getTime() + 60_000);
}
