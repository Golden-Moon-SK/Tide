import { describe, expect, it } from "vitest";
import { parseCapture } from "./parse";

// Monday 21 September 2026, 10:00 local. Fixed so weekday maths is stable.
const REF = new Date(2026, 8, 21, 10, 0, 0);

function parse(input: string) {
  return parseCapture(input, REF);
}

function ymd(ms: number | undefined) {
  if (ms === undefined) return undefined;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

describe("dates", () => {
  it("reads a date and a time, and strips both from the title", () => {
    const r = parse("tomorrow 3pm call the bank");
    expect(r.title).toBe("call the bank");
    expect(ymd(r.dueDate)).toBe("2026-09-22");
    expect(new Date(r.dueDate!).getHours()).toBe(15);
    expect(r.hasTime).toBe(true);
  });

  it("treats a bare weekday as the next one, not the last one", () => {
    const r = parse("thurs 1pm lunch with Sam");
    expect(r.title).toBe("lunch with Sam");
    expect(ymd(r.dueDate)).toBe("2026-09-24");
    expect(r.hasTime).toBe(true);
  });

  it("marks a date with no time as all-day", () => {
    const r = parse("next friday dentist");
    expect(r.title).toBe("dentist");
    expect(r.hasTime).toBe(false);
  });

  it("swallows the connector word before a date", () => {
    const r = parse("submit essay by friday");
    expect(r.title).toBe("submit essay");
    expect(ymd(r.dueDate)).toBe("2026-09-25");
  });

  it("keeps a time buried mid-sentence", () => {
    const r = parse("lunch at 1");
    expect(r.title).toBe("lunch");
    expect(r.hasTime).toBe(true);
  });
});

describe("no false positives", () => {
  // The expensive failure mode: mangling a title that had no tokens in it.
  it.each([
    "call mum",
    "Review Q1 report",
    "buy 2 milk",
    "read chapter 3",
    "pick up 6 eggs",
    "v2 launch",
    "file taxes",
  ])("leaves %j alone", (input) => {
    const r = parse(input);
    expect(r.title).toBe(input);
    expect(r.dueDate).toBeUndefined();
    expect(r.priority).toBe(4);
    expect(r.projectName).toBeUndefined();
    expect(r.labelNames).toEqual([]);
    expect(r.recurrence).toBeUndefined();
  });
});

describe("priority", () => {
  it("reads p1 and removes it", () => {
    const r = parse("ship the release p1");
    expect(r.title).toBe("ship the release");
    expect(r.priority).toBe(1);
  });

  it("defaults to 4", () => {
    expect(parse("water the plants").priority).toBe(4);
  });

  it("ignores a p inside a word", () => {
    const r = parse("upgrade to p1000 plan");
    expect(r.title).toBe("upgrade to p1000 plan");
    expect(r.priority).toBe(4);
  });
});

describe("project and labels", () => {
  it("pulls out #project and @label", () => {
    const r = parse("draft the brief #work @deep");
    expect(r.title).toBe("draft the brief");
    expect(r.projectName).toBe("work");
    expect(r.labelNames).toEqual(["deep"]);
  });

  it("takes several labels", () => {
    const r = parse("email Sam @quick @email");
    expect(r.title).toBe("email Sam");
    expect(r.labelNames).toEqual(["quick", "email"]);
  });

  it("keeps a second project in the title rather than dropping it", () => {
    const r = parse("sync #work #home");
    expect(r.projectName).toBe("work");
    expect(r.title).toBe("sync #home");
  });
});

describe("recurrence", () => {
  it("reads every monday as a weekly rule, not a due date", () => {
    const r = parse("every monday standup");
    expect(r.title).toBe("standup");
    expect(r.recurrence).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(r.dueDate).toBeUndefined();
  });

  it("reads every other tuesday", () => {
    const r = parse("every other tuesday bins");
    expect(r.title).toBe("bins");
    expect(r.recurrence).toBe("FREQ=WEEKLY;INTERVAL=2;BYDAY=TU");
  });

  it("reads an interval in days", () => {
    expect(parse("every 3 days water plants").recurrence).toBe(
      "FREQ=DAILY;INTERVAL=3",
    );
  });

  it("reads a bare adverb", () => {
    const r = parse("weekly review");
    expect(r.title).toBe("review");
    expect(r.recurrence).toBe("FREQ=WEEKLY");
  });
});

describe("everything at once", () => {
  it("handles the kitchen sink", () => {
    const r = parse("lunch w/ Sam thurs 1pm p1 #work @errand");
    expect(r.title).toBe("lunch w/ Sam");
    expect(r.priority).toBe(1);
    expect(r.projectName).toBe("work");
    expect(r.labelNames).toEqual(["errand"]);
    expect(ymd(r.dueDate)).toBe("2026-09-24");
    expect(r.hasTime).toBe(true);
    expect(r.tokens.map((t) => t.kind)).toEqual([
      "date",
      "priority",
      "project",
      "label",
    ]);
  });

  it("returns tokens in input order with accurate spans", () => {
    const input = "p2 #home call plumber tomorrow";
    const r = parse(input);
    for (const token of r.tokens) {
      expect(input.slice(token.start, token.end)).toBe(token.raw);
    }
    expect(r.tokens.map((t) => t.start)).toEqual(
      [...r.tokens.map((t) => t.start)].sort((a, b) => a - b),
    );
  });
});
