// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import React, { useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CommandPaletteDialog from "../app/components/ui/CommandPaletteDialog";
import MobileActionBar from "../app/components/ui/MobileActionBar";
import { useFocusTrap } from "../lib/hooks/useFocusTrap";

function makePalette(commandCount = 4) {
  const commands = Array.from({ length: commandCount }, (_, index) => ({
    label: `Command ${index + 1}`,
    shortcut: "Enter",
    action: vi.fn(),
  }));

  return {
    query: "",
    setQuery: vi.fn(),
    filtered: commands,
    grouped: [{ group: "General", items: commands }],
    activeIndex: 0,
    setActiveIndex: vi.fn(),
    onInputKeyDown: vi.fn((event) => {
      if (event.key === "Enter") {
        event.preventDefault();
      }
    }),
    runCommand: vi.fn((command) => command.action()),
  };
}

function PopoverHarness() {
  const [open, setOpen] = useState(true);
  const ref = useRef(null);
  useFocusTrap({ open, containerRef: ref, onClose: () => setOpen(false) });

  if (!open) return <p>closed</p>;

  return (
    <div role="presentation">
      <div ref={ref} tabIndex={-1} role="menu" aria-label="Test popover">
        <button type="button">First action</button>
        <button type="button">Second action</button>
      </div>
    </div>
  );
}

describe("UI overlay integration", () => {
  it("renders command palette and closes with Escape", async () => {
    const user = userEvent.setup();
    const palette = makePalette(6);
    const onClose = vi.fn();

    render(
      <CommandPaletteDialog
        open
        onClose={onClose}
        palette={palette}
        theme={{ panel: "#fff", border: "#ddd", text: "#111", muted: "#666" }}
        nightMode={false}
        dialogLabel="Journal command palette"
        inputLabel="Search journal commands"
      />
    );

    expect(screen.getByRole("dialog", { name: "Journal command palette" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search journal commands" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("virtualizes large command result sets", () => {
    const palette = makePalette(220);

    render(
      <CommandPaletteDialog
        open
        onClose={() => {}}
        palette={palette}
        theme={{ panel: "#fff", border: "#ddd", text: "#111", muted: "#666" }}
        nightMode={false}
        dialogLabel="Big palette"
        inputLabel="Search commands"
      />
    );

    const options = screen.getAllByRole("option");
    expect(options.length).toBeLessThan(220);
    expect(options.length).toBeGreaterThan(0);
  });

  it("traps focus in popover and closes on Escape", async () => {
    const user = userEvent.setup();
    render(<PopoverHarness />);

    const first = screen.getByRole("button", { name: "First action" });
    const second = screen.getByRole("button", { name: "Second action" });

    expect(first).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(second).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.getByText("closed")).toBeInTheDocument();
  });

  it("supports keyboard activation in mobile action bar", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <MobileActionBar
        actions={[
          { label: "Save", onClick: onSave, style: {} },
          { label: "Export", onClick: () => {}, style: {} },
        ]}
      />
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    saveButton.focus();
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
