<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Tide

A to-do app. Todoist's mental model (projects, natural-language quick add,
priorities, labels), a calmer UI, and an AI assistant.

Local-first and free to run: data lives in IndexedDB, there is no server, no
database and no hosting. The only thing that ever costs money is Claude tokens
on the owner's own key.

## Layout

```
src/
  app/            layout.tsx  page.tsx  globals.css
                  api/assistant/route.ts   the ONLY place the Claude key is touched
  db/             schema.ts  queries.ts  mutations.ts
  features/       quick-add/ task-list/ task-detail/ projects/ assistant/
  design/         tokens.css  components/
  lib/            parse.ts  recurrence.ts
```

## Data

Dexie over IndexedDB. Tables: `tasks`, `projects`, `labels`.

- `priority` is 1-4, Todoist-style: 1 = urgent, 4 = none.
- `sortOrder` is a float. Reorder by taking the midpoint between neighbours;
  never reindex a list.
- `hasTime` distinguishes "Friday" from "Friday 3pm". A `dueDate` alone is not
  enough to know whether to show a time.
- Dates are epoch milliseconds. IndexedDB cannot index a `Date`.
- Ids are `crypto.randomUUID()`.

**Every smart-list query lives in `src/db/queries.ts` and every write in
`src/db/mutations.ts`.** No component imports `db` directly. "What counts as
Today" is defined exactly once, and the assistant reads the same definition the
UI does.

Since the database lives in one browser profile, clearing site data wipes it.
JSON export/import is the only backup and is not optional.

## Design system

- **No hardcoded hex or px in a feature component.** Everything comes from
  `src/design/tokens.css` via Tailwind utilities. A raw `#5b8dee` or
  `text-[17px]` in a feature file is a bug.
- Both themes are authored deliberately in `tokens.css`. Dark mode is designed,
  not derived.
- Color carries meaning only: priority and project. Never decoration. Project
  colours are `--project-<name>`, one per `PROJECT_COLORS` entry; the name-to-
  class lookup lives in `src/design/components/ProjectGlyph.tsx`, because
  Tailwind only emits utilities it can see written out.
- The sidebar is the ground (`bg-surface-sidebar`) and the content column is
  lighter than it (`bg-surface`). That one step of contrast is what makes Tide
  read as an app rather than a page — don't flatten it.
- Light and dark are a real setting, not a media query we inherit:
  `useTheme()` plus the pre-paint `THEME_SCRIPT` in the root layout.
- Completion is a spring animation and the row collapsing, not a checkbox
  flipping. Use `motion`.
- Keyboard-first: `/` capture, `j`/`k` move the cursor, `x` completes, `e` or
  Enter opens, `cmd+K` is the palette. The key handler lives in `AppShell`,
  which is the only place that knows what the visible list is; `pane` there is
  the single description of what the main pane shows, and the list, the cursor
  and the empty state all read from it.
- Smart lists are sorted by date; a project list is sorted by `sortOrder` alone,
  so dragging a task inside a project actually sticks. Only project lists pass
  `sortable` to `TaskList`.

## AI

Two tiers.

**Free tier** — capture parsing, `src/lib/parse.ts`, `chrono-node` plus regex
for `p1`, `#project`, `@label`. Runs in the browser, instant, offline, no
tokens. **Tide must be fully usable with the assistant switched off**, so this
ships first and is the correctness baseline. It has unit tests; add a case
whenever it gets something wrong.

**Claude tier** — breakdown, day planning, weekly review, chat. Server-side in
`src/app/api/assistant/route.ts` using `@anthropic-ai/sdk`.

- `ANTHROPIC_API_KEY` comes from `.env.local`, server-side only. It must never
  reach the browser, and `.env.local` is gitignored.
- Model `claude-opus-5`, `thinking: { type: "adaptive" }` for reasoning-heavy
  requests. Never send `budget_tokens` - it is a 400 on this model.
- Stream the response back as a `ReadableStream`; `max_tokens: 64000`.
- Check `stop_reason === "refusal"` before reading content.
- Tool loop: while `stop_reason === "tool_use"`, return **all** `tool_result`
  blocks in a single user message.

**The assistant never writes to the database.** A tool call becomes a proposed
change rendered as a confirm card ("Create 3 tasks in #Work - Apply / Discard").
A bad parse must cost a tap, not a cleanup.

## React

- Don't reset state in an effect when a prop changes. Either mount the component
  only while it's needed (`CommandPalette`) or key it on the id (`TaskDetail`).
  The `react-hooks/set-state-in-effect` lint rule enforces this and it is not an
  error to silence. Effects are for DOM focus, event listeners and subscriptions.
- Lists animate through `motion`'s `layout`, which fights dnd-kit's transforms —
  `TaskRow` turns `layout` off while a row is being dragged.

## Working here

- `npm run dev` stays open; look at every change in the browser.
- `npm run build` and `npm test` must pass before a commit.
- `npx eslint .` too — the React Compiler rules catch real bugs here.
- Commit after every working feature. Small commits are the undo button.
- When a convention here changes, update this file in the same commit.
