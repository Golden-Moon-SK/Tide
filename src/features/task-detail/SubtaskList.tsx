"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Plus, X } from "lucide-react";
import { createTask, deleteTask, setCompleted } from "@/db/mutations";
import type { Task } from "@/db/schema";

export function SubtaskList({
  parent,
  items,
}: {
  parent: Task;
  items: Task[] | undefined;
}) {
  const [draft, setDraft] = useState("");
  const done = (items ?? []).filter((t) => t.completed).length;

  async function add(event: React.FormEvent) {
    event.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    // Subtasks inherit the parent's project so they never orphan into the Inbox.
    await createTask({ title, parentId: parent.id, projectId: parent.projectId });
  }

  return (
    <section>
      <h3 className="text-meta mb-2 flex items-center gap-2 text-faint">
        Subtasks
        {items && items.length > 0 && (
          <span className="tabular-nums">
            {done}/{items.length}
          </span>
        )}
      </h3>

      <ul className="mb-1 space-y-0.5">
        <AnimatePresence initial={false}>
          {(items ?? []).map((task) => (
            <motion.li
              key={task.id}
              layout
              initial={{ opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 40 }}
              className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={task.completed}
                onChange={() => setCompleted(task.id, !task.completed)}
                aria-label={task.title}
                className="size-3.5 shrink-0 accent-[var(--accent)]"
              />
              <span
                className={`text-meta min-w-0 flex-1 break-words ${
                  task.completed ? "text-faint line-through" : "text-text"
                }`}
              >
                {task.title}
              </span>
              <button
                type="button"
                onClick={() => deleteTask(task.id)}
                aria-label={`Delete ${task.title}`}
                className="shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-danger focus-visible:opacity-100"
              >
                <X aria-hidden className="size-3.5" strokeWidth={2} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <form onSubmit={add} className="flex items-center gap-2 px-1.5">
        <Plus aria-hidden className="size-3.5 shrink-0 text-faint" strokeWidth={2} />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Add a subtask"
          aria-label="Add a subtask"
          className="text-meta min-w-0 flex-1 bg-transparent py-1 text-text placeholder:text-faint focus:outline-none"
        />
      </form>
    </section>
  );
}
