"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useNightMode } from "@/lib/useNightMode";
import { useAuthBootstrap } from "@/lib/hooks/useAuthBootstrap";
import { safeReadJSON } from "@/lib/storageSchema";
import { journalYearKey } from "@/lib/dateKeys";
import NavBar from "@/app/components/NavBar";

const MOOD_META = {
  warm:    { label: "Warm",    color: "#F4C7A1" },
  neutral: { label: "Neutral", color: "#E8DCC2" },
  steady:  { label: "Steady",  color: "#C8D8C0" },
  cool:    { label: "Cool",    color: "#BFCAD8" },
  deep:    { label: "Deep",    color: "#8A94A6" },
  gentle:  { label: "Gentle",  color: "#E8DCC2" },
  quiet:   { label: "Quiet",   color: "#BFCAD8" },
};

export default function TagsPage() {
  const router = useRouter();
  const { authReady, userId } = useAuthBootstrap({ supabase, router, redirectTo: "/login" });
  const nightMode = useNightMode();
  const [selectedTag, setSelectedTag] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const now = new Date();

  // Build tag index from journal entries (current + previous year)
  const { tagIndex, allTags, tagCounts } = useMemo(() => {
    if (!userId) return { tagIndex: {}, allTags: [], tagCounts: {} };
    const index = {};
    const counts = {};

    for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) {
      const entries = safeReadJSON(journalYearKey(userId, y), {});
      Object.entries(entries).forEach(([date, dayEntries]) => {
        if (!Array.isArray(dayEntries)) return;
        dayEntries.forEach((entry) => {
          const tags = Array.isArray(entry.tags) ? entry.tags : [];
          tags.forEach((tag) => {
            if (!index[tag]) index[tag] = [];
            index[tag].push({ date, entry });
            counts[tag] = (counts[tag] || 0) + 1;
          });
        });
      });
    }

    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    return { tagIndex: index, allTags: sorted, tagCounts: counts };
  }, [userId]);

  const filteredTags = searchQuery
    ? allTags.filter((t) => t.toLowerCase().includes(searchQuery.toLowerCase()))
    : allTags;

  const selectedEntries = selectedTag
    ? (tagIndex[selectedTag] || []).sort((a, b) => b.date.localeCompare(a.date))
    : [];

  if (!authReady) {
    return (
      <main style={{ minHeight: "100vh", padding: "28px 24px", background: nightMode ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)" : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", paddingTop: 60 }}>
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 48, borderRadius: 999, maxWidth: 500, marginBottom: 16 }} />
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "28px 24px 100px",
        background: nightMode
          ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)"
          : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
        fontFamily: "var(--font-manrope), sans-serif",
        color: nightMode ? "#e9ecef" : "#0d2a14",
      }}
    >
      <div style={{ maxWidth: 900, margin: "0 auto 28px" }}>
        <NavBar activePage="journal" />
      </div>

      <section style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 6px", fontSize: "clamp(28px, 5.5vw, 44px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: -0.5 }}>Tags</h1>
        <p style={{ margin: "0 0 16px", color: nightMode ? "#8a9e8a" : "#2e6e34", fontSize: 15 }}>
          Browse all your journal entries by tag.
        </p>

        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tags…"
          style={{
            width: "100%",
            maxWidth: 400,
            padding: "10px 14px",
            borderRadius: 12,
            border: `1.5px solid ${nightMode ? "rgba(255,255,255,0.12)" : "rgba(46,125,50,0.22)"}`,
            background: nightMode ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.6)",
            color: nightMode ? "#e9ecef" : "#0d2a14",
            fontSize: 14,
            outline: "none",
            marginBottom: 16,
          }}
        />

        {/* Tag cloud */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {filteredTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                border: "none",
                background: selectedTag === tag
                  ? (nightMode ? "rgba(34,197,94,0.25)" : "rgba(46,125,50,0.18)")
                  : (nightMode ? "rgba(255,255,255,0.06)" : "rgba(46,125,50,0.07)"),
                color: selectedTag === tag
                  ? (nightMode ? "#4ade80" : "#14532d")
                  : (nightMode ? "#b0bac8" : "#2e5c34"),
                fontWeight: selectedTag === tag ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              #{tag} <span style={{ opacity: 0.6 }}>({tagCounts[tag]})</span>
            </button>
          ))}
          {filteredTags.length === 0 && (
            <p style={{ color: nightMode ? "#6a7a6a" : "#4a7a50", fontSize: 14 }}>
              No tags found. Tags are added when you write journal entries.
            </p>
          )}
        </div>

        {/* Entries for selected tag */}
        {selectedTag && (
          <div style={{ display: "grid", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
              #{selectedTag}
              <span style={{ fontWeight: 400, fontSize: 14, marginLeft: 8, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>
                {selectedEntries.length} {selectedEntries.length === 1 ? "entry" : "entries"}
              </span>
            </h2>
            {selectedEntries.map(({ date, entry }, i) => {
              const moodMeta = MOOD_META[entry.mood] || { label: entry.mood || "—", color: "#ccc" };
              const preview = (entry.text || "").slice(0, 200);
              return (
                <Link
                  key={`${date}-${entry.id || i}`}
                  href={`/today?date=${date}`}
                  style={{
                    textDecoration: "none",
                    display: "block",
                    background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)",
                    border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`,
                    borderRadius: 14,
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: moodMeta.color }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: nightMode ? "#b0bac8" : "#2e5c34" }}>{date}</span>
                    <span style={{ fontSize: 11, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>{moodMeta.label}</span>
                    {entry.starred && <span>⭐</span>}
                  </div>
                  <p style={{ margin: 0, color: nightMode ? "#c9d1da" : "#1a4a22", fontSize: 14, lineHeight: 1.5 }}>
                    {preview}{preview.length < (entry.text || "").length ? "…" : ""}
                  </p>
                  {Array.isArray(entry.tags) && entry.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                      {entry.tags.map((t) => (
                        <span key={t} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: nightMode ? "rgba(34,197,94,0.12)" : "rgba(46,125,50,0.10)", color: nightMode ? "#86efac" : "#14532d" }}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
