"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createTaskFromCapture } from "@/db/mutations";
import { parseCapture } from "@/lib/parse";
import { CaptureChips } from "./CaptureChips";

/**
 * Capture. The most important surface in the app, so it is always present and
 * always one keystroke away — "/" focuses it from anywhere.
 *
 * Everything is parsed locally as you type: dates, p1-p4, #project, @label and
 * "every monday". No model, no network, no latency, and it keeps working with
 * the assistant switched off.
 */
export function QuickAddBar({
  projectId,
  inputRef: externalRef,
}: {
  projectId?: string;
  /** Lets the shell's "Add task" button put the cursor here. */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const [value, setValue] = useState("");
  const localRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? localRef;

  // Re-parsed on every keystroke. It's pure string work on one short line, so
  // it costs nothing and the chips stay in lockstep with what you typed.
  const parsed = useMemo(() => parseCapture(value), [value]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (typing) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inputRef]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!parsed.title) return;
    // Clear first so capture stays fast — the write can finish behind you.
    setValue("");
    await createTaskFromCapture(parsed, projectId);
  }

  return (
    <form onSubmit={submit}>
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setValue("");
              inputRef.current?.blur();
            }
          }}
          placeholder="Add a task — try “report thurs 3pm p1 #work”"
          aria-label="Add a task"
          className="text-task w-full rounded-xl border border-border bg-surface-raised py-3 pr-16 pl-4 text-text shadow-soft transition-colors placeholder:text-faint focus:border-border-strong focus:outline-none"
        />
        <kbd className="text-meta pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-faint">
          /
        </kbd>
      </div>

      <CaptureChips
        tokens={parsed.tokens}
        priority={parsed.priority}
        title={parsed.title}
      />
    </form>
  );
}
