"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { createProject } from "@/db/mutations";
import { PROJECT_COLORS, type Project, type ProjectColor } from "@/db/schema";
import { ProjectGlyph, projectTextColor } from "@/design/components/ProjectGlyph";
import { SidebarItem } from "@/features/shell/SidebarItem";
import { sameView, type View } from "@/features/shell/views";

/**
 * The "My Projects" block of the sidebar: the user's own projects, their open
 * counts, and the one-line form that adds another. Inbox is not here — it sits
 * with the smart lists above, because that is where you look for it.
 */
export function ProjectList({
  projects,
  counts,
  view,
  onSelect,
}: {
  projects: Project[] | undefined;
  counts: Record<string, number>;
  view: View;
  onSelect: (view: View) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<ProjectColor>(PROJECT_COLORS[0]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const own = (projects ?? []).filter((p) => !p.isInbox);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setName("");
    // Cycle the swatch so a run of quick adds doesn't come out all one colour.
    setColor(
      PROJECT_COLORS[
        (PROJECT_COLORS.indexOf(color) + 1) % PROJECT_COLORS.length
      ],
    );
    const id = await createProject(trimmed, color);
    onSelect({ kind: "project", id });
  }

  return (
    <section className="mt-6">
      <div className="mb-1 flex items-center justify-between pr-1 pl-3">
        <h2 className="text-meta font-medium tracking-wide text-faint uppercase">
          My Projects
        </h2>
        <button
          type="button"
          onClick={() => setAdding((open) => !open)}
          aria-label={adding ? "Cancel new project" : "Add project"}
          className="rounded-md p-1 text-faint transition-colors hover:bg-surface-hover hover:text-text"
        >
          {adding ? (
            <X aria-hidden className="size-3.5" strokeWidth={2} />
          ) : (
            <Plus aria-hidden className="size-3.5" strokeWidth={2} />
          )}
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="mb-1 px-1.5">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1.5">
            <ProjectGlyph color={color} />
            <input
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setAdding(false);
              }}
              placeholder="Project name"
              aria-label="Project name"
              className="text-task min-w-0 flex-1 bg-transparent text-text placeholder:text-faint focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Create project"
              className="rounded-md p-0.5 text-faint transition-colors hover:text-text"
            >
              <Check aria-hidden className="size-3.5" strokeWidth={2} />
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1 px-1">
            {PROJECT_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => setColor(swatch)}
                aria-label={swatch}
                aria-pressed={color === swatch}
                className={`text-meta size-5 rounded-md leading-none transition-colors ${projectTextColor(
                  swatch,
                )} ${color === swatch ? "bg-surface-selected" : "hover:bg-surface-hover"}`}
              >
                #
              </button>
            ))}
          </div>
        </form>
      )}

      {own.length === 0 && !adding ? (
        <p className="text-meta px-3 py-1.5 text-faint">
          No projects yet. Everything lands in Inbox.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {own.map((project) => {
            const target: View = { kind: "project", id: project.id };
            return (
              <li key={project.id}>
                <SidebarItem
                  label={project.name}
                  glyph={<ProjectGlyph color={project.color} />}
                  count={counts[project.id]}
                  active={sameView(view, target)}
                  onClick={() => onSelect(target)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
