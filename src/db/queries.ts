import { db, type Label, type Task, type Project } from "./schema";

/**
 * Every smart-list definition lives here, and nowhere else. The UI and the
 * assistant both read from this file, so "what counts as Today" has exactly one
 * answer.
 *
 * These are plain async functions. Components call them through
 * `useLiveQuery()` from dexie-react-hooks, which re-runs them whenever the
 * underlying tables change.
 */

export function endOfDay(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function startOfDay(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Open, top-level tasks ordered the way every list orders them. */
function byListOrder(a: Task, b: Task): number {
  // Dated before undated, earliest first.
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === undefined) return 1;
    if (b.dueDate === undefined) return -1;
    return a.dueDate - b.dueDate;
  }
  if (a.priority !== b.priority) return a.priority - b.priority;
  return a.sortOrder - b.sortOrder;
}

function isOpenTopLevel(task: Task): boolean {
  return !task.completed && task.parentId === undefined;
}

/**
 * Today includes anything overdue — an overdue task you can't see is a task you
 * won't do. This is the one place that decision is made.
 */
export async function todayTasks(): Promise<Task[]> {
  const cutoff = endOfDay();
  const tasks = await db.tasks.where("dueDate").belowOrEqual(cutoff).toArray();
  return tasks.filter(isOpenTopLevel).sort(byListOrder);
}

/** Everything scheduled after today, earliest first. */
export async function upcomingTasks(): Promise<Task[]> {
  const cutoff = endOfDay();
  const tasks = await db.tasks.where("dueDate").above(cutoff).toArray();
  return tasks.filter(isOpenTopLevel).sort(byListOrder);
}

/** Open tasks with no date at all — the pile Todoist hides and Tide shouldn't. */
export async function somedayTasks(): Promise<Task[]> {
  const tasks = await db.tasks.toArray();
  return tasks
    .filter((t) => isOpenTopLevel(t) && t.dueDate === undefined)
    .sort(byListOrder);
}

/**
 * A project is the one place manual order wins. The smart lists are sorted by
 * date because that's what they're for; inside a project you arrange the work
 * yourself, so sortOrder alone decides and dragging a task actually sticks.
 */
export async function projectTasks(projectId: string): Promise<Task[]> {
  const tasks = await db.tasks.where("projectId").equals(projectId).toArray();
  return tasks
    .filter(isOpenTopLevel)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function subtasks(parentId: string): Promise<Task[]> {
  const tasks = await db.tasks.where("parentId").equals(parentId).toArray();
  return tasks.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Completed today, newest first — the "look what I did" list. */
export async function completedToday(): Promise<Task[]> {
  const from = startOfDay();
  const tasks = await db.tasks.toArray();
  return tasks
    .filter((t) => t.completed && (t.completedAt ?? 0) >= from)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

export async function allProjects(): Promise<Project[]> {
  const projects = await db.projects.toArray();
  return projects.sort((a, b) => {
    if (a.isInbox !== b.isInbox) return a.isInbox ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

export async function projectById(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

export async function taskById(id: string): Promise<Task | undefined> {
  return db.tasks.get(id);
}

/** Count of open tasks per project id, for the sidebar. */
export async function openCountsByProject(): Promise<Record<string, number>> {
  const tasks = await db.tasks.toArray();
  const counts: Record<string, number> = {};
  for (const task of tasks) {
    if (task.completed || task.parentId !== undefined) continue;
    counts[task.projectId] = (counts[task.projectId] ?? 0) + 1;
  }
  return counts;
}

export async function allLabels(): Promise<Label[]> {
  const labels = await db.labels.toArray();
  return labels.sort((a, b) => a.name.localeCompare(b.name));
}

export interface SubtaskProgress {
  done: number;
  total: number;
}

/**
 * Subtask progress for every parent in one pass, so a list of N tasks costs one
 * query rather than N.
 */
export async function subtaskProgress(): Promise<
  Record<string, SubtaskProgress>
> {
  const tasks = await db.tasks.toArray();
  const progress: Record<string, SubtaskProgress> = {};
  for (const task of tasks) {
    if (task.parentId === undefined) continue;
    const entry = (progress[task.parentId] ??= { done: 0, total: 0 });
    entry.total += 1;
    if (task.completed) entry.done += 1;
  }
  return progress;
}

/** Open tasks whose title contains `term`, for the command palette. */
export async function searchOpenTasks(
  term: string,
  limit = 8,
): Promise<Task[]> {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  const tasks = await db.tasks.toArray();
  return tasks
    .filter((t) => !t.completed && t.title.toLowerCase().includes(needle))
    .sort(byListOrder)
    .slice(0, limit);
}
