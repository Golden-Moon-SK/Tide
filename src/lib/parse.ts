import * as chrono from "chrono-node";
import type { Priority } from "@/db/schema";
import {
  describeRecurrence,
  matchRecurrence,
  serializeRecurrence,
  type Recurrence,
} from "./recurrence";

/**
 * Turns "lunch w/ Sam thurs 1pm p1 #work @errand" into a task.
 *
 * Deterministic, instant, offline and free — no model involved. Tide has to be
 * fully usable with the assistant switched off, so this is the baseline every
 * capture goes through, and the AI is only ever an addition on top.
 */

export type TokenKind = "date" | "priority" | "project" | "label" | "recurrence";

export interface CaptureToken {
  kind: TokenKind;
  /** Exact substring of the input that was consumed. */
  raw: string;
  start: number;
  end: number;
  /** What it resolved to, for the chip. */
  display: string;
}

export interface ParsedCapture {
  /** The input with every recognised token stripped out. */
  title: string;
  dueDate?: number;
  hasTime: boolean;
  priority: Priority;
  /** Name as typed after "#". The caller resolves or creates the project. */
  projectName?: string;
  /** Names as typed after "@". */
  labelNames: string[];
  recurrence?: string;
  /** In input order, for rendering chips under the capture bar. */
  tokens: CaptureToken[];
}

interface Span {
  start: number;
  end: number;
}

const PRIORITY_LABEL: Record<Priority, string> = {
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Normal",
};

/**
 * Words that only exist to introduce the date they precede. Left behind they
 * produce titles like "submit essay by", so the date span swallows them.
 */
const DATE_CONNECTOR = /(?:^|\s)(by|on|at|due|before|until|till|from)\s*$/i;

export function parseCapture(
  input: string,
  reference: Date = new Date(),
): ParsedCapture {
  const spans: Span[] = [];
  const tokens: CaptureToken[] = [];

  function overlaps(start: number, end: number): boolean {
    return spans.some((s) => start < s.end && end > s.start);
  }

  function claim(token: CaptureToken) {
    spans.push({ start: token.start, end: token.end });
    tokens.push(token);
  }

  // 1. Recurrence, before dates — chrono reads "every monday" as "monday" and
  //    would quietly turn a repeating task into a one-off.
  let recurrenceRule: Recurrence | undefined;
  const repeat = matchRecurrence(input);
  if (repeat) {
    recurrenceRule = repeat.rule;
    claim({
      kind: "recurrence",
      raw: repeat.text,
      start: repeat.start,
      end: repeat.end,
      display: describeRecurrence(repeat.rule),
    });
  }

  // 2. Priority: a bare p1-p4.
  let priority: Priority = 4;
  const priorityMatch = input.match(/(?:^|\s)(p[1-4])(?=\s|$)/i);
  if (priorityMatch?.index !== undefined) {
    const start = priorityMatch.index + priorityMatch[0].indexOf(priorityMatch[1]);
    const end = start + priorityMatch[1].length;
    if (!overlaps(start, end)) {
      priority = Number(priorityMatch[1][1]) as Priority;
      claim({
        kind: "priority",
        raw: priorityMatch[1],
        start,
        end,
        display: PRIORITY_LABEL[priority],
      });
    }
  }

  // 3. Project: the first #name wins; a second one is left in the title rather
  //    than silently discarded.
  let projectName: string | undefined;
  for (const match of input.matchAll(/#([\p{L}\p{N}_-]+)/gu)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end)) continue;
    projectName = match[1];
    claim({
      kind: "project",
      raw: match[0],
      start,
      end,
      display: match[1],
    });
    break;
  }

  // 4. Labels: all of them.
  const labelNames: string[] = [];
  for (const match of input.matchAll(/@([\p{L}\p{N}_-]+)/gu)) {
    if (match.index === undefined) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (overlaps(start, end)) continue;
    labelNames.push(match[1]);
    claim({ kind: "label", raw: match[0], start, end, display: match[1] });
  }

  // 5. Date. forwardDate means a bare "friday" is the one coming, not the one
  //    just gone — nobody schedules into the past.
  let dueDate: number | undefined;
  let hasTime = false;
  const results = chrono.parse(input, reference, { forwardDate: true });
  for (const result of results) {
    let start = result.index;
    const end = start + result.text.length;
    if (overlaps(start, end)) continue;

    // Swallow a trailing connector so "submit essay by friday" doesn't leave
    // "submit essay by" behind.
    const connector = input.slice(0, start).match(DATE_CONNECTOR);
    if (connector?.index !== undefined) {
      const connectorStart = connector.index + connector[0].indexOf(connector[1]);
      if (!overlaps(connectorStart, start)) start = connectorStart;
    }

    dueDate = result.date().getTime();
    hasTime = result.start.isCertain("hour");
    claim({
      kind: "date",
      raw: input.slice(start, end),
      start,
      end,
      display: result.text,
    });
    break;
  }

  tokens.sort((a, b) => a.start - b.start);

  return {
    title: stripSpans(input, spans),
    dueDate,
    hasTime,
    priority,
    projectName,
    labelNames,
    recurrence: recurrenceRule ? serializeRecurrence(recurrenceRule) : undefined,
    tokens,
  };
}

/** Removes every claimed span and tidies the whitespace they leave behind. */
function stripSpans(input: string, spans: Span[]): string {
  if (spans.length === 0) return input.trim();
  const ordered = [...spans].sort((a, b) => a.start - b.start);

  let out = "";
  let cursor = 0;
  for (const span of ordered) {
    if (span.start > cursor) out += input.slice(cursor, span.start);
    cursor = Math.max(cursor, span.end);
  }
  out += input.slice(cursor);

  return out.replace(/\s+/g, " ").trim();
}
