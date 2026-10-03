import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { matchBinding, useHotkeys } from "./useHotkeys";

describe("matchBinding", () => {
  const bindings = ["n", "g r", "g i", "?"];
  it("matches single keys and two-key sequences", () => {
    expect(matchBinding(bindings, "n", null)).toEqual({ binding: "n", pending: null });
    expect(matchBinding(bindings, "g", null)).toEqual({ binding: null, pending: "g" });
    expect(matchBinding(bindings, "r", "g")).toEqual({ binding: "g r", pending: null });
    expect(matchBinding(bindings, "x", "g")).toEqual({ binding: null, pending: null });
  });
});

function Harness({ onN, onGR, onK }: { onN: () => void; onGR: () => void; onK: () => void }) {
  useHotkeys({ n: onN, "g r": onGR, "mod+k": onK });
  return <input aria-label="field" />;
}

describe("useHotkeys", () => {
  it("fires bindings, ignores typing in fields, and supports mod+key everywhere", () => {
    const onN = vi.fn();
    const onGR = vi.fn();
    const onK = vi.fn();
    const { getByLabelText } = render(<Harness onN={onN} onGR={onGR} onK={onK} />);

    fireEvent.keyDown(document.body, { key: "n" });
    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "r" });
    expect(onN).toHaveBeenCalledTimes(1);
    expect(onGR).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(getByLabelText("field"), { key: "n" }); // typing: must not trigger
    expect(onN).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(getByLabelText("field"), { key: "k", ctrlKey: true }); // allowed while typing
    expect(onK).toHaveBeenCalledTimes(1);
  });
});
