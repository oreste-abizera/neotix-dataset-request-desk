import { describe, expect, it } from "vitest";
import { ApiError, describeError, fieldErrors } from "./errors";

describe("describeError", () => {
  it("explains a rejected assignment per episode", () => {
    const e = new ApiError(409, "assignment_rejected", "x", {
      failures: [
        { episode_id: "EP-1", reason: "quality_not_assignable" },
        { episode_id: "EP-2", reason: "already_assigned" },
      ],
    });
    const text = describeError(e);
    expect(text).toContain("Nothing was assigned");
    expect(text).toContain("EP-1 is rated bad");
    expect(text).toContain("EP-2 is already assigned");
  });

  it("tells the operator how many episodes are missing before delivery", () => {
    const e = new ApiError(409, "insufficient_episodes", "x", { assigned: 2, required: 5 });
    expect(describeError(e)).toContain("Assign 3 more");
  });

  it("uses plain language for network, permission and server failures", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toMatch(/reach the server/);
    expect(describeError(new ApiError(403, "forbidden", "raw"))).toMatch(/permission/);
    expect(describeError(new ApiError(500, "internal_error", "raw"))).toMatch(
      /server had a problem/,
    );
    expect(describeError(new ApiError(404, "not_found", "Request not found."))).toBe(
      "Request not found.",
    );
  });
});

describe("fieldErrors", () => {
  it("maps validation details onto fields", () => {
    const e = new ApiError(422, "validation_error", "Invalid request.", [
      { field: "deadline", message: "deadline must be today or later" },
    ]);
    expect(fieldErrors(e)).toEqual({ deadline: "deadline must be today or later" });
  });

  it("returns nothing for other errors", () => {
    expect(fieldErrors(new ApiError(409, "conflict", "x"))).toEqual({});
    expect(fieldErrors(new Error("x"))).toEqual({});
  });
});
