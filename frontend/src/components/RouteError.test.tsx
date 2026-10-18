import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router-dom";
import { RouteError } from "./RouteError";
import { isStaleChunkError } from "./staleChunk";

function Boom(): never {
  throw new Error("kaboom");
}

describe("RouteError", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  it("shows the error page inside the layout when a page throws", () => {
    const router = createMemoryRouter(
      [{
        element: <div><p>site header</p><Outlet /></div>,
        errorElement: <RouteError />,
        children: [{ errorElement: <RouteError />, children: [{ path: "/", element: <Boom /> }] }],
      }],
      { initialEntries: ["/"] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(screen.getByText("site header")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("recognises stale-chunk errors from each browser", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/a.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isStaleChunkError(new Error("kaboom"))).toBe(false);
  });
});
