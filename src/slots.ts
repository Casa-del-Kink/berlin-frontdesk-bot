import { DateTime, Interval } from "luxon";

export interface Busy {
  start: string; // ISO
  end: string; // ISO
}

// Compute free slots within business hours, avoiding the busy intervals.
// Pure function so it can be tested without touching Google Calendar (see src/check.ts).
export function computeFreeSlots(opts: {
  busy: Busy[];
  from: DateTime;
  days: number;
  openHHMM: string;
  closeHHMM: string;
  weekdays: number[]; // 1=Monday ... 7=Sunday (same as luxon)
  durationMin: number;
  tz: string;
  max?: number;
  now?: DateTime;
}): DateTime[] {
  const { busy, from, days, openHHMM, closeHHMM, weekdays, durationMin, tz } = opts;
  const max = opts.max ?? 6;
  const now = opts.now ?? DateTime.now().setZone(tz);

  const busyIv = busy.map((b) =>
    Interval.fromDateTimes(DateTime.fromISO(b.start).setZone(tz), DateTime.fromISO(b.end).setZone(tz)),
  );
  const [oh, om] = openHHMM.split(":").map(Number);
  const [ch, cm] = closeHHMM.split(":").map(Number);

  const slots: DateTime[] = [];
  for (let d = 0; d < days && slots.length < max; d++) {
    const day = from.setZone(tz).startOf("day").plus({ days: d });
    if (!weekdays.includes(day.weekday)) continue;

    let cursor = day.set({ hour: oh, minute: om, second: 0, millisecond: 0 });
    const close = day.set({ hour: ch, minute: cm, second: 0, millisecond: 0 });

    while (cursor.plus({ minutes: durationMin }) <= close && slots.length < max) {
      const end = cursor.plus({ minutes: durationMin });
      const iv = Interval.fromDateTimes(cursor, end);
      const overlaps = busyIv.some((b) => b.overlaps(iv));
      if (!overlaps && cursor > now) slots.push(cursor);
      cursor = end;
    }
  }
  return slots;
}
