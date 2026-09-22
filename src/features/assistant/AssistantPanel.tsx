"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ArrowUp, RotateCcw, Sparkles, Square } from "lucide-react";
import { ProposalCard } from "./ProposalCard";
import { useAssistant } from "./useAssistant";

/**
 * The assistant.
 *
 * It reads your real list through tools and proposes changes rather than making
 * them. The three starters are the jobs actually worth spending tokens on —
 * everything cheap and instant already happens in the capture bar for free.
 */
const STARTERS = [
  {
    label: "Plan my day",
    prompt:
      "Look at what's due today and suggest an order to work through it. Say what to defer if there's too much.",
  },
  {
    label: "Weekly review",
    prompt:
      "Review my tasks: what's overdue, what's been sitting untouched, and what I should drop or reschedule.",
  },
  {
    label: "Break something down",
    prompt:
      "Find the vaguest or largest task on my list and break it into concrete steps as subtasks.",
  },
];

export function AssistantPanel() {
  const {
    entries,
    busy,
    resolved,
    send,
    stop,
    clear,
    applyProposal,
    discardProposal,
    applyAll,
  } = useAssistant();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as it streams — scrolling is a DOM effect.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void send(text);
  }

  return (
    <div className="flex h-full flex-col">
      {entries.length === 0 ? (
        <div className="flex-1 py-10">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-lg bg-accent-soft text-accent">
              <Sparkles aria-hidden className="size-4" strokeWidth={2} />
            </span>
            <p className="text-section text-text">What needs doing?</p>
          </div>
          <p className="text-meta mb-5 text-muted">
            I can read your list and suggest changes. Nothing is saved until you
            say so.
          </p>
          <ul className="flex flex-wrap gap-2">
            {STARTERS.map((starter) => (
              <li key={starter.label}>
                <button
                  type="button"
                  onClick={() => void send(starter.prompt)}
                  className="text-meta rounded-lg border border-border bg-surface-raised px-2.5 py-1.5 text-muted transition-colors hover:border-border-strong hover:text-text"
                >
                  {starter.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex-1 space-y-5 py-2">
          {entries.map((entry) => {
            if (entry.role === "user") {
              return (
                <p
                  key={entry.id}
                  className="text-task ml-auto max-w-[85%] rounded-xl rounded-br-sm bg-surface-hover px-3 py-2 text-text"
                >
                  {entry.text}
                </p>
              );
            }

            if (entry.role === "error") {
              return (
                <p
                  key={entry.id}
                  className="text-meta rounded-lg border border-border px-3 py-2 text-danger"
                >
                  {entry.text}
                </p>
              );
            }

            const unresolved = entry.proposals.filter((p) => !resolved[p.id]);

            return (
              <div key={entry.id} className="space-y-2.5">
                {entry.text && (
                  <p className="text-task whitespace-pre-wrap text-text">
                    {entry.text}
                  </p>
                )}

                {entry.streaming && !entry.text && (
                  <motion.span
                    aria-label="Thinking"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                    className="text-meta block text-faint"
                  >
                    Thinking…
                  </motion.span>
                )}

                {entry.proposals.length > 0 && (
                  <div>
                    <ul className="space-y-1.5">
                      {entry.proposals.map((proposal) => (
                        <ProposalCard
                          key={proposal.id}
                          proposal={proposal}
                          resolution={resolved[proposal.id]}
                          onApply={() => void applyProposal(proposal)}
                          onDiscard={() => discardProposal(proposal)}
                        />
                      ))}
                    </ul>

                    {unresolved.length > 1 && (
                      <button
                        type="button"
                        onClick={() => void applyAll(unresolved)}
                        className="text-meta mt-2 rounded-lg border border-border px-2.5 py-1.5 text-muted transition-colors hover:border-border-strong hover:text-text"
                      >
                        Apply all {unresolved.length}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}

      <form onSubmit={submit} className="sticky bottom-0 bg-surface pt-3 pb-1">
        <div className="relative">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your tasks"
            aria-label="Ask the assistant"
            disabled={busy}
            className="text-task w-full rounded-xl border border-border bg-surface-raised py-3 pr-12 pl-4 text-text shadow-soft transition-colors placeholder:text-faint focus:border-border-strong focus:outline-none disabled:opacity-60"
          />
          <button
            type={busy ? "button" : "submit"}
            onClick={busy ? stop : undefined}
            disabled={!busy && !draft.trim()}
            aria-label={busy ? "Stop" : "Send"}
            className="absolute top-1/2 right-2.5 grid size-8 -translate-y-1/2 place-items-center rounded-lg bg-accent text-accent-contrast transition-opacity disabled:opacity-30"
          >
            {busy ? (
              <Square aria-hidden className="size-3.5" strokeWidth={2.5} />
            ) : (
              <ArrowUp aria-hidden className="size-4" strokeWidth={2.5} />
            )}
          </button>
        </div>

        {entries.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="text-meta mt-2 inline-flex items-center gap-1.5 text-faint transition-colors hover:text-muted"
          >
            <RotateCcw aria-hidden className="size-3" strokeWidth={2} />
            New conversation
          </button>
        )}
      </form>
    </div>
  );
}
