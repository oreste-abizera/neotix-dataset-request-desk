import { describe, expect, it } from "vitest";
import { dueIn, formatDuration, formatRelative, isoDate, plural } from "./format";

describe("dueIn", () => {
  const now = new Date(2026, 9, 3, 15, 30); // 3 Oct 2026, mid-afternoon: time of day must not matter

  it("counts calendar days from today", () => {
    expect(dueIn("2026-10-03", now)).toEqual({ label: "Due today", overdue: false, soon: true });
    expect(dueIn("2026-10-04", now).label).toBe("Due tomorrow");
    expect(dueIn("2026-10-20", now)).toMatchObject({
      label: "Due in 17 days",
      overdue: false,
      soon: false,
    });
  });

  it("flags overdue deadlines with singular and plural wording", () => {
    expect(dueIn("2026-10-02", now)).toEqual({
      label: "Overdue by 1 day",
      overdue: true,
      soon: false,
    });
    expect(dueIn("2026-09-25", now).label).toBe("Overdue by 8 days");
  });
});

describe("formatDuration", () => {
  it("picks a sensible unit", () => {
    expect(formatDuration(null)).toBe("n/a");
    expect(formatDuration(20)).toBe("1 min");
    expect(formatDuration(90 * 60)).toBe("1.5 h");
    expect(formatDuration(72 * 3600)).toBe("3.0 days");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  it("describes past and future instants", () => {
    expect(formatRelative("2026-10-03T11:55:00Z", now)).toMatch(/5 minutes ago/);
    expect(formatRelative("2026-10-03T09:00:00Z", now)).toMatch(/3 hours ago/);
    expect(formatRelative("2026-10-02T12:00:00Z", now)).toMatch(/yesterday/);
    expect(formatRelative("2026-10-03T12:00:10Z", now)).toBe("just now");
  });
});

describe("helpers", () => {
  it("pluralises and formats local ISO dates", () => {
    expect(plural(1, "episode")).toBe("1 episode");
    expect(plural(2, "episode")).toBe("2 episodes");
    expect(plural(1200, "row")).toBe("1,200 rows");
    expect(isoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
