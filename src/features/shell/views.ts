import {
  CalendarDays,
  CheckCircle2,
  Inbox,
  Moon,
  Sparkles,
  Sun,
} from "lucide-react";

/**
 * What the main pane is showing. Smart lists are named; a project view carries
 * the project id. Everything that needs to compare two views goes through
 * `viewKey`, so the sidebar and the main pane can never disagree about which
 * item is selected.
 */
export type SmartView =
  | "inbox"
  | "today"
  | "upcoming"
  | "someday"
  | "completed"
  | "assistant";

export type View = { kind: SmartView } | { kind: "project"; id: string };

export function viewKey(view: View): string {
  return view.kind === "project" ? `project:${view.id}` : view.kind;
}

export function sameView(a: View, b: View): boolean {
  return viewKey(a) === viewKey(b);
}

export const SMART_VIEWS: {
  id: SmartView;
  label: string;
  icon: typeof Sun;
}[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "today", label: "Today", icon: Sun },
  { id: "upcoming", label: "Upcoming", icon: CalendarDays },
  { id: "someday", label: "Someday", icon: Moon },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
  { id: "assistant", label: "Assistant", icon: Sparkles },
];

/** The four that earn a slot in the mobile tab bar. */
export const MOBILE_VIEWS: SmartView[] = [
  "today",
  "upcoming",
  "inbox",
  "assistant",
];
