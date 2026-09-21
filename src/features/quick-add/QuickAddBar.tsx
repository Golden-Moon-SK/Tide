"use client";

import { useEffect, useRef, useState } from "react";
import { createTask } from "@/db/mutations";

/**
 * Capture. The most important surface in the app, so it is always present and
 * always one keystroke away — "/" focuses it from anywhere.
 *
 * Phase 1 takes the title verbatim. Phase 2 adds the deterministic parser, and
 * the parsed tokens will render as chips inline right here.
 */
export function QuickAddBar({ projectId }: { projectId?: string }) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const title = value.trim();
    if (!title) return;
    // Clear first so capture stays fast — the write can finish behind you.
    setValue("");
    await createTask({ title, projectId });
  }

  return (
    <form onSubmit={submit} className="relative">
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") inputRef.current?.blur();
        }}
        placeholder="Add a task"
        aria-label="Add a task"
        className="text-task w-full rounded-xl border border-border bg-surface-raised py-3 pr-16 pl-4 text-text placeholder:text-faint focus:border-accent focus:outline-none"
      />
      <kbd className="text-meta pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-faint">
        /
      </kbd>
    </form>
  );
}
