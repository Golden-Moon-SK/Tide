"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "motion/react";
import { Repeat, Trash2, X } from "lucide-react";
import { allLabels, allProjects, subtasks, taskById } from "@/db/queries";
import { deleteTask, findOrCreateLabel, updateTask } from "@/db/mutations";
import type { Priority, Task } from "@/db/schema";
import { describeRecurrence, parseRecurrenceRule } from "@/lib/recurrence";
import { PriorityPicker } from "./PriorityPicker";
import { DueDateField } from "./DueDateField";
import { SubtaskList } from "./SubtaskList";

/**
 * Everything about one task. A panel beside the list on desktop, a sheet over
 * it on mobile.
 *
 * Every control writes straight through to the database — there is no Save
 * button, because a to-do app that can lose an edit is a to-do app you stop
 * trusting. Only the title and notes are buffered locally, so typing doesn't
 * fight the round-trip.
 */
export function TaskDetail({
  taskId,
  onClose,
}: {
  taskId: string;
  onClose: () => void;
}) {
  const task = useLiveQuery(() => taskById(taskId), [taskId]);
  if (!task) return null;
  // Keyed on the id so opening a different task remounts the body and its
  // buffered fields start from that task, rather than being synced in an
  // effect after the fact.
  return <TaskDetailBody key={task.id} task={task} onClose={onClose} />;
}

function TaskDetailBody({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
}) {
  const children = useLiveQuery(() => subtasks(task.id), [task.id]);
  const projects = useLiveQuery(allProjects, []);
  const labels = useLiveQuery(allLabels, []);

  // Title and notes are the only buffered fields: typing shouldn't fight the
  // database round-trip. Everything else writes straight through.
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [labelDraft, setLabelDraft] = useState("");

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const recurrence = task.recurrence
    ? parseRecurrenceRule(task.recurrence)
    : undefined;

  function commitTitle() {
    const next = title.trim();
    if (!next || next === task.title) {
      setTitle(task.title);
      return;
    }
    void updateTask(task.id, { title: next });
  }

  async function addLabel(event: React.FormEvent) {
    event.preventDefault();
    const name = labelDraft.trim().replace(/^@/, "");
    if (!name) return;
    setLabelDraft("");
    const id = await findOrCreateLabel(name);
    if (task.labelIds.includes(id)) return;
    await updateTask(task.id, { labelIds: [...task.labelIds, id] });
  }

  function removeLabel(id: string) {
    void updateTask(task.id, {
      labelIds: task.labelIds.filter((l) => l !== id),
    });
  }

  const attached = (labels ?? []).filter((l) => task.labelIds.includes(l.id));

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      className="flex h-full flex-col bg-surface-raised"
    >
      <header className="flex items-start gap-2 border-b border-border px-4 py-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={commitTitle}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label="Task title"
          className="text-section min-w-0 flex-1 bg-transparent py-1 font-medium text-text focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close task"
          className="mt-1 shrink-0 rounded-md p-1 text-faint transition-colors hover:bg-surface-hover hover:text-text"
        >
          <X aria-hidden className="size-4" strokeWidth={2} />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <section>
          <h3 className="text-meta mb-2 text-faint">Notes</h3>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            onBlur={() => updateTask(task.id, { notes })}
            rows={3}
            placeholder="Anything worth remembering"
            aria-label="Notes"
            className="text-meta w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-text placeholder:text-faint focus:border-border-strong focus:outline-none"
          />
        </section>

        <section>
          <h3 className="text-meta mb-2 text-faint">Priority</h3>
          <PriorityPicker
            value={task.priority}
            onChange={(priority: Priority) => updateTask(task.id, { priority })}
          />
        </section>

        <section>
          <h3 className="text-meta mb-2 text-faint">Due</h3>
          <DueDateField
            dueDate={task.dueDate}
            hasTime={task.hasTime}
            onChange={(dueDate, hasTime) =>
              updateTask(task.id, { dueDate, hasTime })
            }
          />
          {recurrence && (
            <p className="text-meta mt-2 flex items-center gap-1.5 text-muted">
              <Repeat aria-hidden className="size-3" strokeWidth={2} />
              {describeRecurrence(recurrence)}
              <button
                type="button"
                onClick={() => updateTask(task.id, { recurrence: undefined })}
                className="ml-1 text-faint underline-offset-2 hover:text-danger hover:underline"
              >
                stop
              </button>
            </p>
          )}
        </section>

        <section>
          <h3 className="text-meta mb-2 text-faint">Project</h3>
          <select
            value={task.projectId}
            onChange={(event) =>
              updateTask(task.id, { projectId: event.target.value })
            }
            aria-label="Project"
            className="text-meta w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-text focus:border-border-strong focus:outline-none"
          >
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </section>

        <section>
          <h3 className="text-meta mb-2 text-faint">Labels</h3>
          {attached.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-1.5">
              {attached.map((label) => (
                <li key={label.id}>
                  <button
                    type="button"
                    onClick={() => removeLabel(label.id)}
                    aria-label={`Remove label ${label.name}`}
                    className="text-meta group inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-muted transition-colors hover:border-border-strong hover:text-text"
                  >
                    @{label.name}
                    <X
                      aria-hidden
                      className="size-3 text-faint group-hover:text-danger"
                      strokeWidth={2}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={addLabel}>
            <input
              value={labelDraft}
              onChange={(event) => setLabelDraft(event.target.value)}
              placeholder="Add a label"
              aria-label="Add a label"
              list="tide-labels"
              className="text-meta w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-text placeholder:text-faint focus:border-border-strong focus:outline-none"
            />
            <datalist id="tide-labels">
              {(labels ?? []).map((label) => (
                <option key={label.id} value={label.name} />
              ))}
            </datalist>
          </form>
        </section>

        <SubtaskList parent={task} items={children} />
      </div>

      <footer className="border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={async () => {
            await deleteTask(task.id);
            onClose();
          }}
          className="text-meta inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-danger"
        >
          <Trash2 aria-hidden className="size-3.5" strokeWidth={2} />
          Delete task
        </button>
      </footer>
    </motion.div>
  );
}
