import { AtSign, CalendarDays, Flag, Hash, Repeat } from "lucide-react";
import type { CaptureToken, TokenKind } from "@/lib/parse";
import type { Priority } from "@/db/schema";

const ICON: Record<TokenKind, typeof Hash> = {
  date: CalendarDays,
  recurrence: Repeat,
  priority: Flag,
  project: Hash,
  label: AtSign,
};

const PRIORITY_TEXT: Record<Priority, string> = {
  1: "text-priority-1",
  2: "text-priority-2",
  3: "text-priority-3",
  4: "text-muted",
};

/**
 * What the parser understood, shown while you type.
 *
 * The point is confidence: you watch "thurs 1pm" turn into a date before you
 * commit, so you never have to open the task afterwards to check it landed
 * right. A capture bar that parses silently is one you stop trusting.
 */
export function CaptureChips({
  tokens,
  priority,
  title,
}: {
  tokens: CaptureToken[];
  priority: Priority;
  title: string;
}) {
  if (tokens.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1">
      {title && (
        <span className="text-meta mr-0.5 text-muted">
          {title}
        </span>
      )}
      {tokens.map((token) => {
        const Icon = ICON[token.kind];
        const tint =
          token.kind === "priority" ? PRIORITY_TEXT[priority] : "text-muted";
        return (
          <span
            key={`${token.kind}-${token.start}`}
            className={`text-meta inline-flex items-center gap-1 rounded-md border border-border bg-surface-raised px-1.5 py-0.5 ${tint}`}
          >
            <Icon aria-hidden className="size-3" strokeWidth={2} />
            {token.display}
          </span>
        );
      })}
    </div>
  );
}
