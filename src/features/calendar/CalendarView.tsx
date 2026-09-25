"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dueSummary,
  endOfDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  tasksInRange,
} from "@/db/queries";
import type { Priority, Task } from "@/db/schema";

/**
 * The month grid. Upcoming is the flat "what's next" list; the calendar is the
 * shape of the month — where the work falls, where the gaps are — so you can
 * see today, this week and this month at a glance and plan against them.
 *
 * Like the assistant panel, this owns its own view rather than flowing through
 * `TaskList`: a grid of days is not a list of rows. It still opens tasks into
 * the same detail panel through `onSelect`, so the rest of the app is unchanged.
 */

const GRID_DAYS = 42; // Six weeks — a stable height whatever the month.

// Written out so Tailwind emits them; the priority tokens carry the meaning.
const PRIORITY_DOT: Record<Priority, string> = {
  1: "bg-priority-1",
  2: "bg-priority-2",
  3: "bg-priority-3",
  4: "bg-priority-4",
};

function monthLabel(anchor: Date): string {
  return anchor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function CalendarView({
  onSelect,
  selectedId,
}: {
  onSelect?: (task: Task) => void;
  selectedId?: string;
}) {
  // The first of whichever month is on screen. Navigation moves this; "Today"
  // returns it to the current month.
  const [anchor, setAnchor] = useState(() => new Date(startOfMonth()));

  // The 42 days the grid shows: from the Monday on or before the 1st, forward.
  const days = useMemo(() => {
    const cursor = new Date(startOfWeek(new Date(startOfMonth(anchor))));
    return Array.from({ length: GRID_DAYS }, () => {
      const day = new Date(cursor);
      cursor.setDate(cursor.getDate() + 1);
      return day;
    });
  }, [anchor]);

  const gridStart = days[0].getTime();
  const gridEnd = endOfDay(days[days.length - 1]);

  const tasks = useLiveQuery(
    () => tasksInRange(gridStart, gridEnd),
    [gridStart, gridEnd],
  );
  const summary = useLiveQuery(dueSummary, []);

  // Bucket each day's tasks by its local midnight, so a cell is one lookup.
  const byDay = useMemo(() => {
    const map = new Map<number, Task[]>();
    for (const task of tasks ?? []) {
      const key = startOfDay(new Date(task.dueDate as number));
      const bucket = map.get(key);
      if (bucket) bucket.push(task);
      else map.set(key, [task]);
    }
    return map;
  }, [tasks]);

  const todayKey = startOfDay();
  const anchorMonth = anchor.getMonth();
  const weekdayNames = days.slice(0, 7).map((d) =>
    d.toLocaleDateString(undefined, { weekday: "short" }),
  );
  const onCurrentMonth = startOfMonth() === anchor.getTime();

  function step(months: number) {
    setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + months, 1));
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-section font-medium tracking-tight tabular-nums">
          {monthLabel(anchor)}
        </h2>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setAnchor(new Date(startOfMonth()))}
            disabled={onCurrentMonth}
            className="text-meta rounded-lg px-2.5 py-1.5 font-medium text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:pointer-events-none disabled:opacity-40"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous month"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <ChevronLeft aria-hidden className="size-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next month"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
          >
            <ChevronRight aria-hidden className="size-4" strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Due today / this week / this month — always relative to now, not to
          the month being browsed. */}
      <div className="mb-5 flex flex-wrap gap-2">
        <SummaryPill label="Due today" count={summary?.today} />
        <SummaryPill label="This week" count={summary?.week} />
        <SummaryPill label="This month" count={summary?.month} />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="mb-1 grid grid-cols-7">
            {weekdayNames.map((name) => (
              <div
                key={name}
                className="text-meta px-2 pb-1 text-center font-medium text-faint"
              >
                {name}
              </div>
            ))}
          </div>

          <motion.div
            key={anchor.getTime()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-7 overflow-hidden rounded-xl border border-border"
          >
            {days.map((day) => {
              const key = day.getTime();
              const dayTasks = byDay.get(key) ?? [];
              const inMonth = day.getMonth() === anchorMonth;
              const isToday = key === todayKey;
              return (
                <DayCell
                  key={key}
                  day={day}
                  tasks={dayTasks}
                  inMonth={inMonth}
                  isToday={isToday}
                  selectedId={selectedId}
                  onSelect={onSelect}
                />
              );
            })}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SummaryPill({ label, count }: { label: string; count?: number }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1">
      <span className="text-meta text-muted">{label}</span>
      <span className="text-meta font-medium tabular-nums text-text">
        {count ?? "—"}
      </span>
    </span>
  );
}

const MAX_VISIBLE = 3;

function DayCell({
  day,
  tasks,
  inMonth,
  isToday,
  selectedId,
  onSelect,
}: {
  day: Date;
  tasks: Task[];
  inMonth: boolean;
  isToday: boolean;
  selectedId?: string;
  onSelect?: (task: Task) => void;
}) {
  const visible = tasks.slice(0, MAX_VISIBLE);
  const overflow = tasks.length - visible.length;

  return (
    <div
      className={`min-h-24 border-t border-l border-border p-1.5 [&:nth-child(7n+1)]:border-l-0 [&:nth-child(-n+7)]:border-t-0 ${
        inMonth ? "" : "bg-surface-sunken"
      }`}
    >
      <div className="mb-1 flex justify-end px-1">
        <span
          className={`text-meta grid size-5 place-items-center rounded-full tabular-nums ${
            isToday
              ? "bg-accent font-medium text-accent-contrast"
              : inMonth
                ? "text-muted"
                : "text-faint"
          }`}
        >
          {day.getDate()}
        </span>
      </div>

      <ul className="space-y-0.5">
        {visible.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              onClick={() => onSelect?.(task)}
              className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-hover ${
                task.id === selectedId ? "bg-surface-hover" : ""
              }`}
            >
              <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`}
              />
              <span className="text-meta min-w-0 flex-1 truncate text-text">
                {task.title}
              </span>
            </button>
          </li>
        ))}
        {overflow > 0 && (
          <li className="text-meta px-1 text-faint">+{overflow} more</li>
        )}
      </ul>
    </div>
  );
}
