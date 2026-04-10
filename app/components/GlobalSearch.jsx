"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { safeReadJSON, sanitizeStringArray } from "@/lib/storageSchema";
import { journalYearKey } from "@/lib/dateKeys";

/**
 * Global search overlay — searches journal entries, habit names, calendar notes, and tags.
 */
export default function GlobalSearch({ userId, nightMode, open, onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape" && open) onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    if (!query.trim() || !userId) return [];
    const q = query.toLowerCase();
    const hits = [];
    const now = new Date();

    // Search journal entries
    for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) {
      const entries = safeReadJSON(journalYearKey(userId, y), {});
      Object.entries(entries).forEach(([date, dayEntries]) => {
        if (!Array.isArray(dayEntries)) return;
        dayEntries.forEach((entry) => {
          const text = (entry.text || "").toLowerCase();
          const tags = (entry.tags || []).join(" ").toLowerCase();
          const mood = (entry.mood || "").toLowerCase();
          if (text.includes(q) || tags.includes(q) || mood.includes(q)) {
            hits.push({
              type: "journal",
              date,
              preview: (entry.text || "").slice(0, 120),
              mood: entry.mood,
              tags: entry.tags || [],
              href: `/today?date=${date}`,
            });
          }
        });
      });
    }

    // Search habit names
    const habits = safeReadJSON(`habit_list_${userId}`, [], sanitizeStringArray);
    habits.forEach((h) => {
      if (h.toLowerCase().includes(q)) {
        hits.push({ type: "habit", preview: h, href: "/habits" });
      }
    });

    // Search calendar notes
    for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) {
      for (let m = 0; m < 12; m++) {
        const mk = `${userId}_${y}_${String(m + 1).padStart(2, "0")}`;
        const calNotes = safeReadJSON(`calendar_notes_${mk}`, {});
        Object.entries(calNotes).forEach(([date, note]) => {
          if (typeof note === "string" && note.toLowerCase().includes(q)) {
            hits.push({ type: "calendar", date, preview: note.slice(0, 120), href: "/calendar" });
          }
        });
      }
    }

    return hits.slice(0, 30);
  }, [query, userId]);

  if (!open) return null;

  const typeIcons = { journal: "📓", habit: "✅", calendar: "📅" };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "start center",
        paddingTop: 80,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 600,
          background: nightMode ? "#14181e" : "#fff",
          borderRadius: 20,
          boxShadow: nightMode ? "0 16px 64px rgba(0,0,0,0.7)" : "0 16px 64px rgba(0,0,0,0.15)",
          border: `1px solid ${nightMode ? "rgba(255,255,255,0.08)" : "rgba(46,125,50,0.15)"}`,
          overflow: "hidden",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${nightMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search journal, habits, calendar…"
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: `1.5px solid ${nightMode ? "rgba(255,255,255,0.12)" : "rgba(46,125,50,0.22)"}`,
              background: nightMode ? "rgba(0,0,0,0.3)" : "rgba(46,125,50,0.04)",
              color: nightMode ? "#e9ecef" : "#0d2a14",
              fontSize: 16,
              outline: "none",
            }}
          />
        </div>

        <div style={{ overflowY: "auto", padding: "8px 12px", flex: 1 }}>
          {query.trim() && results.length === 0 && (
            <p style={{ textAlign: "center", color: nightMode ? "#6a7a6a" : "#4a7a50", fontSize: 14, padding: 20 }}>
              No results for &ldquo;{query}&rdquo;
            </p>
          )}
          {results.map((hit, i) => (
            <Link
              key={`${hit.type}-${hit.date || hit.preview}-${i}`}
              href={hit.href}
              onClick={onClose}
              style={{
                display: "block",
                padding: "10px 14px",
                borderRadius: 10,
                textDecoration: "none",
                color: nightMode ? "#e9ecef" : "#0d2a14",
                marginBottom: 4,
                background: nightMode ? "rgba(255,255,255,0.03)" : "rgba(46,125,50,0.03)",
                border: `1px solid transparent`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span>{typeIcons[hit.type] || "•"}</span>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: nightMode ? "#6a7a6a" : "#4a7a50" }}>{hit.type}</span>
                {hit.date && <span style={{ fontSize: 11, color: nightMode ? "#555" : "#999" }}>{hit.date}</span>}
              </div>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: nightMode ? "#b0bac8" : "#2e5c34" }}>
                {hit.preview}{(hit.preview || "").length >= 120 ? "…" : ""}
              </p>
              {hit.tags && hit.tags.length > 0 && (
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {hit.tags.map((t) => (
                    <span key={t} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 999, background: nightMode ? "rgba(34,197,94,0.12)" : "rgba(46,125,50,0.10)", color: nightMode ? "#86efac" : "#14532d" }}>#{t}</span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>

        <div style={{ padding: "8px 16px", borderTop: `1px solid ${nightMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`, display: "flex", justifyContent: "space-between", fontSize: 11, color: nightMode ? "#555" : "#999" }}>
          <span>Esc to close</span>
          <span>{results.length} result{results.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
