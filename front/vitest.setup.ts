import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not implement scrollIntoView (used by Chat to follow new messages).
Element.prototype.scrollIntoView = () => {};

afterEach(() => {
  cleanup();
});
