import assert from "node:assert";
import { DateTime } from "luxon";
import { computeFreeSlots } from "./slots.js";

const tz = "Europe/Berlin";
// Day open 09-12, 60-min service, 09:00 busy -> should leave 10:00 and 11:00.
const from = DateTime.fromISO("2030-01-07T00:00", { zone: tz }); // Monday
const slots = computeFreeSlots({
  busy: [{ start: "2030-01-07T09:00:00+01:00", end: "2030-01-07T10:00:00+01:00" }],
  from,
  days: 1,
  openHHMM: "09:00",
  closeHHMM: "12:00",
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  durationMin: 60,
  tz,
  now: DateTime.fromISO("2020-01-01T00:00", { zone: tz }),
});

assert.equal(slots.length, 2, `expected 2 slots, got ${slots.length}`);
assert.equal(slots[0].toFormat("HH:mm"), "10:00");
assert.equal(slots[1].toFormat("HH:mm"), "11:00");

console.log("OK - slots:", slots.map((s) => s.toFormat("HH:mm")).join(", "));
