import { db, INBOX_ID, type Priority, type Project, type Task } from "./schema";

/**
 * Every write to the database goes through this file. Components never import
 * `db` directly, and the assistant's tool calls land here too — which is what
 * makes "propose, then apply" possible rather than the AI mutating state
 * wherever it likes.
 */

const SORT_STEP = 1024;

function newId(): string {
  return crypto.randomUUID();
}

/** Creates the Inbox on first run. Safe to call on every mount. */
export async function seedIfEmpty(): Promise<void> {
  const existing = await db.projects.get(INBOX_ID);
  if (existing) return;
  await db.projects.add({
    id: INBOX_ID,
    name: "Inbox",
    color: "grey",
    sortOrder: 0,
    isInbox: true,
    createdAt: Date.now(),
  });
}

/** Next sort order at the end of a project's list. */
async function nextSortOrder(projectId: string): Promise<number> {
  const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
  if (tasks.length === 0) return SORT_STEP;
  return Math.max(...tasks.map((t) => t.sortOrder)) + SORT_STEP;
}

export interface NewTask {
  title: string;
  notes?: string;
  dueDate?: number;
  hasTime?: boolean;
  priority?: Priority;
  projectId?: string;
  parentId?: string;
  labelIds?: string[];
  recurrence?: string;
}

export async function createTask(input: NewTask): Promise<string> {
  const projectId = input.projectId ?? INBOX_ID;
  const task: Task = {
    id: newId(),
    title: input.title.trim(),
    notes: input.notes ?? "",
    completed: false,
    dueDate: input.dueDate,
    hasTime: input.hasTime ?? false,
    priority: input.priority ?? 4,
    sortOrder: await nextSortOrder(projectId),
    createdAt: Date.now(),
    recurrence: input.recurrence,
    projectId,
    parentId: input.parentId,
    labelIds: input.labelIds ?? [],
  };
  await db.tasks.add(task);
  return task.id;
}

export async function updateTask(
  id: string,
  changes: Partial<Omit<Task, "id" | "createdAt">>,
): Promise<void> {
  await db.tasks.update(id, changes);
}

/**
 * Toggles completion. Subtasks follow the parent down, because a completed task
 * with open children is a lie.
 */
export async function setCompleted(
  id: string,
  completed: boolean,
): Promise<void> {
  await db.transaction("rw", db.tasks, async () => {
    await db.tasks.update(id, {
      completed,
      completedAt: completed ? Date.now() : undefined,
    });
    const children = await db.tasks.where("parentId").equals(id).toArray();
    for (const child of children) {
      await db.tasks.update(child.id, {
        completed,
        completedAt: completed ? Date.now() : undefined,
      });
    }
  });
}

export async function deleteTask(id: string): Promise<void> {
  await db.transaction("rw", db.tasks, async () => {
    const children = await db.tasks.where("parentId").equals(id).toArray();
    await db.tasks.bulkDelete(children.map((c) => c.id));
    await db.tasks.delete(id);
  });
}

/**
 * Drops a task between two neighbours by taking the midpoint of their sort
 * orders — no reindexing pass over the rest of the list.
 */
export async function moveTaskBetween(
  id: string,
  before: Task | undefined,
  after: Task | undefined,
): Promise<void> {
  let sortOrder: number;
  if (!before && !after) sortOrder = SORT_STEP;
  else if (!before) sortOrder = after!.sortOrder - SORT_STEP;
  else if (!after) sortOrder = before.sortOrder + SORT_STEP;
  else sortOrder = (before.sortOrder + after.sortOrder) / 2;
  await db.tasks.update(id, { sortOrder });
}

export async function createProject(
  name: string,
  color: string,
): Promise<string> {
  const projects = await db.projects.toArray();
  const project: Project = {
    id: newId(),
    name: name.trim(),
    color,
    sortOrder: projects.length * SORT_STEP + SORT_STEP,
    isInbox: false,
    createdAt: Date.now(),
  };
  await db.projects.add(project);
  return project.id;
}

export async function renameProject(id: string, name: string): Promise<void> {
  await db.projects.update(id, { name: name.trim() });
}

/** Deleting a project moves its tasks to the Inbox rather than destroying them. */
export async function deleteProject(id: string): Promise<void> {
  if (id === INBOX_ID) return;
  await db.transaction("rw", db.tasks, db.projects, async () => {
    const tasks = await db.tasks.where("projectId").equals(id).toArray();
    for (const task of tasks) {
      await db.tasks.update(task.id, { projectId: INBOX_ID });
    }
    await db.projects.delete(id);
  });
}
