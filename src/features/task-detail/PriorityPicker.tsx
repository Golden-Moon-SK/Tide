import type { Priority } from "@/db/schema";

const OPTIONS: { value: Priority; label: string; dot: string }[] = [
  { value: 1, label: "Urgent", dot: "bg-priority-1" },
  { value: 2, label: "High", dot: "bg-priority-2" },
  { value: 3, label: "Medium", dot: "bg-priority-3" },
  { value: 4, label: "Normal", dot: "bg-priority-4" },
];

export function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority;
  onChange: (priority: Priority) => void;
}) {
  return (
    <div className="flex gap-1">
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={`text-meta flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors ${
              active
                ? "border-border-strong bg-surface-hover text-text"
                : "border-border text-muted hover:bg-surface-hover"
            }`}
          >
            <span
              aria-hidden
              className={`size-2 rounded-full ${option.dot} ${
                option.value === 4 ? "border border-border-strong" : ""
              }`}
            />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
