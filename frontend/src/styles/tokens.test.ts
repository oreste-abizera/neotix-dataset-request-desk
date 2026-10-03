import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/styles/index.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries(
    [...body.matchAll(/--([a-z_0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!]),
  );
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const STATUSES = ["submitted", "in_progress", "delivered", "accepted", "rejected", "neutral"];

describe.each([
  ["light", block(":root")],
  ["dark", block(".dark")],
])("%s theme contrast (WCAG 2.2 AA)", (_name, t) => {
  const text = (fg: string, bg: string, min = 4.5) =>
    expect(contrast(t[fg]!, t[bg]!), `${fg} on ${bg}`).toBeGreaterThanOrEqual(min);

  it("body and secondary text on every surface", () => {
    for (const bg of ["background", "surface", "surface-muted"]) text("foreground", bg);
    for (const bg of ["background", "surface", "surface-muted"]) text("muted-foreground", bg);
  });

  it("primary: button label, link text, and soft backgrounds", () => {
    text("primary-foreground", "primary");
    text("primary-foreground", "primary-hover");
    for (const bg of ["background", "surface", "primary-soft"]) text("primary", bg);
  });

  it("semantic colors as text on the surface and on their own tint", () => {
    for (const k of ["danger", "success", "warning", "info"]) {
      text(k, "surface");
      text(k, `${k}-soft`);
    }
    text("danger-foreground", "danger");
  });

  it("status badges: label on its background", () => {
    for (const s of STATUSES) text(`status-${s}-fg`, `status-${s}-bg`);
  });

  it("form control borders and the focus ring are visible (3:1, WCAG 1.4.11)", () => {
    text("border-input", "surface", 3);
    text("border-input", "background", 3);
    text("ring", "surface", 3);
    text("ring", "background", 3);
  });

  it("chart series are distinguishable from the surface (3:1)", () => {
    for (let i = 1; i <= 5; i++) text(`chart-${i}`, "surface", 3);
  });
});
