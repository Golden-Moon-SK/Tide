"use client";

import type { ReactNode } from "react";

/**
 * One row of the sidebar. Smart lists pass an icon, projects pass their `#`
 * glyph — everything else about the row is identical, which is what makes the
 * two lists read as one navigation rather than two widgets.
 */
export function SidebarItem({
  label,
  glyph,
  count,
  active,
  onClick,
}: {
  label: string;
  glyph: ReactNode;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`text-task group flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 transition-colors ${
        active
          ? "bg-surface-selected font-medium text-text"
          : "text-muted hover:bg-surface-hover hover:text-text"
      }`}
    >
      {glyph}
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count ? (
        <span className="text-meta tabular-nums text-faint">{count}</span>
      ) : null}
    </button>
  );
}
