import { startOfDay } from "@/db/queries";

/** Whole days from today. Negative is the past. */
export function daysFromToday(timestamp: number): number {
  const today = startOfDay();
  const target = startOfDay(new Date(timestamp));
  return Math.round((target - today) / 86_400_000);
}

export function isOverdue(timestamp: number): boolean {
  return daysFromToday(timestamp) < 0;
}

/**
 * Human date the way a to-do app should say it: "Today", "Tomorrow", a weekday
 * name inside the coming week, then a short date. Long enough to be unambiguous,
 * short enough to sit on one line next to a task.
 */
export function formatDueDate(timestamp: number, hasTime: boolean): string {
  const days = daysFromToday(timestamp);
  const date = new Date(timestamp);

  let day: string;
  if (days === 0) day = "Today";
  else if (days === 1) day = "Tomorrow";
  else if (days === -1) day = "Yesterday";
  else if (days > 1 && days < 7)
    day = date.toLocaleDateString(undefined, { weekday: "long" });
  else if (days < -1 && days > -7)
    day = `Last ${date.toLocaleDateString(undefined, { weekday: "long" })}`;
  else
    day = date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year:
        date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    });

  if (!hasTime) return day;
  const time = date
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .replace(":00", "");
  return `${day} ${time}`;
}

/**
 * Epoch ms to the value an <input type="date"> expects, in LOCAL time.
 * `toISOString()` would be UTC and silently shift the day across the date line.
 */
export function toDateInput(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function toTimeInput(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes(),
  ).padStart(2, "0")}`;
}

/** Combines the two inputs back into epoch ms, keeping the existing time. */
export function fromDateInput(
  date: string,
  time: string | undefined,
  fallback: number,
): number | undefined {
  if (!date) return undefined;
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const base = new Date(fallback);
  const [hours, minutes] = time
    ? time.split(":").map(Number)
    : [base.getHours(), base.getMinutes()];
  return new Date(year, month - 1, day, hours ?? 12, minutes ?? 0, 0, 0).getTime();
}

/** Midday, so a date with no time never straddles a boundary. */
export function dateAtNoon(offsetDays: number): number {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}
