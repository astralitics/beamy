// Fixture for the schedule due-cursor — pure, no deps/db:
//   npx tsx packages/shared/scripts/schedule.check.ts
import assert from "node:assert/strict";
import { nextDueAfter, scheduleConfigSchema } from "../src/schedule";

const iso = (d: Date) => d.toISOString();

// every-N: wall-clock-independent
assert.equal(iso(nextDueAfter({ kind: "every", minutes: 15 }, new Date("2026-06-14T09:00:00Z"))), "2026-06-14T09:15:00.000Z");
assert.equal(iso(nextDueAfter({ kind: "every", minutes: 1 }, new Date("2026-06-14T09:00:30Z"))), "2026-06-14T09:01:30.000Z");

// daily at 09:00 UTC — before/after the time today
assert.equal(iso(nextDueAfter({ kind: "daily", time: "09:00", tz: "UTC" }, new Date("2026-06-14T08:00:00Z"))), "2026-06-14T09:00:00.000Z");
assert.equal(iso(nextDueAfter({ kind: "daily", time: "09:00", tz: "UTC" }, new Date("2026-06-14T09:00:00Z"))), "2026-06-15T09:00:00.000Z", "at/after the slot → tomorrow");

// daily 09:00 America/New_York in winter (EST = UTC-5) → 14:00Z
assert.equal(iso(nextDueAfter({ kind: "daily", time: "09:00", tz: "America/New_York" }, new Date("2026-01-10T00:00:00Z"))), "2026-01-10T14:00:00.000Z");
// summer (EDT = UTC-4) → 13:00Z (proves DST-correct, not a fixed offset)
assert.equal(iso(nextDueAfter({ kind: "daily", time: "09:00", tz: "America/New_York" }, new Date("2026-07-10T00:00:00Z"))), "2026-07-10T13:00:00.000Z");

// weekly on Monday (1) at 09:00 UTC. 2026-06-14 is a Sunday → next Monday is the 15th.
assert.equal(iso(nextDueAfter({ kind: "weekly", days: [1], time: "09:00", tz: "UTC" }, new Date("2026-06-14T12:00:00Z"))), "2026-06-15T09:00:00.000Z");
// weekly [1,3,5] from Mon 10:00 → next is Wed (3) since Monday's slot already passed.
assert.equal(iso(nextDueAfter({ kind: "weekly", days: [1, 3, 5], time: "09:00", tz: "UTC" }, new Date("2026-06-15T10:00:00Z"))), "2026-06-17T09:00:00.000Z");

// zod validation rejects garbage, accepts good
assert.ok(scheduleConfigSchema.safeParse({ kind: "every", minutes: 5 }).success);
assert.ok(!scheduleConfigSchema.safeParse({ kind: "every", minutes: 0 }).success);
assert.ok(!scheduleConfigSchema.safeParse({ kind: "daily", time: "9am", tz: "UTC" }).success);
assert.ok(!scheduleConfigSchema.safeParse({ kind: "daily", time: "25:00", tz: "UTC" }).success, "out-of-range hour rejected");
assert.ok(!scheduleConfigSchema.safeParse({ kind: "daily", time: "09:60", tz: "UTC" }).success, "out-of-range minute rejected");
assert.ok(scheduleConfigSchema.safeParse({ kind: "daily", time: "23:59", tz: "UTC" }).success, "23:59 accepted");
assert.ok(scheduleConfigSchema.safeParse({ kind: "weekly", days: [0, 6], time: "23:30", tz: "UTC" }).success);

console.log("✓ schedule.check: every / daily / weekly / DST / zod — all assertions passed");
