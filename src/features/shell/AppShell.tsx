"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, Inbox, Sparkles, Sun } from "lucide-react";
import {
  allProjects,
  completedToday,
  somedayTasks,
  todayTasks,
  upcomingTasks,
} from "@/db/queries";
import { seedIfEmpty } from "@/db/mutations";
import { QuickAddBar } from "@/features/quick-add/QuickAddBar";
import { TaskList } from "@/features/task-list/TaskList";

type View = "today" | "upcoming" | "someday" | "assistant";

const NAV: { id: View; label: string; icon: typeof Sun }[] = [
  { id: "today", label: "Today", icon: Sun },
  { id: "upcoming", label: "Upcoming", icon: CalendarDays },
  { id: "someday", label: "Someday", icon: Inbox },
  { id: "assistant", label: "Assistant", icon: Sparkles },
];

export function AppShell() {
  const [view, setView] = useState<View>("today");

  useEffect(() => {
    void seedIfEmpty();
  }, []);

  const today = useLiveQuery(todayTasks, []);
  const upcoming = useLiveQuery(upcomingTasks, []);
  const someday = useLiveQuery(somedayTasks, []);
  const done = useLiveQuery(completedToday, []);
  const projects = useLiveQuery(allProjects, []);

  const projectNames = Object.fromEntries(
    (projects ?? []).map((p) => [p.id, p.name]),
  );

  const counts: Record<View, number | undefined> = {
    today: today?.length,
    upcoming: upcoming?.length,
    someday: someday?.length,
    assistant: undefined,
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl gap-10 px-5 py-10 sm:px-8 sm:py-14">
      <nav className="hidden w-44 shrink-0 sm:block">
        <p className="text-meta mb-5 pl-3 font-medium tracking-wide text-accent">
          Tide
        </p>
        <ul className="space-y-0.5">
          {NAV.map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setView(id)}
                  aria-current={active ? "page" : undefined}
                  className={`text-task flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors ${
                    active
                      ? "bg-accent-soft text-accent"
                      : "text-muted hover:bg-surface-hover hover:text-text"
                  }`}
                >
                  <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="flex-1 text-left">{label}</span>
                  {counts[id] ? (
                    <span className="text-meta tabular-nums text-faint">
                      {counts[id]}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <main className="min-w-0 flex-1">
        <header className="mb-6">
          <h1 className="text-display font-medium tracking-tight">
            {NAV.find((n) => n.id === view)?.label}
          </h1>
          {view === "today" && (
            <p className="text-meta mt-1 text-muted">
              {new Date().toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
          )}
        </header>

        {view !== "assistant" && (
          <div className="mb-7">
            <QuickAddBar />
          </div>
        )}

        {view === "today" && (
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

        {view === "upcoming" && (
          <TaskList
            tasks={upcoming}
            projectNames={projectNames}
            emptyTitle="Nothing scheduled ahead."
            emptyHint="The calm kind of empty."
          />
        )}

        {view === "someday" && (
          <TaskList
            tasks={someday}
            projectNames={projectNames}
            emptyTitle="No undated tasks."
            emptyHint="Everything you've captured has a date on it."
          />
        )}

        {view === "assistant" && (
          <div className="rounded-xl border border-dashed border-border px-5 py-14 text-center">
            <p className="text-section text-muted">The assistant lands in Phase 3.</p>
            <p className="text-meta mt-1.5 text-faint">
              Break down a task, plan your day, run a weekly review.
            </p>
          </div>
        )}

        {/* Mobile nav — the sidebar folds into a bar at the bottom */}
        <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-surface-raised/90 backdrop-blur sm:hidden">
          <ul className="flex">
            {NAV.map(({ id, label, icon: Icon }) => (
              <li key={id} className="flex-1">
                <button
                  type="button"
                  onClick={() => setView(id)}
                  className={`flex w-full flex-col items-center gap-1 py-2.5 ${
                    view === id ? "text-accent" : "text-faint"
                  }`}
                >
                  <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                  <span className="text-meta">{label}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="h-16 sm:hidden" />
      </main>
    </div>
  );
}
