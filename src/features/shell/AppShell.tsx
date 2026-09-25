"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Menu } from "lucide-react";
import {
  allProjects,
  completedToday,
  openCountsByProject,
  projectTasks,
  somedayTasks,
  todayTasks,
  upcomingTasks,
} from "@/db/queries";
import { seedIfEmpty, setCompleted } from "@/db/mutations";
import { INBOX_ID, type Task } from "@/db/schema";
import { QuickAddBar } from "@/features/quick-add/QuickAddBar";
import { TaskList } from "@/features/task-list/TaskList";
import { TaskDetail } from "@/features/task-detail/TaskDetail";
import { CommandPalette } from "@/features/command-palette/CommandPalette";
import { AssistantPanel } from "@/features/assistant/AssistantPanel";
import { CalendarView } from "@/features/calendar/CalendarView";
import { Sidebar } from "./Sidebar";
import { MOBILE_VIEWS, SMART_VIEWS, type SmartView, type View } from "./views";

const noopSubscribe = () => () => {};

function formatToday() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// The server formats in its own locale, the browser in the user's, so the
// date is only rendered on the client; the server snapshot is empty.
function TodayDate() {
  return useSyncExternalStore(noopSubscribe, formatToday, () => "");
}

export function AppShell() {
  const [view, setView] = useState<View>({ kind: "today" });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** The keyboard cursor. Separate from selection: j/k move it, Enter opens. */
  const [cursorId, setCursorId] = useState<string | null>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void seedIfEmpty();
  }, []);

  const today = useLiveQuery(todayTasks, []);
  const upcoming = useLiveQuery(upcomingTasks, []);
  const someday = useLiveQuery(somedayTasks, []);
  const done = useLiveQuery(completedToday, []);
  const projects = useLiveQuery(allProjects, []);
  const projectCounts = useLiveQuery(openCountsByProject, []) ?? {};

  // The inbox and a chosen project are the same query; only the id differs.
  const listProjectId =
    view.kind === "project" ? view.id : view.kind === "inbox" ? INBOX_ID : null;
  const inProject = useLiveQuery(
    () => (listProjectId ? projectTasks(listProjectId) : Promise.resolve([])),
    [listProjectId],
  );

  const projectNames = Object.fromEntries(
    (projects ?? []).map((p) => [p.id, p.name]),
  );

  /**
   * One description of whatever the main pane is showing. Everything else —
   * the list, the keyboard cursor, the empty state — reads from this, so they
   * can't drift apart as views are added.
   */
  const pane: {
    tasks: Task[] | undefined;
    sortable: boolean;
    emptyTitle: string;
    emptyHint: string;
    /** A line under the header, so each view announces what it's for. */
    subtitle?: string;
  } = useMemo(() => {
    switch (view.kind) {
      case "today":
        // Today's subtitle is the live date, rendered separately in the header.
        return {
          tasks: today,
          sortable: false,
          emptyTitle: "Nothing due today.",
          emptyHint: "Press / to capture something.",
        };
      case "upcoming":
        return {
          tasks: upcoming,
          sortable: false,
          subtitle: "Everything with a date still ahead.",
          emptyTitle: "Nothing scheduled ahead.",
          emptyHint: "The calm kind of empty.",
        };
      case "someday":
        return {
          tasks: someday,
          sortable: false,
          emptyTitle: "No undated tasks.",
          emptyHint: "Everything you've captured has a date on it.",
        };
      case "completed":
        return {
          tasks: done,
          sortable: false,
          emptyTitle: "Nothing finished today.",
          emptyHint: "Yet.",
        };
      case "assistant":
      case "calendar":
        // Both own their own pane rather than flowing through the task list.
        return { tasks: undefined, sortable: false, emptyTitle: "", emptyHint: "" };
      case "inbox":
        // The inbox is the unsorted pile, not a list like the others: its job is
        // to be emptied. Frame it as triage — file each task into a project or
        // give it a date — and celebrate zero rather than call it "nothing here".
        return {
          tasks: inProject,
          sortable: true,
          subtitle: "Unsorted. Send each task to a project, or give it a date.",
          emptyTitle: "Inbox zero.",
          emptyHint: "Everything's been sorted.",
        };
      default:
        return {
          tasks: inProject,
          sortable: true,
          emptyTitle: "Nothing here.",
          emptyHint: "Add the first task with the box above.",
        };
    }
  }, [view.kind, today, upcoming, someday, done, inProject]);

  const smartCounts: Partial<Record<SmartView, number>> = {
    inbox: projectCounts[INBOX_ID],
    today: today?.length,
    upcoming: upcoming?.length,
    someday: someday?.length,
  };

  const current =
    view.kind === "project"
      ? (projectNames[view.id] ?? "Project")
      : SMART_VIEWS.find((v) => v.id === view.kind)!.label;

  const go = useCallback((next: View) => {
    setView(next);
    setDrawerOpen(false);
    setSelectedId(null);
    setCursorId(null);
  }, []);

  const select = (task: Task) =>
    setSelectedId((currentId) => (currentId === task.id ? null : task.id));
  const closeDetail = useCallback(() => setSelectedId(null), []);

  const capture = useCallback(() => {
    setDrawerOpen(false);
    captureRef.current?.focus();
  }, []);

  const openTask = useCallback((taskId: string, projectId: string) => {
    setView({ kind: "project", id: projectId });
    setSelectedId(taskId);
    setCursorId(taskId);
  }, []);

  // Keyboard: j/k move the cursor, x completes, e or Enter opens, Cmd+K is the
  // palette. Held deliberately at the shell, which is the only place that knows
  // what the visible list currently is.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable;
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      const list = pane.tasks;
      if (!list || list.length === 0) return;
      const index = list.findIndex((t) => t.id === cursorId);

      switch (event.key) {
        case "j":
        case "ArrowDown": {
          event.preventDefault();
          const next = index < 0 ? 0 : Math.min(index + 1, list.length - 1);
          setCursorId(list[next].id);
          break;
        }
        case "k":
        case "ArrowUp": {
          event.preventDefault();
          const next = index < 0 ? 0 : Math.max(index - 1, 0);
          setCursorId(list[next].id);
          break;
        }
        case "x": {
          if (index < 0) return;
          event.preventDefault();
          const task = list[index];
          // Step the cursor on first, so it doesn't land on nothing when the
          // completed row leaves the list.
          setCursorId(list[Math.min(index + 1, list.length - 1)]?.id ?? null);
          void setCompleted(task.id, !task.completed);
          break;
        }
        case "e":
        case "Enter": {
          if (index < 0) return;
          event.preventDefault();
          setSelectedId(list[index].id);
          break;
        }
        case "Escape":
          setSelectedId(null);
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pane.tasks, cursorId]);

  const sidebar = (
    <Sidebar
      view={view}
      onSelect={go}
      onAddTask={capture}
      projects={projects}
      smartCounts={smartCounts}
      projectCounts={projectCounts}
    />
  );

  const list = (
    <TaskList
      tasks={pane.tasks}
      sortable={pane.sortable}
      projectNames={projectNames}
      emptyTitle={pane.emptyTitle}
      emptyHint={pane.emptyHint}
      onSelect={select}
      selectedId={selectedId ?? cursorId ?? undefined}
    />
  );

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {/* Desktop: the sidebar is furniture — always there, never a surprise. */}
      <aside className="hidden w-64 shrink-0 border-r border-border lg:block">
        {sidebar}
      </aside>

      {/* Mobile: the same sidebar, as a drawer over the content. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-accent/25 backdrop-blur-[2px]"
          />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border shadow-soft">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3 lg:px-10 lg:py-5">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text lg:hidden"
          >
            <Menu aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
          <div className="min-w-0">
            <h1 className="text-display truncate font-medium tracking-tight">
              {current}
            </h1>
            {view.kind === "today" && (
              <p className="text-meta mt-0.5 min-h-lh text-muted">
                <TodayDate />
              </p>
            )}
            {pane.subtitle && (
              <p className="text-meta mt-0.5 min-h-lh text-muted">
                {pane.subtitle}
              </p>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-24 lg:px-10 lg:pb-14">
          <div
            className={`mx-auto w-full ${
              view.kind === "calendar" ? "max-w-5xl" : "max-w-2xl"
            }`}
          >
            {view.kind !== "assistant" &&
              view.kind !== "calendar" &&
              view.kind !== "completed" && (
                <div className="mb-7">
                  <QuickAddBar
                    projectId={view.kind === "project" ? view.id : undefined}
                    inputRef={captureRef}
                  />
                </div>
              )}

            {view.kind === "assistant" ? (
              <AssistantPanel />
            ) : view.kind === "calendar" ? (
              <CalendarView
                onSelect={select}
                selectedId={selectedId ?? undefined}
              />
            ) : (
              list
            )}

            {view.kind === "today" && done && done.length > 0 && (
              <section className="mt-10">
                <h2 className="text-meta mb-2 px-2 text-faint">
                  Done today · {done.length}
                </h2>
                <TaskList
                  tasks={done}
                  projectNames={projectNames}
                  emptyTitle=""
                  emptyHint=""
                  onSelect={select}
                  selectedId={selectedId ?? undefined}
                />
              </section>
            )}
          </div>
        </main>

        {/* Mobile: four smart lists in reach of a thumb. The rest is the drawer. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-sidebar/95 backdrop-blur lg:hidden">
          <ul className="flex">
            {MOBILE_VIEWS.map((id) => {
              const entry = SMART_VIEWS.find((v) => v.id === id)!;
              const Icon = entry.icon;
              const active = view.kind === id;
              return (
                <li key={id} className="flex-1">
                  <button
                    type="button"
                    onClick={() => go({ kind: id })}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full flex-col items-center gap-1 py-2.5 transition-colors ${
                      active ? "text-text" : "text-faint"
                    }`}
                  >
                    <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                    <span className="text-meta">{entry.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Desktop: the detail sits beside the list, so you keep your place. */}
      {selectedId && (
        <aside className="hidden w-96 shrink-0 border-l border-border xl:block">
          <TaskDetail taskId={selectedId} onClose={closeDetail} />
        </aside>
      )}

      {/* Narrow: the same panel as a sheet over the content. */}
      {selectedId && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close task"
            onClick={closeDetail}
            className="absolute inset-0 bg-accent/25 backdrop-blur-[2px]"
          />
          <div className="absolute inset-y-0 right-0 w-full max-w-md border-l border-border shadow-soft">
            <TaskDetail taskId={selectedId} onClose={closeDetail} />
          </div>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectView={go}
        onSelectTask={openTask}
        onAddTask={capture}
      />
    </div>
  );
}
