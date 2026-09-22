/**
 * The assistant's tool contract.
 *
 * Shared deliberately: the route handler sends these schemas to Claude, and the
 * browser executes the calls. Tide's data never leaves the browser, so the
 * server genuinely cannot run these — it only relays.
 *
 * Read tools run immediately. Write tools don't write: they return a proposal,
 * which the UI renders as a card you apply or discard. A wrong suggestion
 * should cost a click, not a cleanup.
 */

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const DATE_FIELD = {
  type: "string",
  description:
    "Local calendar date as YYYY-MM-DD. Omit if the task has no date.",
};

const TIME_FIELD = {
  type: "string",
  description:
    "Local time as HH:MM (24-hour). Only include when a specific time was asked for; most tasks are all-day.",
};

const PRIORITY_FIELD = {
  type: "integer",
  enum: [1, 2, 3, 4],
  description: "1 urgent, 2 high, 3 medium, 4 normal. Default 4.",
};

export const READ_TOOLS: ToolDef[] = [
  {
    name: "list_projects",
    description:
      "List every project and label, with the number of open tasks in each. Call this before referring to a project by name.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_tasks",
    description:
      "List the tasks in one of Tide's lists. 'today' includes anything overdue.",
    input_schema: {
      type: "object",
      properties: {
        view: {
          type: "string",
          enum: ["today", "upcoming", "someday", "completed", "project"],
          description: "Which list to read.",
        },
        project_id: {
          type: "string",
          description: "Required when view is 'project'.",
        },
      },
      required: ["view"],
    },
  },
  {
    name: "search_tasks",
    description:
      "Find open tasks whose title contains the given text. Use this to get a task_id before updating or completing something.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to match in the title." },
      },
      required: ["query"],
    },
  },
];

export const WRITE_TOOLS: ToolDef[] = [
  {
    name: "create_task",
    description:
      "Propose a new task. This does NOT save anything — the user sees it as a card and chooses to apply it. Call once per task; for a breakdown, call it several times in the same turn.",
    input_schema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "The task itself, as an action. No dates or priority markers in the text — use the fields.",
        },
        notes: { type: "string", description: "Optional detail." },
        due_date: DATE_FIELD,
        due_time: TIME_FIELD,
        priority: PRIORITY_FIELD,
        project_name: {
          type: "string",
          description:
            "Project to file it under. An unknown name creates that project, so prefer one from list_projects.",
        },
        label_names: {
          type: "array",
          items: { type: "string" },
          description: "Labels to attach.",
        },
        repeat: {
          type: "string",
          description:
            "Plain English recurrence, e.g. 'every monday', 'every other week', 'daily'.",
        },
        parent_task_id: {
          type: "string",
          description:
            "Make this a subtask of an existing task. Use it when breaking a task down.",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "update_task",
    description:
      "Propose a change to an existing task. Does NOT save — the user confirms. Get the task_id from search_tasks or list_tasks first.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        due_date: DATE_FIELD,
        due_time: TIME_FIELD,
        clear_due_date: {
          type: "boolean",
          description: "Set true to remove the date entirely.",
        },
        priority: PRIORITY_FIELD,
        project_name: { type: "string" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "complete_task",
    description:
      "Propose marking a task done. Does NOT save — the user confirms.",
    input_schema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
];

export const ALL_TOOLS: ToolDef[] = [...READ_TOOLS, ...WRITE_TOOLS];

export const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((t) => t.name));

/**
 * Built per request so the model knows what day it is — the single most common
 * cause of a scheduling assistant getting things wrong.
 */
export function systemPrompt(now: Date = new Date()): string {
  const today = now.toLocaleDateString("en-CA"); // YYYY-MM-DD
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return `You are the assistant inside Tide, a personal to-do app.

Today is ${weekday}, ${today} (${zone}). Work out every relative date from that.

What you are for:
- Breaking a vague task into concrete, doable steps.
- Planning a day or a week from what is actually on the list.
- Reviewing what slipped, what is stale, and what should be dropped.
- Answering questions about the user's tasks.

How to work:
- Read before you write. Call list_tasks or search_tasks first; never invent a
  task_id or guess what is on the list.
- create_task, update_task and complete_task only PROPOSE. The user sees a card
  and applies or discards it. Say what you are proposing in plain words too.
- When breaking a task down, pass parent_task_id so the steps become subtasks of
  the original rather than loose tasks.
- Priority is 1-4 where 1 is urgent. Most things are 4. Reserve 1 for genuinely
  urgent work, or it stops meaning anything.
- Give a task a time only when the user asks for one. Most tasks are all-day.

Tone: brief and concrete. This is a tool, not a chat companion. No preamble, no
restating the question, no cheerleading. If the list is already in good shape,
say so rather than inventing work.`;
}
