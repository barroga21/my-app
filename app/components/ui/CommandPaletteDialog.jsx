"use client";

import React, { useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../../../lib/hooks/useFocusTrap";

function flattenGrouped(grouped) {
  const rows = [];
  let commandIndex = -1;
  grouped.forEach((group) => {
    rows.push({ type: "header", key: `h-${group.group}`, label: group.group });
    group.items.forEach((item, index) => {
      commandIndex += 1;
      rows.push({
        type: "command",
        key: `c-${group.group}-${item.label}-${index}`,
        item,
        commandIndex,
      });
    });
  });
  return rows;
}

export default function CommandPaletteDialog({
  open,
  onClose,
  palette,
  theme,
  nightMode,
  dialogLabel,
  inputLabel,
  placeholder = "Type a command...",
  noResultsLabel = "No matching commands.",
  zIndex = 80,
}) {
  const dialogRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  useFocusTrap({ open, containerRef: dialogRef, onClose });

  const rows = useMemo(() => flattenGrouped(palette.grouped), [palette.grouped]);
  const listboxId = "hibi-command-palette-listbox";
  const activeCommandRow = rows.find((row) => row.type === "command" && row.commandIndex === palette.activeIndex);
  const activeOptionId = activeCommandRow ? `hibi-command-${activeCommandRow.key}` : undefined;
  const rowHeight = 40;
  const viewportHeight = 260;
  const overscan = 6;
  const virtualizationThreshold = 90;

  if (!open) return null;

  const totalRows = rows.length;
  const shouldVirtualize = totalRows >= virtualizationThreshold;
  const startRow = shouldVirtualize ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const endRow = shouldVirtualize ? Math.min(totalRows, startRow + Math.ceil(viewportHeight / rowHeight) + overscan * 2) : totalRows;
  const visibleRows = rows.slice(startRow, endRow);
  const topPad = shouldVirtualize ? startRow * rowHeight : 0;
  const bottomPad = shouldVirtualize ? (totalRows - endRow) * rowHeight : 0;

  return (
    <div role="presentation" style={{ position: "fixed", inset: 0, zIndex, background: "rgba(8,14,12,0.34)", display: "grid", placeItems: "start center", paddingTop: 90 }} onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={dialogLabel} className="hibi-stagger-in" style={{ width: "min(92vw, 560px)", background: theme.panel, border: `1px solid ${theme.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 20px 40px rgba(0,0,0,0.25)", animationDelay: "40ms" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ height: 2, background: "linear-gradient(90deg, rgba(224,143,109,0.9), rgba(34,197,94,0.9), rgba(31,111,58,0.85))" }} aria-hidden="true" />
        <input
          aria-label={inputLabel}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          autoFocus
          value={palette.query}
          onChange={(e) => palette.setQuery(e.target.value)}
          onKeyDown={palette.onInputKeyDown}
          placeholder={placeholder || "Find an action, jump, or ritual..."}
          style={{ width: "100%", border: "none", borderBottom: `1px solid ${theme.border}`, background: "transparent", color: theme.text || theme.heading, padding: "12px 14px", fontSize: 14, outline: "none" }}
        />
        <div id={listboxId} role="listbox" aria-label="Command results" style={{ maxHeight: viewportHeight, overflowY: "auto", padding: 6 }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
          {topPad ? <div style={{ height: topPad }} aria-hidden="true" /> : null}
          {visibleRows.map((row) => {
            if (row.type === "header") {
              return (
                <p key={row.key} style={{ margin: "8px 8px 4px", color: theme.muted, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>
                  {row.label}
                </p>
              );
            }

            const active = row.commandIndex === palette.activeIndex;

            return (
              <button
                id={`hibi-command-${row.key}`}
                role="option"
                aria-selected={active}
                key={row.key}
                onMouseEnter={() => palette.setActiveIndex(row.commandIndex)}
                onClick={() => palette.runCommand(row.item)}
                style={{ width: "100%", border: "none", background: active ? (nightMode ? "rgba(34,197,94,0.16)" : "rgba(26,110,54,0.10)") : "transparent", color: theme.text || theme.heading, textAlign: "left", padding: "10px 8px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 600, display: "flex", justifyContent: "space-between", gap: 8, transition: "background 0.16s ease, transform 0.16s ease" }}
              >
                <span>{row.item.label}</span>
                <span style={{ color: theme.muted, fontSize: 11, fontWeight: 600 }}>{row.item.shortcut || ""}</span>
              </button>
            );
          })}
          {bottomPad ? <div style={{ height: bottomPad }} aria-hidden="true" /> : null}
          {!palette.filtered.length ? <p aria-live="polite" style={{ margin: 0, padding: "10px 8px", color: theme.muted, fontSize: 12 }}>{noResultsLabel || "No commands yet. Try a simpler keyword."}</p> : null}
        </div>
      </div>
    </div>
  );
}
