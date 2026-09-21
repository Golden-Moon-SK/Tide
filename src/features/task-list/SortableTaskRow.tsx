"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { TaskRow } from "@/design/components/TaskRow";
import type { Task } from "@/db/schema";

/**
 * A task row you can drag. The handle only appears on hover or keyboard focus,
 * so the list stays quiet until you actually want to rearrange it.
 */
export function SortableTaskRow({
  task,
  ...rest
}: {
  task: Task;
  projectName?: string;
  progress?: { done: number; total: number };
  onToggle: (task: Task) => void;
  onSelect?: (task: Task) => void;
  selected?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  return (
    <TaskRow
      task={task}
      {...rest}
      innerRef={setNodeRef}
      dragging={isDragging}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      handle={
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${task.title}`}
          className="-ml-1 cursor-grab touch-none rounded p-0.5 text-faint opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
        >
          <GripVertical aria-hidden className="size-3.5" strokeWidth={2} />
        </button>
      }
    />
  );
}
