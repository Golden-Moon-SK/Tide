import type { Priority } from "@/db/schema";

const RING: Record<Priority, string> = {
  1: "border-priority-1",
  2: "border-priority-2",
  3: "border-priority-3",
  4: "border-border-strong",
};

const FILL: Record<Priority, string> = {
  1: "bg-priority-1",
  2: "bg-priority-2",
  3: "bg-priority-3",
  4: "bg-transparent",
};

/**
 * The completion control. Priority lives in the ring colour rather than a
 * separate badge, so one glance reads both "is it done" and "how urgent".
 */
export function PriorityDot({
  priority,
  completed,
  onToggle,
  label,
}: {
  priority: Priority;
  completed: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
      aria-label={`Mark "${label}" ${completed ? "not done" : "done"}`}
      onClick={onToggle}
      className={`group/dot relative mt-0.5 size-[1.125rem] shrink-0 rounded-full border-[1.5px] transition-colors duration-150 ${
        completed ? "border-faint bg-faint" : `${RING[priority]} hover:bg-surface-hover`
      }`}
    >
      {/* Priority tint, revealed on hover as a fill preview */}
      <span
        aria-hidden
        className={`absolute inset-[3px] rounded-full opacity-0 transition-opacity duration-150 group-hover/dot:opacity-30 ${FILL[priority]}`}
      />
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className={`absolute inset-0 m-auto size-3 transition-opacity duration-150 ${
          completed ? "opacity-100" : "opacity-0"
        }`}
      >
        <path
          d="M2.5 6.2 4.8 8.5 9.5 3.8"
          fill="none"
          stroke="var(--surface)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
