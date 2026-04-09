"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useNightMode } from "@/lib/useNightMode";

const NAV_LINKS = [
  { href: "/calendar", label: "Calendar", page: "calendar" },
  { href: "/habits",   label: "Habits",   page: "habits"   },
  { href: "/today",    label: "Journal",  page: "journal"  },
  { href: "/profile",  label: "Profile",  page: "profile"  },
];

/**
 * Shared glass pill navigation bar.
 * @param {{ activePage?: string | null }} props
 */
export default function NavBar({ activePage = null }) {
  const nightMode = useNightMode();
  const router = useRouter();

  const heading = nightMode ? "#dde3ea" : "#0d2a14";
  const muted   = nightMode ? "#6a8a70" : "#4a7a50";

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <nav
      aria-label="Main navigation"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        position: "relative",
        background: nightMode ? "rgba(8,12,18,0.75)" : "rgba(255,255,255,0.72)",
        backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`,
        borderRadius: 999,
        padding: "8px 16px",
        maxWidth: 1000,
        margin: "0 auto 24px",
        boxShadow: nightMode ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 20px rgba(46,125,50,0.10)",
      }}
    >
      <Link
        href="/"
        aria-label="Hibi home"
        style={{
          textDecoration: "none",
          fontWeight: 900,
          fontSize: 20,
          color: heading,
          letterSpacing: 2,
          userSelect: "none",
          flexShrink: 0,
          position: "absolute",
          left: 18,
        }}
      >
        Hibi
      </Link>

      {NAV_LINKS.map(({ href, label, page }) => {
        const active = activePage === page;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            style={{
              textDecoration: "none",
              background: active
                ? (nightMode ? "rgba(34,197,94,0.18)" : "rgba(26,110,54,0.14)")
                : "transparent",
              color: active
                ? (nightMode ? "#4ade80" : "#1a6e36")
                : muted,
              padding: "7px 14px",
              borderRadius: 999,
              fontWeight: active ? 700 : 600,
              fontSize: 14,
              transition: "all 0.18s ease",
            }}
          >
            {label}
          </Link>
        );
      })}

      <button
        onClick={handleLogout}
        aria-label="Log out of Hibi"
        style={{
          background: "transparent",
          color: muted,
          padding: "7px 14px",
          borderRadius: 999,
          fontWeight: 600,
          fontSize: 14,
          border: "none",
          cursor: "pointer",
          position: "absolute",
          right: 10,
        }}
      >
        Log Out
      </button>
    </nav>
  );
}
