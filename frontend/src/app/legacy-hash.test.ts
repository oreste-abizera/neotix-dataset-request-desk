import { describe, expect, it } from "vitest";
import { legacyHashToPath } from "./legacy-hash";

describe("legacyHashToPath (old bookmarks keep working)", () => {
  it.each([
    ["#/requests", "/requests"],
    ["#/requests/12", "/requests/12"],
    ["#/requests/new", "/requests/new"],
    ["#/import", "/imports"],
    ["#/analytics", "/analytics"],
    ["#/users", "/users"],
  ])("%s -> %s", (hash, path) => expect(legacyHashToPath(hash)).toBe(path));

  it("ignores anything else", () => {
    for (const h of ["", "#main", "#/unknown", "#/requests/abc", "#/requests/12/extra"]) {
      expect(legacyHashToPath(h)).toBeNull();
    }
  });
});
