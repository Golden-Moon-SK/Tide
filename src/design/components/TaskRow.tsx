"use client";

import { motion } from "motion/react";
import { ListTree, Repeat } from "lucide-react";
import type { Task } from "@/db/schema";
import { PriorityDot } from "./PriorityDot";
import { DateChip } from "./DateChip";

/**
 * One task. Completing it is a spring and a collapse, not a checkbox flip —
 * the animation is most of what makes the app feel good, so it lives in the
 * shared component rather than being re-invented per list.
 */
export function TaskRow({
  task,
  projectName,
  progress,
  onToggle,
  onSelect,
  selected = false,
}: {
  task: Task;
  projectName?: string;
  /** Subtask completion, when the task has any. */
  progress?: { done: number; total: number };
  onToggle: (task: Task) => void;
  onSelect?: (task: Task) => void;
  selected?: boolean;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0 }}
      transition={{ type: "spring", stiffness: 520, damping: 40, mass: 0.6 }}
      className={`group flex gap-3 rounded-lg px-2 py-2.5 transition-colors ${
        selected ? "bg-surface-hover" : "hover:bg-surface-hover"
      }`}
    >
      <PriorityDot
        priority={task.priority}
        completed={task.completed}
        onToggle={() => onToggle(task)}
        label={task.title}
      />

      <button
        type="button"
        onClick={() => onSelect?.(task)}
        className="min-w-0 flex-1 cursor-default text-left"
      >
        <span
          className={`text-task block break-words ${
            task.completed ? "text-faint line-through" : "text-text"
          }`}
        >
          {task.title}
        </span>

        {(task.dueDate !== undefined ||
          projectName ||
          task.recurrence ||
          progress) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {task.dueDate !== undefined && (
              <DateChip dueDate={task.dueDate} hasTime={task.hasTime} />
            )}
            {task.recurrence && (
              <Repeat
                aria-label="Repeats"
                className="size-3 text-faint"
                strokeWidth={2}
              />
            )}
            {progress && progress.total > 0 && (
              <span className="text-meta inline-flex items-center gap-1 tabular-nums text-faint">
                <ListTree aria-hidden className="size-3" strokeWidth={2} />
                {progress.done}/{progress.total}
              </span>
            )}
            {projectName && (
              <span className="text-meta text-faint">{projectName}</span>
            )}
          </span>
        )}
      </button>
    </motion.li>
  );
}
