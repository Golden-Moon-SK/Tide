import { dateAtNoon, fromDateInput, toDateInput, toTimeInput } from "@/lib/dates";

/**
 * Scheduling. The three shortcuts cover almost every real reschedule; the
 * explicit inputs are there for the rest rather than being the main path.
 */
export function DueDateField({
  dueDate,
  hasTime,
  onChange,
}: {
  dueDate?: number;
  hasTime: boolean;
  onChange: (dueDate: number | undefined, hasTime: boolean) => void;
}) {
  const shortcuts: { label: string; days: number }[] = [
    { label: "Today", days: 0 },
    { label: "Tomorrow", days: 1 },
    { label: "Next week", days: 7 },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {shortcuts.map(({ label, days }) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(dateAtNoon(days), false)}
            className="text-meta rounded-lg border border-border px-2 py-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            {label}
          </button>
        ))}
        {dueDate !== undefined && (
          <button
            type="button"
            onClick={() => onChange(undefined, false)}
            className="text-meta rounded-lg border border-border px-2 py-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="date"
          aria-label="Due date"
          value={dueDate !== undefined ? toDateInput(dueDate) : ""}
          onChange={(event) =>
            onChange(
              fromDateInput(
                event.target.value,
                hasTime && dueDate !== undefined ? toTimeInput(dueDate) : undefined,
                dueDate ?? dateAtNoon(0),
              ),
              hasTime,
            )
          }
          className="text-meta min-w-0 flex-1 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-text focus:border-border-strong focus:outline-none"
        />
        <input
          type="time"
          aria-label="Due time"
          disabled={dueDate === undefined}
          value={dueDate !== undefined && hasTime ? toTimeInput(dueDate) : ""}
          onChange={(event) => {
            if (dueDate === undefined) return;
            // Clearing the time field means "all day", not "midnight".
            if (!event.target.value) {
              onChange(dateAtNoonFrom(dueDate), false);
              return;
            }
            onChange(
              fromDateInput(toDateInput(dueDate), event.target.value, dueDate),
              true,
            );
          }}
          className="text-meta w-28 rounded-lg border border-border bg-surface-raised px-2 py-1.5 text-text focus:border-border-strong focus:outline-none disabled:opacity-40"
        />
      </div>
    </div>
  );
}

function dateAtNoonFrom(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}
