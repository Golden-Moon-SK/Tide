"use client";

import { AnimatePresence } from "motion/react";
import { TaskRow } from "@/design/components/TaskRow";
import { setCompleted } from "@/db/mutations";
import type { Task } from "@/db/schema";

export function TaskList({
  tasks,
  projectNames,
  emptyTitle,
  emptyHint,
}: {
  tasks: Task[] | undefined;
  projectNames?: Record<string, string>;
  emptyTitle: string;
  emptyHint: string;
}) {
  // `undefined` means the live query hasn't resolved yet. Render nothing rather
  // than flashing an empty state that is about to be wrong.
  if (tasks === undefined) return <div className="h-32" />;

  if (tasks.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-section text-muted">{emptyTitle}</p>
        <p className="text-meta mt-1.5 text-faint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <ul className="-mx-2">
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            projectName={
              projectNames && task.projectId !== "inbox"
                ? projectNames[task.projectId]
                : undefined
            }
            onToggle={(t) => setCompleted(t.id, !t.completed)}
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}
