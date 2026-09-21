"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { motion } from "motion/react";
import { Hash, Moon, Plus, Search, Sun } from "lucide-react";
import { allProjects, searchOpenTasks } from "@/db/queries";
import { SMART_VIEWS, type View } from "@/features/shell/views";
import { useTheme } from "@/features/shell/useTheme";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Hash;
  run: () => void;
}

/**
 * Cmd+K. Jump to a list, jump to a project, find a task by name, or run an
 * action — one input, no modes.
 *
 * This is the thing a web app can do better than a native to-do app, so it gets
 * the same weight as the capture bar rather than being an afterthought.
 */
export function CommandPalette({
  open,
  ...rest
}: {
  open: boolean;
  onClose: () => void;
  onSelectView: (view: View) => void;
  onSelectTask: (taskId: string, projectId: string) => void;
  onAddTask: () => void;
}) {
  // Mounted only while open, so the query and cursor start empty by virtue of
  // being new state rather than being reset in an effect after the fact.
  if (!open) return null;
  return <PaletteBody {...rest} />;
}

function PaletteBody({
  onClose,
  onSelectView,
  onSelectTask,
  onAddTask,
}: {
  onClose: () => void;
  onSelectView: (view: View) => void;
  onSelectTask: (taskId: string, projectId: string) => void;
  onAddTask: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { resolved, setTheme } = useTheme();

  const projects = useLiveQuery(allProjects, []);
  // Searched only while the palette is open and only once you've typed.
  const tasks = useLiveQuery(
    () => (query.trim() ? searchOpenTasks(query) : Promise.resolve([])),
    [query],
  );

  const commands = useMemo<Command[]>(() => {
    const needle = query.trim().toLowerCase();
    const match = (text: string) =>
      needle === "" || text.toLowerCase().includes(needle);

    const views: Command[] = SMART_VIEWS.filter((v) => match(v.label)).map(
      (v) => ({
        id: `view:${v.id}`,
        label: v.label,
        hint: "List",
        icon: v.icon,
        run: () => onSelectView({ kind: v.id }),
      }),
    );

    const projectCommands: Command[] = (projects ?? [])
      .filter((p) => !p.isInbox && match(p.name))
      .map((p) => ({
        id: `project:${p.id}`,
        label: p.name,
        hint: "Project",
        icon: Hash,
        run: () => onSelectView({ kind: "project", id: p.id }),
      }));

    const actions: Command[] = [
      {
        id: "action:add",
        label: "Add a task",
        hint: "Action",
        icon: Plus,
        run: onAddTask,
      },
      {
        id: "action:theme",
        label: resolved === "dark" ? "Switch to light" : "Switch to dark",
        hint: "Action",
        icon: resolved === "dark" ? Sun : Moon,
        run: () => setTheme(resolved === "dark" ? "light" : "dark"),
      },
    ].filter((c) => match(c.label));

    // Tasks only once you've typed — otherwise the palette opens as a wall of
    // everything you have to do, which is the opposite of useful.
    const taskCommands: Command[] =
      needle === ""
        ? []
        : (tasks ?? []).map((t) => ({
            id: `task:${t.id}`,
            label: t.title,
            hint: "Task",
            icon: Search,
            run: () => onSelectTask(t.id, t.projectId),
          }));

    return [...views, ...projectCommands, ...actions, ...taskCommands];
  }, [
    query,
    projects,
    tasks,
    resolved,
    onSelectView,
    onSelectTask,
    onAddTask,
    setTheme,
  ]);

  // Focusing a DOM node is exactly what an effect is for.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const clamped = Math.min(active, Math.max(commands.length - 1, 0));

  function choose(command: Command | undefined) {
    if (!command) return;
    command.run();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-60 flex items-start justify-center px-4 pt-[12vh]">
      <button
        type="button"
        aria-label="Close command palette"
        onClick={onClose}
        className="absolute inset-0 bg-accent/25 backdrop-blur-[2px]"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 36 }}
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-surface-raised shadow-soft"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-3">
          <Search
            aria-hidden
            className="size-4 shrink-0 text-faint"
            strokeWidth={2}
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => (i + 1) % Math.max(commands.length, 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive(
                  (i) =>
                    (i - 1 + Math.max(commands.length, 1)) %
                    Math.max(commands.length, 1),
                );
              } else if (event.key === "Enter") {
                event.preventDefault();
                choose(commands[clamped]);
              }
            }}
            placeholder="Jump to a list, find a task…"
            aria-label="Command palette"
            className="text-task min-w-0 flex-1 bg-transparent text-text placeholder:text-faint focus:outline-none"
          />
        </div>

        <ul className="max-h-80 overflow-y-auto py-1.5">
          {commands.length === 0 && (
            <li className="text-meta px-4 py-6 text-center text-faint">
              Nothing matches “{query}”.
            </li>
          )}
          {commands.map((command, index) => {
            const Icon = command.icon;
            return (
              <li key={command.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(command)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                    index === clamped ? "bg-surface-hover" : ""
                  }`}
                >
                  <Icon
                    aria-hidden
                    className="size-4 shrink-0 text-faint"
                    strokeWidth={1.75}
                  />
                  <span className="text-task min-w-0 flex-1 truncate text-text">
                    {command.label}
                  </span>
                  {command.hint && (
                    <span className="text-meta shrink-0 text-faint">
                      {command.hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </motion.div>
    </div>
  );
}
