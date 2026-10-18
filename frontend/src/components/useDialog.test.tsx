import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { useDialog } from "./useDialog";

function Harness() {
  const [open, setOpen] = useState(false);
  const ref = useDialog<HTMLDivElement>(open, () => setOpen(false));
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      {open && (
        <div ref={ref} role="dialog">
          <button>first</button>
          <button>last</button>
        </div>
      )}
    </>
  );
}

describe("useDialog", () => {
  it("focuses the dialog, traps Tab, closes on Escape, and restores focus", () => {
    render(<Harness />);
    const trigger = screen.getByText("open");
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByText("first")).toHaveFocus();

    screen.getByText("last").focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByText("first")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByText("last")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
