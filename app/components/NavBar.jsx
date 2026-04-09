"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useNightMode } from "@/lib/useNightMode";

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}
function HabitsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 11 12 14 22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  );
}
function JournalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}
function ProfileIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

const TOP_NAV = [
  { href: "/calendar", label: "Calendar", page: "calendar" },
  { href: "/habits",   label: "Habits",   page: "habits"   },
  { href: "/today",    label: "Journal",  page: "journal"  },
  { href: "/profile",  label: "Profile",  page: "profile"  },
];

const BOTTOM_NAV = [
  { href: "/",         label: "Home",     page: "home",     Icon: HomeIcon     },
  { href: "/habits",   label: "Habits",   page: "habits",   Icon: HabitsIcon   },
  { href: "/today",    label: "Journal",  page: "journal",  Icon: JournalIcon  },
  { href: "/calendar", label: "Calendar", page: "calendar", Icon: CalendarIcon },
  { href: "/profile",  label: "Profile",  page: "profile",  Icon: ProfileIcon  },
];

/**
 * Shared navigation bar.
 * Top pill nav on desktop, fixed bottom icon nav on mobile.
 * @param {{ activePage?: string | null }} props
 */
export default function NavBar({ activePage = null }) {
  const nightMode = useNightMode();
  const router = useRouter();
  const effectivePage = activePage ?? "home";

  const heading = nightMode ? "#dde3ea" : "#0d2a14";
  const muted   = nightMode ? "#6a8a70" : "#4a7a50";

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <>
      {/* Top pill nav — desktop only */}
      <nav
        aria-label="Main navigation"
        className="hibi-top-nav"
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

        {TOP_NAV.map(({ href, label, page }) => {
          const active = effectivePage === page;
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
                color: active ? (nightMode ? "#4ade80" : "#1a6e36") : muted,
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

      {/* Bottom icon nav — mobile only */}
      <nav
        aria-label="Mobile navigation"
        className={`hibi-bottom-nav${nightMode ? "" : " light"}`}
      >
        {BOTTOM_NAV.map(({ href, label, page, Icon }) => {
          const active = effectivePage === page;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`hibi-bottom-nav-item${active ? " active" : ""}`}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
