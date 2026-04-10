// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import JournalPage from "../app/today/page.jsx";
import HabitsPage from "../app/habits/page.jsx";
import CalendarPage from "../app/calendar/page.jsx";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props) => <img alt={props.alt || ""} src={props.src} />,
}));

vi.mock("@/app/components/NavBar", () => ({
  default: () => <nav aria-label="Main navigation">Nav</nav>,
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: null,
}));

vi.mock("@/lib/hooks/useAuthBootstrap", () => ({
  useAuthBootstrap: () => ({
    authReady: true,
    userId: "u1",
    user: { id: "u1", email: "test@example.com", user_metadata: {} },
  }),
}));

vi.mock("@/lib/useNightMode", () => ({
  useNightMode: () => false,
}));

vi.mock("@hello-pangea/dnd", () => ({
  DragDropContext: ({ children }) => <div>{children}</div>,
  Droppable: ({ children }) => children({
    innerRef: () => {},
    droppableProps: {},
    placeholder: null,
  }),
  Draggable: ({ children }) => children({
    innerRef: () => {},
    draggableProps: { style: {} },
    dragHandleProps: {},
  }, { isDragging: false }),
}));

let consoleErrorSpy;

beforeAll(() => {
  const originalConsoleError = console.error;
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args) => {
    const normalized = args
      .map((arg) => (typeof arg === "string" ? arg : String(arg)))
      .join(" ")
      .toLowerCase();
    const hasJsxAttributeWarning =
      normalized.includes("non-boolean attribute") && normalized.includes("jsx");
    if (hasJsxAttributeWarning) {
      return;
    }
    originalConsoleError(...args);
  });

  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }
});

afterAll(() => {
  consoleErrorSpy?.mockRestore();
});

afterEach(() => {
  cleanup();
});

describe("Page-level command palette flows", () => {
  it("journal page supports keyboard command palette open, focus, enter, and escape", async () => {
    const user = userEvent.setup();
    render(<JournalPage />);

    await user.keyboard("{Control>}k{/Control}");

    const dialog = screen.getByRole("dialog", { name: "Journal command palette" });
    const input = screen.getByRole("textbox", { name: "Search journal commands" });
    expect(dialog).toBeInTheDocument();
    expect(input).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.queryByRole("dialog", { name: "Journal command palette" })).not.toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Journal command palette" })).not.toBeInTheDocument();
  });

  it("habits page supports keyboard command palette flow", async () => {
    const user = userEvent.setup();
    render(<HabitsPage />);

    await user.keyboard("{Control>}k{/Control}");

    const dialog = screen.getByRole("dialog", { name: "Habits command palette" });
    const input = screen.getByRole("textbox", { name: "Search habits commands" });
    expect(dialog).toBeInTheDocument();
    expect(input).toHaveFocus();

    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.queryByRole("dialog", { name: "Habits command palette" })).not.toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Habits command palette" })).not.toBeInTheDocument();
  });

  it("calendar page supports keyboard command palette flow", async () => {
    const user = userEvent.setup();
    render(<CalendarPage />);

    await user.keyboard("{Control>}k{/Control}");

    const dialog = screen.getByRole("dialog", { name: "Calendar command palette" });
    const input = screen.getByRole("textbox", { name: "Search calendar commands" });
    expect(dialog).toBeInTheDocument();
    expect(input).toHaveFocus();

    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.queryByRole("dialog", { name: "Calendar command palette" })).not.toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Calendar command palette" })).not.toBeInTheDocument();
  });
});
