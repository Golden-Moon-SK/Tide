import { AtSign, CalendarDays, Flag, Hash, Repeat } from "lucide-react";

const HINTS = [
  { icon: Hash, syntax: "#project", label: "project" },
  { icon: AtSign, syntax: "@label", label: "label" },
  { icon: Flag, syntax: "p1–p4", label: "priority" },
  { icon: CalendarDays, syntax: "fri 3pm", label: "date" },
  { icon: Repeat, syntax: "every mon", label: "repeat" },
] as const;

/**
 * Legend for the capture syntax, shown while the bar is focused and empty.
 *
 * CaptureChips shows what got parsed once you're typing; this shows what's
 * possible before you've typed anything, so the shortcuts don't have to live
 * only in someone's memory or in this file's neighbour.
 */
export function CaptureHints() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3 px-1">
      {HINTS.map(({ icon: Icon, syntax, label }) => (
        <span
          key={label}
          className="text-meta inline-flex items-center gap-1.5 text-faint"
        >
          <kbd className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 text-muted">
            <Icon aria-hidden className="size-3" strokeWidth={2} />
            {syntax}
          </kbd>
          {label}
        </span>
      ))}
    </div>
  );
}
