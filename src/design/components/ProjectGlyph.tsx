import type { ProjectColor } from "@/db/schema";

/**
 * A project's `#` in the project's own colour.
 *
 * The class strings are written out rather than built from the colour name,
 * because Tailwind only emits utilities it can see in the source. A lookup here
 * is also the one place a new PROJECT_COLORS entry has to be registered.
 */
const TEXT: Record<ProjectColor, string> = {
  teal: "text-project-teal",
  blue: "text-project-blue",
  violet: "text-project-violet",
  magenta: "text-project-magenta",
  red: "text-project-red",
  orange: "text-project-orange",
  green: "text-project-green",
  grey: "text-project-grey",
};

export function projectTextColor(color: string): string {
  return TEXT[color as ProjectColor] ?? TEXT.grey;
}

export function ProjectGlyph({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className={`text-task w-4 shrink-0 text-center font-medium ${projectTextColor(color)}`}
    >
      #
    </span>
  );
}
