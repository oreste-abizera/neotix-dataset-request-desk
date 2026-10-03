import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv export", () => {
  it("quotes values containing separators, quotes or newlines", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(7)).toBe("7");
  });

  it("neutralises spreadsheet formulas that came from uploaded data", () => {
    for (const evil of ['=HYPERLINK("x")', "+1+1", "-2", "@SUM(A1)"]) {
      expect(csvCell(evil).replace(/^"/, "")).toMatch(/^'/);
    }
  });

  it("builds a header and rows", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('a,b\r\n1,"x,y"');
  });
});
