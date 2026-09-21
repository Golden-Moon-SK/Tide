import { formatDueDate, isOverdue } from "@/lib/dates";

/** Due date as inline metadata. Red only when overdue — colour is signal. */
export function DateChip({
  dueDate,
  hasTime,
}: {
  dueDate: number;
  hasTime: boolean;
}) {
  const overdue = isOverdue(dueDate);
  return (
    <span
      className={`text-meta tabular-nums ${overdue ? "text-overdue" : "text-muted"}`}
    >
      {formatDueDate(dueDate, hasTime)}
    </span>
  );
}
