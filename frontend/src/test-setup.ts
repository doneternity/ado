import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// The page tests stream replies and load lazy pages; on a busy machine the
// default 1s wait for findBy/waitFor is too tight and makes them flaky.
configure({ asyncUtilTimeout: 4000 });
