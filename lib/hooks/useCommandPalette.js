"use client";

import { useEffect, useMemo, useState } from "react";

export function useCommandPalette(commands) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const indexedCommands = useMemo(
    () =>
      commands.map((command, index) => ({
        command,
        index,
        searchText: `${command.label} ${command.keywords || ""} ${command.group || ""}`.toLowerCase(),
      })),
    [commands]
  );

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActiveIndex(0);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return indexedCommands.map((item) => item.command);
    return indexedCommands
      .filter((item) => item.searchText.includes(q))
      .map((item) => item.command);
  }, [indexedCommands, query]);

  const grouped = useMemo(() => {
    const map = new Map();
    filtered.forEach((command) => {
      const group = command.group || "General";
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(command);
    });
    return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
  }, [filtered]);

  const safeActiveIndex = filtered.length
    ? Math.min(activeIndex, filtered.length - 1)
    : 0;

  function onInputKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!filtered.length) return;
      setActiveIndex((index) => (index + 1) % filtered.length);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!filtered.length) return;
      setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const command = filtered[safeActiveIndex];
      if (command) runCommand(command);
    }
  }

  function runCommand(command) {
    command.action();
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }

  return {
    open,
    setOpen,
    query,
    setQuery,
    filtered,
    grouped,
    activeIndex: safeActiveIndex,
    setActiveIndex,
    onInputKeyDown,
    runCommand,
  };
}
