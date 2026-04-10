"use client";
import React from "react";
import Link from "next/link";

/**
 * Quick action widgets for the home page.
 */
export default function QuickActions({ nightMode, onOpenSearch, todayJournalCount, userId }) {
  const actions = [
    {
      label: "Quick Journal",
      icon: "✏️",
      href: "/today",
      description: todayJournalCount > 0 ? `${todayJournalCount} entries today` : "Start writing",
    },
    {
      label: "Search",
      icon: "🔍",
      onClick: onOpenSearch,
      description: "Find anything",
    },
    {
      label: "Review",
      icon: "📊",
      href: "/review",
      description: "See your patterns",
    },
    {
      label: "Tags",
      icon: "🏷️",
      href: "/tags",
      description: "Browse by tag",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
      {actions.map((action) => {
        const content = (
          <>
            <span style={{ fontSize: 22, marginBottom: 4 }}>{action.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: nightMode ? "#e9ecef" : "#0d2a14" }}>{action.label}</span>
            <span style={{ fontSize: 10, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>{action.description}</span>
          </>
        );

        const baseStyle = {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "14px 8px",
          borderRadius: 14,
          background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)",
          border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`,
          textDecoration: "none",
          cursor: "pointer",
          transition: "all 0.18s ease",
          gap: 2,
        };

        if (action.onClick) {
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              style={{ ...baseStyle, border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}` }}
            >
              {content}
            </button>
          );
        }

        return (
          <Link key={action.label} href={action.href} style={baseStyle}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
