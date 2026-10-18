import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PageMeta } from "./PageMeta";

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <PageMeta />
    </MemoryRouter>,
  );
}

const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute("content");
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute("href");

describe("PageMeta", () => {
  it("sets title, description and canonical for a public page", () => {
    renderAt("/pricing");
    expect(document.title).toBe("Pricing — ADO");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toMatch(/free/i);
    expect(canonical()).toBe("https://adoai.space/pricing");
    expect(robots()).toBeUndefined();
  });

  it("marks private and unknown pages noindex without a canonical", () => {
    renderAt("/dashboard");
    expect(robots()).toBe("noindex");
    expect(canonical()).toBeUndefined();

    renderAt("/nope");
    expect(document.title).toBe("Page not found — ADO");
    expect(robots()).toBe("noindex");
  });
});
