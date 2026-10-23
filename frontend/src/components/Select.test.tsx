import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Select } from "./Select";

function Picker({ onChange = () => {} }: { onChange?: (v: number) => void }) {
  const [value, setValue] = useState(7);
  return (
    <Select
      label="Period"
      value={value}
      onChange={(v) => { setValue(v); onChange(v); }}
      options={[
        { value: 1, label: "last 24 hours" },
        { value: 7, label: "last 7 days" },
        { value: 30, label: "last 30 days", group: "Longer" },
      ]}
    />
  );
}

describe("Select", () => {
  it("opens on click, shows groups, and picks with a click", () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Period: last 7 days" }));
    expect(screen.getByRole("option", { name: "last 7 days" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Longer")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "last 30 days" }));
    expect(onChange).toHaveBeenCalledWith(30);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Period: last 30 days" })).toHaveFocus();
  });

  it("works from the keyboard", () => {
    const onChange = vi.fn();
    render(<Picker onChange={onChange} />);
    const button = screen.getByRole("button", { name: /Period/ });
    fireEvent.keyDown(button, { key: "ArrowDown" });
    const list = screen.getByRole("listbox", { name: "Period" });
    expect(list).toHaveFocus();
    expect(list).toHaveAttribute("aria-activedescendant", expect.stringMatching(/-1$/)); // starts on the chosen one

    fireEvent.keyDown(list, { key: "ArrowUp" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(1);

    fireEvent.keyDown(button, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("closes on a click outside without choosing", () => {
    const onChange = vi.fn();
    render(<><Picker onChange={onChange} /><p>elsewhere</p></>);
    fireEvent.click(screen.getByRole("button", { name: /Period/ }));
    fireEvent.mouseDown(screen.getByText("elsewhere"));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
