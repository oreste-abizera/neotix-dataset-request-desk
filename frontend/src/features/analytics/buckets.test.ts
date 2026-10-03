import { describe, expect, it } from "vitest";
import { toBuckets } from "./AnalyticsPage";

const point = (day: string, robot_id: string, episodes: number) => ({ day, robot_id, episodes });

describe("toBuckets", () => {
  it("returns one bucket per day, including empty days, for short ranges", () => {
    const { buckets, robots, step } = toBuckets(
      [
        point("2026-08-01", "arm-01", 2),
        point("2026-08-01", "arm-02", 1),
        point("2026-08-03", "arm-01", 4),
      ],
      "2026-08-01",
      "2026-08-03",
    );
    expect(step).toBe(1);
    expect(robots).toEqual(["arm-01", "arm-02"]);
    expect(buckets.map((b) => b.values)).toEqual([
      { "arm-01": 2, "arm-02": 1 },
      {},
      { "arm-01": 4 },
    ]);
    expect(buckets[0]!.title).toMatch(/3 episodes \(arm-01 2, arm-02 1\)/);
  });

  it("groups into weeks when the range is long, keeping totals exact", () => {
    const points = [
      point("2026-08-01", "arm-01", 1),
      point("2026-08-05", "arm-01", 2),
      point("2026-08-20", "arm-01", 5),
    ];
    const { buckets, step } = toBuckets(points, "2026-07-01", "2026-09-29"); // 91 days
    expect(step).toBe(7);
    expect(buckets.reduce((a, b) => a + (b.values["arm-01"] ?? 0), 0)).toBe(8);
    expect(buckets[0]!.title).toMatch(/^Week of/);
  });
});
