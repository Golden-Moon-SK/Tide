import Dexie, { type EntityTable } from "dexie";

/** Todoist's scale: 1 is urgent, 4 is none. */
export type Priority = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  title: string;
  notes: string;
  completed: boolean;
  /** Epoch ms. Set when completed, cleared when un-completed. */
  completedAt?: number;
  /** Epoch ms. IndexedDB cannot index a Date, so dates are numbers throughout. */
  dueDate?: number;
  /** "Friday" vs "Friday 3pm" — a dueDate alone can't tell you whether to show a time. */
  hasTime: boolean;
  priority: Priority;
  /** Float. Reorder by taking the midpoint between neighbours; never reindex. */
  sortOrder: number;
  createdAt: number;
  /** Recurrence rule string, parsed at read time. Empty until Phase 2. */
  recurrence?: string;
  projectId: string;
  /** Set on subtasks. */
  parentId?: string;
  labelIds: string[];
}

export interface Project {
  id: string;
  name: string;
  /** A token name from PROJECT_COLORS, not a hex value. */
  color: string;
  sortOrder: number;
  isInbox: boolean;
  createdAt: number;
}

export interface Label {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

/** The project every task lands in when no other is named. */
export const INBOX_ID = "inbox";

export const PROJECT_COLORS = [
  "teal",
  "blue",
  "violet",
  "magenta",
  "red",
  "orange",
  "green",
  "grey",
] as const;

export type ProjectColor = (typeof PROJECT_COLORS)[number];

/**
 * `completed` is deliberately NOT indexed: IndexedDB has no boolean key type, so
 * Dexie would silently drop the index. Lists filter it in memory instead, which
 * is free at personal-to-do-list scale.
 */
export const db = new Dexie("tide") as Dexie & {
  tasks: EntityTable<Task, "id">;
  projects: EntityTable<Project, "id">;
  labels: EntityTable<Label, "id">;
};

db.version(1).stores({
  tasks: "id, projectId, parentId, dueDate, sortOrder, createdAt",
  projects: "id, sortOrder",
  labels: "id, name",
});
