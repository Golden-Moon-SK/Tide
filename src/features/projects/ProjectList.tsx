"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, MoreHorizontal, Palette, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createProject,
  deleteProject,
  renameProject,
  setProjectColor,
} from "@/db/mutations";
import { PROJECT_COLORS, type Project, type ProjectColor } from "@/db/schema";
import { ProjectGlyph, projectTextColor } from "@/design/components/ProjectGlyph";
import { SidebarItem } from "@/features/shell/SidebarItem";
import { sameView, type View } from "@/features/shell/views";

/**
 * The "My Projects" block of the sidebar: the user's own projects, their open
 * counts, and the one-line form that adds another. Inbox is not here — it sits
 * with the smart lists above, because that is where you look for it.
 *
 * Each project also carries its own management — rename, recolour, delete —
 * behind a hover-revealed menu, so the sidebar is where a project lives its
 * whole life rather than only where it's born.
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
          <SwatchPicker selected={color} onPick={setColor} />
        </form>
      )}

      {own.length === 0 && !adding ? (
        <p className="text-meta px-3 py-1.5 text-faint">
          No projects yet. Everything lands in Inbox.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {own.map((project) => (
            <li key={project.id}>
              <ProjectRow
                project={project}
                count={counts[project.id]}
                view={view}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The colour swatches, shared between the add form and a project's recolour. */
function SwatchPicker({
  selected,
  onPick,
}: {
  selected: string;
  onPick: (color: ProjectColor) => void;
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1 px-1">
      {PROJECT_COLORS.map((swatch) => (
        <button
          key={swatch}
          type="button"
          onClick={() => onPick(swatch)}
          aria-label={swatch}
          aria-pressed={selected === swatch}
          className={`text-meta size-5 rounded-md leading-none transition-colors ${projectTextColor(
            swatch,
          )} ${selected === swatch ? "bg-surface-selected" : "hover:bg-surface-hover"}`}
        >
          #
        </button>
      ))}
    </div>
  );
}

type RowMode = "idle" | "menu" | "rename" | "color" | "delete";

/**
 * One project in the sidebar: the navigable row, plus the management that used
 * to have nowhere to go. The trailing count gives way to a `⋯` on hover, and
 * every action stays inside the row — renaming in place, recolouring under it,
 * deleting behind a confirm — so nothing here throws you into a modal.
 */
function ProjectRow({
  project,
  count,
  view,
  onSelect,
}: {
  project: Project;
  count?: number;
  view: View;
  onSelect: (view: View) => void;
}) {
  const [mode, setMode] = useState<RowMode>("idle");
  const [draft, setDraft] = useState(project.name);
  const renameRef = useRef<HTMLInputElement>(null);
  const target: View = { kind: "project", id: project.id };

  useEffect(() => {
    if (mode === "rename") {
      renameRef.current?.focus();
      renameRef.current?.select();
    }
  }, [mode]);

  async function commitRename(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    if (trimmed && trimmed !== project.name) {
      await renameProject(project.id, trimmed);
    }
    setMode("idle");
  }

  async function remove() {
    // Deleting moves the project's tasks to the Inbox rather than destroying
    // them, so if we're standing in this project, step back to the Inbox.
    if (sameView(view, target)) onSelect({ kind: "inbox" });
    await deleteProject(project.id);
  }

  if (mode === "rename") {
    return (
      <form onSubmit={commitRename} className="px-1.5">
        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-raised px-2 py-1.5">
          <ProjectGlyph color={project.color} />
          <input
            ref={renameRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setDraft(project.name);
                setMode("idle");
              }
            }}
            aria-label={`Rename ${project.name}`}
            className="text-task min-w-0 flex-1 bg-transparent text-text placeholder:text-faint focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Save name"
            className="rounded-md p-0.5 text-faint transition-colors hover:text-text"
          >
            <Check aria-hidden className="size-3.5" strokeWidth={2} />
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="group relative">
      <SidebarItem
        label={project.name}
        glyph={<ProjectGlyph color={project.color} />}
        // The count moves aside for the menu trigger, so we hide the built-in
        // one whenever the trailing slot is in use.
        count={mode === "idle" ? count : undefined}
        active={sameView(view, target)}
        onClick={() => onSelect(target)}
      />

      {/* The trigger overlays the count on hover or while any menu is open. */}
      <button
        type="button"
        onClick={() => setMode((m) => (m === "idle" ? "menu" : "idle"))}
        aria-label={`Actions for ${project.name}`}
        aria-expanded={mode !== "idle"}
        className={`absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-faint transition-colors hover:bg-surface-hover hover:text-text focus-visible:opacity-100 group-hover:opacity-100 ${
          mode === "idle" ? "opacity-0" : "opacity-100"
        }`}
      >
        <MoreHorizontal aria-hidden className="size-3.5" strokeWidth={2} />
      </button>

      {mode !== "idle" && (
        <>
          {/* Catches the outside click that closes the menu. */}
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setMode("idle")}
            className="fixed inset-0 z-40 cursor-default"
          />
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className="absolute top-full right-1.5 z-50 mt-1 w-52 origin-top-right overflow-hidden rounded-lg border border-border bg-surface-raised p-1 shadow-soft"
          >
            {mode === "menu" && (
              <ul className="space-y-0.5">
                <li>
                  <MenuButton
                    icon={Pencil}
                    label="Rename"
                    onClick={() => {
                      setDraft(project.name);
                      setMode("rename");
                    }}
                  />
                </li>
                <li>
                  <MenuButton
                    icon={Palette}
                    label="Change colour"
                    onClick={() => setMode("color")}
                  />
                </li>
                <li>
                  <MenuButton
                    icon={Trash2}
                    label="Delete project"
                    danger
                    onClick={() => setMode("delete")}
                  />
                </li>
              </ul>
            )}

            {mode === "color" && (
              <SwatchPicker
                selected={project.color}
                onPick={(swatch) => {
                  void setProjectColor(project.id, swatch);
                  setMode("idle");
                }}
              />
            )}

            {mode === "delete" && (
              <div className="px-1.5 py-1">
                <p className="text-meta text-muted">
                  Delete “{project.name}”? Its tasks move to the Inbox.
                </p>
                <div className="mt-2 flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMode("idle")}
                    className="text-meta rounded-md px-2 py-1 text-muted transition-colors hover:bg-surface-hover hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove()}
                    className="text-meta rounded-md bg-danger px-2 py-1 font-medium text-accent-contrast transition-opacity hover:opacity-90"
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: typeof Pencil;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-task flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover ${
        danger ? "text-danger" : "text-muted hover:text-text"
      }`}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
