/**
 * A deliberately small subset of RFC 5545, stored on the task as a string and
 * parsed at read time: FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, an optional INTERVAL,
 * and an optional BYDAY for weekly rules.
 *
 * Small on purpose. "Every other Tuesday" covers essentially every recurring
 * personal task; full RRULE support would be a library and a lot of surface
 * area for no gain.
 */

export interface Recurrence {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  /** Two-letter RFC 5545 weekday, weekly rules only. */
  byDay?: string;
}

const WEEKDAYS: { names: string[]; code: string; index: number }[] = [
  { names: ["sunday", "sun"], code: "SU", index: 0 },
  { names: ["monday", "mon"], code: "MO", index: 1 },
  { names: ["tuesday", "tues", "tue"], code: "TU", index: 2 },
  { names: ["wednesday", "weds", "wed"], code: "WE", index: 3 },
  { names: ["thursday", "thurs", "thur", "thu"], code: "TH", index: 4 },
  { names: ["friday", "fri"], code: "FR", index: 5 },
  { names: ["saturday", "sat"], code: "SA", index: 6 },
];

const WEEKDAY_LABEL: Record<string, string> = {
  SU: "Sunday",
  MO: "Monday",
  TU: "Tuesday",
  WE: "Wednesday",
  TH: "Thursday",
  FR: "Friday",
  SA: "Saturday",
};

export function serializeRecurrence(rule: Recurrence): string {
  const parts = [`FREQ=${rule.freq}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay) parts.push(`BYDAY=${rule.byDay}`);
  return parts.join(";");
}

export function parseRecurrenceRule(rule: string): Recurrence | undefined {
  const fields = Object.fromEntries(
    rule.split(";").map((part) => {
      const [key, value] = part.split("=");
      return [key?.toUpperCase(), value];
    }),
  );
  const freq = fields.FREQ as Recurrence["freq"] | undefined;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) {
    return undefined;
  }
  const interval = Number(fields.INTERVAL ?? 1);
  return {
    freq,
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1,
    byDay: fields.BYDAY,
  };
}

const WEEKDAY_PATTERN = WEEKDAYS.flatMap((d) => d.names).join("|");

/**
 * Finds a recurrence phrase in raw capture text. Returns the rule plus the
 * span it occupied, so the caller can strip it out of the title.
 *
 * Runs before the date parser, because chrono reads "every monday" as simply
 * "monday" and would silently turn a repeating task into a one-off.
 */
export function matchRecurrence(
  text: string,
): { rule: Recurrence; start: number; end: number; text: string } | undefined {
  const patterns: { re: RegExp; build: (m: RegExpMatchArray) => Recurrence }[] = [
    {
      re: /\bevery\s+other\s+(day|week|month|year)\b/i,
      build: (m) => ({ freq: unitToFreq(m[1]), interval: 2 }),
    },
    {
      re: new RegExp(`\\bevery\\s+other\\s+(${WEEKDAY_PATTERN})\\b`, "i"),
      build: (m) => ({
        freq: "WEEKLY",
        interval: 2,
        byDay: weekdayCode(m[1]),
      }),
    },
    {
      re: /\bevery\s+(\d+)\s+(day|week|month|year)s?\b/i,
      build: (m) => ({ freq: unitToFreq(m[2]), interval: Number(m[1]) }),
    },
    {
      re: new RegExp(`\\bevery\\s+(${WEEKDAY_PATTERN})\\b`, "i"),
      build: (m) => ({ freq: "WEEKLY", interval: 1, byDay: weekdayCode(m[1]) }),
    },
    {
      re: /\bevery\s+(day|week|month|year)\b/i,
      build: (m) => ({ freq: unitToFreq(m[1]), interval: 1 }),
    },
    {
      re: /\b(daily|weekly|monthly|yearly|annually)\b/i,
      build: (m) => ({ freq: wordToFreq(m[1]), interval: 1 }),
    },
  ];

  // "every other tuesday" must win over "every other" + "tuesday", so the
  // more specific patterns are tried first and the first hit wins.
  for (const { re, build } of patterns) {
    const match = text.match(re);
    if (match?.index === undefined) continue;
    return {
      rule: build(match),
      start: match.index,
      end: match.index + match[0].length,
      text: match[0],
    };
  }
  return undefined;
}

function unitToFreq(unit: string): Recurrence["freq"] {
  switch (unit.toLowerCase()) {
    case "day":
      return "DAILY";
    case "week":
      return "WEEKLY";
    case "month":
      return "MONTHLY";
    default:
      return "YEARLY";
  }
}

function wordToFreq(word: string): Recurrence["freq"] {
  switch (word.toLowerCase()) {
    case "daily":
      return "DAILY";
    case "weekly":
      return "WEEKLY";
    case "monthly":
      return "MONTHLY";
    default:
      return "YEARLY";
  }
}

function weekdayCode(name: string): string {
  const day = WEEKDAYS.find((d) => d.names.includes(name.toLowerCase()));
  return day?.code ?? "MO";
}

export function describeRecurrence(rule: Recurrence): string {
  const every = rule.interval === 2 ? "Every other" : "Every";
  const plural = rule.interval > 2 ? `${rule.interval} ` : "";

  if (rule.freq === "WEEKLY" && rule.byDay) {
    return `${every} ${WEEKDAY_LABEL[rule.byDay] ?? "week"}`;
  }
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[
    rule.freq
  ];
  if (rule.interval > 2) return `Every ${plural}${unit}s`;
  return `${every} ${unit}`;
}

/**
 * The next due date after `from`, keeping the original time of day. Used when a
 * repeating task is completed: the occurrence you finished stays completed and
 * a fresh one is inserted.
 */
export function nextOccurrence(rule: Recurrence, from: number): number {
  const date = new Date(from);

  switch (rule.freq) {
    case "DAILY":
      date.setDate(date.getDate() + rule.interval);
      return date.getTime();

    case "WEEKLY": {
      if (!rule.byDay) {
        date.setDate(date.getDate() + 7 * rule.interval);
        return date.getTime();
      }
      const target = WEEKDAYS.find((d) => d.code === rule.byDay)?.index ?? 1;
      // At least one day forward, then on to the target weekday; an interval
      // above 1 skips whole weeks beyond that.
      let delta = (target - date.getDay() + 7) % 7;
      if (delta === 0) delta = 7;
      delta += 7 * (rule.interval - 1);
      date.setDate(date.getDate() + delta);
      return date.getTime();
    }

    case "MONTHLY": {
      // Clamp, so the 31st of a 30-day month lands on the 30th rather than
      // silently rolling into the next month.
      const day = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + rule.interval);
      const lastDay = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
      ).getDate();
      date.setDate(Math.min(day, lastDay));
      return date.getTime();
    }

    case "YEARLY": {
      const day = date.getDate();
      date.setDate(1);
      date.setFullYear(date.getFullYear() + rule.interval);
      const lastDay = new Date(
        date.getFullYear(),
        date.getMonth() + 1,
        0,
      ).getDate();
      date.setDate(Math.min(day, lastDay));
      return date.getTime();
    }
  }
}
