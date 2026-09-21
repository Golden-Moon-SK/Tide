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
