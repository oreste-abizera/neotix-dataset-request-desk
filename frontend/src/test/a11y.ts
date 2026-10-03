import axe from "axe-core";
import { expect } from "vitest";

/**
 * Run axe on the rendered DOM. Color contrast is excluded here because jsdom has no layout or
 * computed colors; contrast is enforced by styles/tokens.test.ts and by Lighthouse in a real browser.
 */
export async function expectNoA11yViolations(container: Element = document.body) {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  const summary = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(" ")).join(" | ")})`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
}
