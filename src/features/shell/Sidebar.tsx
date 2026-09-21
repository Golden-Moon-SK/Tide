"use client";

import { Moon, Plus, Sun, Waves } from "lucide-react";
import type { Project } from "@/db/schema";
import { ProjectList } from "@/features/projects/ProjectList";
import { SidebarItem } from "./SidebarItem";
import { useTheme } from "./useTheme";
import { sameView, SMART_VIEWS, type SmartView, type View } from "./views";

/**
 * The sidebar. It is the app's furniture: a warmer ground than the content
 * column, full height, and always showing what there is and how much of it —
 * which is the difference between a page with links on it and a place you work.
 */
export function Sidebar({
  view,
  onSelect,
  onAddTask,
  projects,
  smartCounts,
  projectCounts,
}: {
  view: View;
  onSelect: (view: View) => void;
  onAddTask: () => void;
  projects: Project[] | undefined;
  smartCounts: Partial<Record<SmartView, number>>;
  projectCounts: Record<string, number>;
}) {
  const { resolved, setTheme } = useTheme();
  const dark = resolved === "dark";

  return (
    <div className="flex h-full flex-col bg-surface-sidebar">
      <header className="flex items-center justify-between px-4 pt-4 pb-3">
        <span className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-lg bg-accent text-accent-contrast">
            <Waves aria-hidden className="size-4" strokeWidth={2} />
          </span>
          <span className="text-section font-medium tracking-tight">Tide</span>
        </span>
        <button
          type="button"
          onClick={() => setTheme(dark ? "light" : "dark")}
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          {dark ? (
            <Sun aria-hidden className="size-4" strokeWidth={1.75} />
          ) : (
            <Moon aria-hidden className="size-4" strokeWidth={1.75} />
          )}
        </button>
      </header>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onAddTask}
          className="text-task flex w-full items-center gap-2 rounded-xl bg-accent px-3 py-2 font-medium text-accent-contrast shadow-soft transition-colors hover:bg-accent-hover"
        >
          <Plus aria-hidden className="size-4" strokeWidth={2.25} />
          Add task
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-4">
        <ul className="space-y-0.5">
          {SMART_VIEWS.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <SidebarItem
                label={label}
                glyph={
                  <Icon
                    aria-hidden
                    className="size-4 shrink-0"
                    strokeWidth={1.75}
                  />
                }
                count={smartCounts[id]}
                active={sameView(view, { kind: id })}
                onClick={() => onSelect({ kind: id })}
              />
            </li>
          ))}
        </ul>

        <ProjectList
          projects={projects}
          counts={projectCounts}
          view={view}
          onSelect={onSelect}
        />
      </div>

      <footer className="border-t border-border px-4 py-3">
        <p className="text-meta text-faint">
          Press{" "}
          <kbd className="rounded border border-border bg-surface-raised px-1 py-0.5 font-sans">
            /
          </kbd>{" "}
          to capture anything.
        </p>
      </footer>
    </div>
  );
}
