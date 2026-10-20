import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("formats text, lists, tables and code blocks", () => {
    const text = [
      "Some **bold** and `inline` text.",
      "",
      "- one",
      "- two",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "```py",
      "print(\"hi\")",
      "```",
    ].join("\n");
    const { container } = render(<Markdown text={text} />);
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(screen.getByText("py")).toBeInTheDocument(); // the code block's language label
    expect(container.querySelector("pre")).toHaveTextContent('print("hi")');
    // highlighted: the keyword and the string get their own spans
    expect(container.querySelectorAll("pre span").length).toBeGreaterThanOrEqual(2);
  });

  it("copies a code block", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<Markdown text={"```js\nconst x = 1;\n```"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }));
    expect(writeText).toHaveBeenCalledWith("const x = 1;");
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });

  it("never runs raw HTML, unsafe links or remote images from a reply", () => {
    const text = [
      "<script>alert(1)</script><b>raw</b>",
      "",
      "[click](javascript:alert(1)) [safe](https://example.com)",
      "",
      "![tracker](https://example.com/pixel.png)",
    ].join("\n");
    const { container } = render(<Markdown text={text} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    // the javascript: URL is dropped, so "click" is no longer a working link
    expect(screen.getByText("click")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "click" })).toBeNull();
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
    expect(screen.getByRole("link", { name: "safe" })).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "tracker" })).toHaveAttribute("href", "https://example.com/pixel.png");
  });
});
