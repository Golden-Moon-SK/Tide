import { Check, CircleCheck, Pencil, Plus, X } from "lucide-react";
import type { Proposal } from "./execute";

const ICON = {
  create: Plus,
  update: Pencil,
  complete: CircleCheck,
} as const;

const VERB = {
  create: "New task",
  update: "Change",
  complete: "Complete",
} as const;

/**
 * A change the assistant wants to make, and hasn't.
 *
 * Nothing here has touched the database. That is the whole point: a wrong
 * suggestion costs a click to dismiss instead of an evening to untangle.
 */
export function ProposalCard({
  proposal,
  resolution,
  onApply,
  onDiscard,
}: {
  proposal: Proposal;
  resolution?: "applied" | "discarded";
  onApply: () => void;
  onDiscard: () => void;
}) {
  const Icon = ICON[proposal.kind];

  return (
    <li
      className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${
        resolution === "discarded"
          ? "border-border opacity-50"
          : resolution === "applied"
            ? "border-border bg-surface-hover"
            : "border-border bg-surface-raised"
      }`}
    >
      <Icon
        aria-hidden
        className="mt-0.5 size-3.5 shrink-0 text-faint"
        strokeWidth={2}
      />

      <div className="min-w-0 flex-1">
        <p className="text-meta text-faint">{VERB[proposal.kind]}</p>
        <p
          className={`text-meta break-words ${
            resolution === "discarded"
              ? "text-faint line-through"
              : "text-text"
          }`}
        >
          {proposal.summary}
        </p>
      </div>

      {resolution ? (
        <span className="text-meta shrink-0 pt-0.5 text-faint">
          {resolution === "applied" ? "Added" : "Discarded"}
        </span>
      ) : (
        <span className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onApply}
            aria-label={`Apply: ${proposal.summary}`}
            className="rounded-md border border-border p-1 text-muted transition-colors hover:bg-surface-hover hover:text-accent"
          >
            <Check aria-hidden className="size-3.5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onDiscard}
            aria-label={`Discard: ${proposal.summary}`}
            className="rounded-md border border-border p-1 text-muted transition-colors hover:bg-surface-hover hover:text-danger"
          >
            <X aria-hidden className="size-3.5" strokeWidth={2} />
          </button>
        </span>
      )}
    </li>
  );
}
