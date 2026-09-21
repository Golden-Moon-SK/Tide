"use client";

import { AnimatePresence } from "motion/react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { TaskRow } from "@/design/components/TaskRow";
import { moveTaskBetween, setCompleted } from "@/db/mutations";
import { subtaskProgress } from "@/db/queries";
import type { Task } from "@/db/schema";
import { SortableTaskRow } from "./SortableTaskRow";

export function TaskList({
  tasks,
  projectNames,
  emptyTitle,
  emptyHint,
  onSelect,
  selectedId,
  sortable = false,
}: {
  tasks: Task[] | undefined;
  projectNames?: Record<string, string>;
  emptyTitle: string;
  emptyHint: string;
  onSelect?: (task: Task) => void;
  selectedId?: string;
  /**
   * Only project lists are reorderable. The smart lists are sorted by date, so
   * a manual order there would be overwritten the moment the query re-ran.
   */
  sortable?: boolean;
}) {
  // One query for every row's subtask count, rather than one per row.
  const progress = useLiveQuery(subtaskProgress, []) ?? {};

  const sensors = useSensors(
    // A small distance threshold so clicking a task to open it isn't read as
    // the start of a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !tasks) return;

    const from = tasks.findIndex((t) => t.id === active.id);
    const to = tasks.findIndex((t) => t.id === over.id);
    if (from === -1 || to === -1) return;

    // Work out the neighbours in the order the list will have, then let the
    // midpoint write put the task between them — no reindexing pass.
    const reordered = arrayMove(tasks, from, to);
    const at = reordered.findIndex((t) => t.id === active.id);
    await moveTaskBetween(
      String(active.id),
      reordered[at - 1],
      reordered[at + 1],
    );
  }

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

  const rowProps = (task: Task) => ({
    task,
    projectName:
      projectNames && task.projectId !== "inbox"
        ? projectNames[task.projectId]
        : undefined,
    progress: progress[task.id],
    onToggle: (t: Task) => void setCompleted(t.id, !t.completed),
    onSelect,
    selected: task.id === selectedId,
  });

  if (!sortable) {
    return (
      <ul className="-mx-2">
        <AnimatePresence initial={false}>
          {tasks.map((task) => (
            <TaskRow key={task.id} {...rowProps(task)} />
          ))}
        </AnimatePresence>
      </ul>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="-mx-2">
          <AnimatePresence initial={false}>
            {tasks.map((task) => (
              <SortableTaskRow key={task.id} {...rowProps(task)} />
            ))}
          </AnimatePresence>
        </ul>
      </SortableContext>
    </DndContext>
  );
}
