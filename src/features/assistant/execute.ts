import {
  allLabels,
  allProjects,
  completedToday,
  openCountsByProject,
  projectTasks,
  searchOpenTasks,
  somedayTasks,
  taskById,
  todayTasks,
  upcomingTasks,
} from "@/db/queries";
import {
  createTask,
  findOrCreateLabel,
  findOrCreateProject,
  setCompleted,
  updateTask,
} from "@/db/mutations";
import type { Priority, Task } from "@/db/schema";
import { fromDateInput, toDateInput, toTimeInput } from "@/lib/dates";
import { matchRecurrence, serializeRecurrence } from "@/lib/recurrence";
import { WRITE_TOOL_NAMES } from "./tools";

/**
 * Runs the assistant's tool calls in the browser, because that is where the
 * data is.
 *
 * Read tools run for real. Write tools return a Proposal instead of writing —
 * the UI shows it as a card and nothing changes until the user applies it.
 */

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export interface Proposal {
  id: string;
  kind: "create" | "update" | "complete";
  /** One line for the card, e.g. 'Draft the brief — Friday, #work'. */
  summary: string;
  apply: () => Promise<void>;
}

export interface ExecutionResult {
  results: ToolResultBlock[];
  proposals: Proposal[];
}

const PRIORITY_NAME: Record<Priority, string> = {
  1: "urgent",
  2: "high",
  3: "medium",
  4: "normal",
};

export async function executeToolCalls(
  blocks: ToolUseBlock[],
): Promise<ExecutionResult> {
  const results: ToolResultBlock[] = [];
  const proposals: Proposal[] = [];

  for (const block of blocks) {
    try {
      if (WRITE_TOOL_NAMES.has(block.name)) {
        const proposal = await buildProposal(block);
        proposals.push(proposal);
        // Claude is told the proposal is pending so it doesn't try again or
        // claim the change is already saved.
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({
            status: "proposed",
            awaiting: "user confirmation",
            summary: proposal.summary,
          }),
        });
      } else {
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: await runReadTool(block),
        });
      }
    } catch (error) {
      // A failed tool still gets a result — dropping one leaves the
      // conversation malformed on the next turn.
      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: error instanceof Error ? error.message : "Tool failed.",
        is_error: true,
      });
    }
  }

  return { results, proposals };
}

async function runReadTool(block: ToolUseBlock): Promise<string> {
  switch (block.name) {
    case "list_projects": {
      const [projects, labels, counts] = await Promise.all([
        allProjects(),
        allLabels(),
        openCountsByProject(),
      ]);
      return JSON.stringify({
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          open_tasks: counts[p.id] ?? 0,
          is_inbox: p.isInbox,
        })),
        labels: labels.map((l) => l.name),
      });
    }

    case "list_tasks": {
      const view = String(block.input.view ?? "today");
      const tasks = await tasksForView(view, block.input.project_id);
      return JSON.stringify({ view, tasks: await serializeTasks(tasks) });
    }

    case "search_tasks": {
      const query = String(block.input.query ?? "");
      const tasks = await searchOpenTasks(query, 20);
      return JSON.stringify({ query, tasks: await serializeTasks(tasks) });
    }

    default:
      throw new Error(`Unknown tool: ${block.name}`);
  }
}

async function tasksForView(
  view: string,
  projectId: unknown,
): Promise<Task[]> {
  switch (view) {
    case "today":
      return todayTasks();
    case "upcoming":
      return upcomingTasks();
    case "someday":
      return somedayTasks();
    case "completed":
      return completedToday();
    case "project": {
      if (typeof projectId !== "string" || !projectId) {
        throw new Error("project_id is required when view is 'project'.");
      }
      return projectTasks(projectId);
    }
    default:
      throw new Error(`Unknown view: ${view}`);
  }
}

/** Compact shape — the model needs enough to reason, not the whole row. */
async function serializeTasks(tasks: Task[]) {
  const [projects, labels] = await Promise.all([allProjects(), allLabels()]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const labelName = new Map(labels.map((l) => [l.id, l.name]));

  return tasks.map((task) => ({
    id: task.id,
    title: task.title,
    notes: task.notes || undefined,
    due_date: task.dueDate !== undefined ? toDateInput(task.dueDate) : undefined,
    due_time:
      task.dueDate !== undefined && task.hasTime
        ? toTimeInput(task.dueDate)
        : undefined,
    priority: task.priority,
    project: projectName.get(task.projectId),
    labels: task.labelIds.map((id) => labelName.get(id)).filter(Boolean),
    repeats: task.recurrence || undefined,
    is_subtask: task.parentId !== undefined || undefined,
  }));
}

async function buildProposal(block: ToolUseBlock): Promise<Proposal> {
  switch (block.name) {
    case "create_task":
      return buildCreate(block);
    case "update_task":
      return buildUpdate(block);
    case "complete_task":
      return buildComplete(block);
    default:
      throw new Error(`Unknown tool: ${block.name}`);
  }
}

function readDate(input: Record<string, unknown>): {
  dueDate?: number;
  hasTime: boolean;
} {
  const date = typeof input.due_date === "string" ? input.due_date : "";
  if (!date) return { hasTime: false };
  const time = typeof input.due_time === "string" ? input.due_time : undefined;
  const noonToday = new Date();
  noonToday.setHours(12, 0, 0, 0);
  const dueDate = fromDateInput(date, time, noonToday.getTime());
  return { dueDate, hasTime: Boolean(time) };
}

function readPriority(input: Record<string, unknown>): Priority | undefined {
  const value = Number(input.priority);
  return value >= 1 && value <= 4 ? ((value | 0) as Priority) : undefined;
}

function describeDate(dueDate?: number, hasTime = false): string | undefined {
  if (dueDate === undefined) return undefined;
  const date = new Date(dueDate);
  const day = date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return hasTime ? `${day} ${toTimeInput(dueDate)}` : day;
}

async function buildCreate(block: ToolUseBlock): Promise<Proposal> {
  const input = block.input;
  const title = String(input.title ?? "").trim();
  if (!title) throw new Error("create_task needs a title.");

  const { dueDate, hasTime } = readDate(input);
  const priority = readPriority(input);
  const projectNameInput =
    typeof input.project_name === "string" ? input.project_name : undefined;
  const labelNames = Array.isArray(input.label_names)
    ? input.label_names.filter((n): n is string => typeof n === "string")
    : [];
  const parentId =
    typeof input.parent_task_id === "string" ? input.parent_task_id : undefined;

  // The model writes recurrence in English; the same matcher the capture bar
  // uses turns it into a rule, so both paths agree on what "every monday" means.
  const repeat =
    typeof input.repeat === "string" ? matchRecurrence(input.repeat) : undefined;

  const parent = parentId ? await taskById(parentId) : undefined;

  const bits = [
    describeDate(dueDate, hasTime),
    projectNameInput ? `#${projectNameInput}` : undefined,
    priority && priority < 4 ? PRIORITY_NAME[priority] : undefined,
    labelNames.map((l) => `@${l}`).join(" ") || undefined,
    repeat ? "repeating" : undefined,
    parent ? `under “${parent.title}”` : undefined,
  ].filter(Boolean);

  return {
    id: block.id,
    kind: "create",
    summary: bits.length ? `${title} — ${bits.join(", ")}` : title,
    apply: async () => {
      const projectId = projectNameInput
        ? await findOrCreateProject(projectNameInput)
        : parent?.projectId;
      const labelIds: string[] = [];
      for (const name of labelNames) labelIds.push(await findOrCreateLabel(name));

      await createTask({
        title,
        notes: typeof input.notes === "string" ? input.notes : undefined,
        dueDate,
        hasTime,
        priority,
        projectId,
        parentId: parent?.id,
        labelIds,
        recurrence: repeat ? serializeRecurrence(repeat.rule) : undefined,
      });
    },
  };
}

async function buildUpdate(block: ToolUseBlock): Promise<Proposal> {
  const input = block.input;
  const taskId = String(input.task_id ?? "");
  const task = await taskById(taskId);
  if (!task) throw new Error(`No task with id ${taskId}. Search for it first.`);

  const changes: Partial<Task> = {};
  const described: string[] = [];

  if (typeof input.title === "string" && input.title.trim()) {
    changes.title = input.title.trim();
    described.push(`title → “${changes.title}”`);
  }
  if (typeof input.notes === "string") {
    changes.notes = input.notes;
    described.push("notes");
  }
  if (input.clear_due_date === true) {
    changes.dueDate = undefined;
    changes.hasTime = false;
    described.push("no date");
  } else if (typeof input.due_date === "string" && input.due_date) {
    const { dueDate, hasTime } = readDate(input);
    changes.dueDate = dueDate;
    changes.hasTime = hasTime;
    described.push(describeDate(dueDate, hasTime) ?? "new date");
  }
  const priority = readPriority(input);
  if (priority) {
    changes.priority = priority;
    described.push(`${PRIORITY_NAME[priority]} priority`);
  }

  const projectNameInput =
    typeof input.project_name === "string" ? input.project_name : undefined;
  if (projectNameInput) described.push(`#${projectNameInput}`);

  if (described.length === 0) throw new Error("update_task had no changes.");

  return {
    id: block.id,
    kind: "update",
    summary: `${task.title} — ${described.join(", ")}`,
    apply: async () => {
      if (projectNameInput) {
        changes.projectId = await findOrCreateProject(projectNameInput);
      }
      await updateTask(task.id, changes);
    },
  };
}

async function buildComplete(block: ToolUseBlock): Promise<Proposal> {
  const taskId = String(block.input.task_id ?? "");
  const task = await taskById(taskId);
  if (!task) throw new Error(`No task with id ${taskId}. Search for it first.`);

  return {
    id: block.id,
    kind: "complete",
    summary: `Complete “${task.title}”`,
    apply: () => setCompleted(task.id, true),
  };
}
