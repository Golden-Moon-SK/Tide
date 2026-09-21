"use client";

import { useEffect, useRef, useState } from "react";
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
import { seedIfEmpty } from "@/db/mutations";
import { INBOX_ID } from "@/db/schema";
import { QuickAddBar } from "@/features/quick-add/QuickAddBar";
import { TaskList } from "@/features/task-list/TaskList";
import { Sidebar } from "./Sidebar";
import { MOBILE_VIEWS, SMART_VIEWS, type SmartView, type View } from "./views";

export function AppShell() {
  const [view, setView] = useState<View>({ kind: "today" });
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const smartCounts: Partial<Record<SmartView, number>> = {
    inbox: projectCounts[INBOX_ID],
    today: today?.length,
    upcoming: upcoming?.length,
    someday: someday?.length,
  };

  const current =
    view.kind === "project"
      ? projectNames[view.id] ?? "Project"
      : SMART_VIEWS.find((v) => v.id === view.kind)!.label;

  function go(next: View) {
    setView(next);
    setDrawerOpen(false);
  }

  function capture() {
    setDrawerOpen(false);
    captureRef.current?.focus();
  }

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
              <p className="text-meta mt-0.5 text-muted">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
            )}
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-24 lg:px-10 lg:pb-14">
          <div className="mx-auto w-full max-w-2xl">
            {view.kind !== "assistant" && view.kind !== "completed" && (
              <div className="mb-7">
                <QuickAddBar
                  projectId={view.kind === "project" ? view.id : undefined}
                  inputRef={captureRef}
                />
              </div>
            )}

            {view.kind === "today" && (
              <>
                <TaskList
                  tasks={today}
                  projectNames={projectNames}
                  emptyTitle="Nothing due today."
                  emptyHint="Press / to capture something."
                />
                {done && done.length > 0 && (
                  <section className="mt-10">
                    <h2 className="text-meta mb-2 px-2 text-faint">
                      Done today · {done.length}
                    </h2>
                    <TaskList
                      tasks={done}
                      projectNames={projectNames}
                      emptyTitle=""
                      emptyHint=""
                    />
                  </section>
                )}
              </>
            )}

            {view.kind === "upcoming" && (
              <TaskList
                tasks={upcoming}
                projectNames={projectNames}
                emptyTitle="Nothing scheduled ahead."
                emptyHint="The calm kind of empty."
              />
            )}

            {view.kind === "someday" && (
              <TaskList
                tasks={someday}
                projectNames={projectNames}
                emptyTitle="No undated tasks."
                emptyHint="Everything you've captured has a date on it."
              />
            )}

            {(view.kind === "inbox" || view.kind === "project") && (
              <TaskList
                tasks={inProject}
                projectNames={projectNames}
                emptyTitle="Nothing here."
                emptyHint="Add the first task with the box above."
              />
            )}

            {view.kind === "completed" && (
              <TaskList
                tasks={done}
                projectNames={projectNames}
                emptyTitle="Nothing finished today."
                emptyHint="Yet."
              />
            )}

            {view.kind === "assistant" && (
              <div className="rounded-xl border border-dashed border-border px-5 py-14 text-center">
                <p className="text-section text-muted">
                  The assistant lands in Phase 3.
                </p>
                <p className="text-meta mt-1.5 text-faint">
                  Break down a task, plan your day, run a weekly review.
                </p>
              </div>
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
    </div>
  );
}
