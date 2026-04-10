"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useReducedMotion } from "@/lib/hooks/useReducedMotion";

/* ── helpers ─────────────────────────────────────────────────── */
function useTimeOfDay() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);
  return hour;
}

function isNight(h) {
  return h >= 19 || h < 6;
}

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const hour = useTimeOfDay();
  const dark = isNight(hour);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- one-time hydration guard
  }, []);

  useEffect(() => {
    async function checkSession() {
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.replace("/");
    }
    checkSession();
  }, [router]);

  /* ── greeting based on time ─────────────────────────────────── */
  const greeting = useMemo(() => {
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 21) return "Good evening";
    return "Quiet hours";
  }, [hour]);

  /* ── auth handlers (unchanged logic) ────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!supabase) { setStatus("Supabase is not configured."); return; }
    if (mode === "signup" && !fullName.trim()) { setStatus("Please add your name to create your profile."); return; }
    setLoading(true);
    const response =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email, password,
            options: { data: { full_name: fullName.trim(), display_name: fullName.trim() } },
          });
    const { data, error } = response;
    if (error) { setStatus(error.message); setLoading(false); return; }
    if (mode === "login") { setStatus("Logged in successfully."); router.replace("/"); }
    else {
      if (data?.user?.id) {
        await supabase.from("profiles").upsert(
          { id: data.user.id, full_name: fullName.trim(), email },
          { onConflict: "id" }
        );
      }
      setStatus("Account created. Check your email for verification, then log in.");
      setMode("login");
      setFullName("");
    }
    setLoading(false);
  }

  async function handleGoogleAuth() {
    if (!supabase) { setStatus("Supabase is not configured."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) { setStatus(error.message); setLoading(false); }
  }

  /* ── palette ────────────────────────────────────────────────── */
  const p = dark
    ? {
        bg: "linear-gradient(160deg, #0a0f0d 0%, #0d1a12 40%, #101f16 100%)",
        cardBg: "rgba(255,255,255,0.04)",
        cardBorder: "rgba(255,255,255,0.07)",
        cardShadow: "0 12px 48px rgba(0,0,0,0.55), 0 2px 12px rgba(0,0,0,0.4)",
        title: "#d4e8d0",
        subtitle: "#7da882",
        heading: "#e8f5e9",
        text: "#9ab89e",
        inputBg: "rgba(255,255,255,0.06)",
        inputBorder: "rgba(120,180,130,0.22)",
        inputText: "#e0efe2",
        inputPlaceholder: "#5a7a5e",
        btnBg: "#2e7d32",
        btnHover: "#388e3c",
        btnText: "#fff",
        googleBg: "rgba(255,255,255,0.06)",
        googleBorder: "rgba(120,180,130,0.22)",
        googleText: "#b0d4b4",
        linkColor: "#5aad60",
        statusColor: "#7da882",
        auroraA: "rgba(90,174,126,0.12)",
        auroraB: "rgba(224,143,109,0.08)",
        glowColor: "rgba(46,125,50,0.15)",
      }
    : {
        bg: "linear-gradient(160deg, #fdf8f0 0%, #f0faf0 40%, #e2f5e4 100%)",
        cardBg: "rgba(255,255,255,0.82)",
        cardBorder: "rgba(46,125,50,0.12)",
        cardShadow: "0 12px 48px rgba(46,125,50,0.10), 0 2px 12px rgba(0,0,0,0.04)",
        title: "#0d2a14",
        subtitle: "#2e7d32",
        heading: "#14532d",
        text: "#3a6d42",
        inputBg: "#ffffff",
        inputBorder: "rgba(46,125,50,0.22)",
        inputText: "#0f172a",
        inputPlaceholder: "#8aa88e",
        btnBg: "#2e7d32",
        btnHover: "#256b28",
        btnText: "#fff",
        googleBg: "#ffffff",
        googleBorder: "rgba(46,125,50,0.22)",
        googleText: "#14532d",
        linkColor: "#2e7d32",
        statusColor: "#14532d",
        auroraA: "rgba(90,174,126,0.18)",
        auroraB: "rgba(224,143,109,0.14)",
        glowColor: "rgba(46,125,50,0.08)",
      };

  /* ── animation helpers ──────────────────────────────────────── */
  const anim = (name, delay = "0ms") =>
    reducedMotion
      ? {}
      : {
          animation: `${name} var(--hibi-motion-slow) var(--hibi-ease-enter) both`,
          animationDelay: delay,
        };

  return (
    <>
      {/* ── login-page scoped keyframes & styles ────────────── */}
      <style jsx>{`
        @keyframes loginFloat {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(3%, -3%) scale(1.02); }
          66% { transform: translate(-2%, 2%) scale(0.98); }
        }
        @keyframes loginOrb {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        /* ── Ambient breath layers ─────────────────────────── */
        @keyframes breathPulse {
          0%   { opacity: var(--breath-lo); filter: blur(var(--breath-blur-lo)); }
          50%  { opacity: var(--breath-hi); filter: blur(var(--breath-blur-hi)); }
          100% { opacity: var(--breath-lo); filter: blur(var(--breath-blur-lo)); }
        }
        @keyframes breathDrift {
          0%   { transform: translate(0%, 0%) scale(1); }
          25%  { transform: translate(2%, -1.5%) scale(1.03); }
          50%  { transform: translate(-1%, 2%) scale(1.01); }
          75%  { transform: translate(-2.5%, -0.5%) scale(1.04); }
          100% { transform: translate(0%, 0%) scale(1); }
        }
        @keyframes breathHueShift {
          0%   { filter: hue-rotate(0deg) blur(80px); }
          50%  { filter: hue-rotate(12deg) blur(90px); }
          100% { filter: hue-rotate(0deg) blur(80px); }
        }
        @keyframes loginCardIn {
          from { opacity: 0; transform: translateY(24px) scale(0.97); filter: blur(4px); }
          to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes loginFieldIn {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes loginBtnIn {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes loginShimmer {
          from { background-position: -200% center; }
          to   { background-position: 200% center; }
        }
        @keyframes loginPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(46,125,50,0.18); }
          50%      { box-shadow: 0 0 0 8px rgba(46,125,50,0); }
        }
        .login-input:focus {
          outline: none;
          border-color: ${dark ? "rgba(90,174,126,0.5)" : "rgba(46,125,50,0.45)"} !important;
          box-shadow: 0 0 0 3px ${dark ? "rgba(90,174,126,0.12)" : "rgba(46,125,50,0.10)"};
        }
        .login-btn-primary:hover:not(:disabled) {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
        .login-btn-primary:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
        }
        .login-btn-google:hover:not(:disabled) {
          background: ${dark ? "rgba(255,255,255,0.08)" : "rgba(46,125,50,0.04)"} !important;
          border-color: ${dark ? "rgba(120,180,130,0.35)" : "rgba(46,125,50,0.35)"} !important;
          transform: translateY(-1px);
        }
        .login-btn-google:active:not(:disabled) {
          transform: translateY(0) scale(0.985);
        }
        .login-switch:hover {
          text-decoration: underline;
          text-underline-offset: 3px;
        }
      `}</style>

      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: p.bg,
          fontFamily: "var(--font-manrope), 'Avenir Next', 'Segoe UI', sans-serif",
          position: "relative",
          overflow: "hidden",
          transition: "background 0.6s var(--hibi-ease-standard)",
        }}
      >
        {/* ── Aurora blobs ────────────────────────────────────── */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: "55%",
              height: "55%",
              top: "-10%",
              left: "-8%",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${p.auroraA}, transparent 70%)`,
              filter: "blur(60px)",
              animation: reducedMotion ? "none" : "loginFloat 26s cubic-bezier(0.45,0.05,0.55,0.95) infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              width: "45%",
              height: "50%",
              bottom: "-5%",
              right: "-5%",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${p.auroraB}, transparent 70%)`,
              filter: "blur(50px)",
              animation: reducedMotion ? "none" : "loginFloat 34s cubic-bezier(0.45,0.05,0.55,0.95) infinite reverse",
            }}
          />
          {/* Small decorative orb */}
          <div
            style={{
              position: "absolute",
              width: 120,
              height: 120,
              top: "60%",
              left: "65%",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${p.glowColor}, transparent 70%)`,
              filter: "blur(30px)",
              animation: reducedMotion ? "none" : "loginOrb 10s cubic-bezier(0.45,0.05,0.55,0.95) infinite",
            }}
          />

          {/* ── Ambient breath layers ─────────────────────────── */}
          {!reducedMotion && (
            <>
              {/* Primary breath — full-screen tint pulse */}
              <div
                style={{
                  "--breath-lo": dark ? "0.04" : "0.06",
                  "--breath-hi": dark ? "0.10" : "0.13",
                  "--breath-blur-lo": "80px",
                  "--breath-blur-hi": "100px",
                  position: "absolute",
                  inset: "-20%",
                  borderRadius: "50%",
                  background: dark
                    ? "radial-gradient(ellipse at 40% 45%, rgba(90,174,126,0.22), rgba(46,125,50,0.06) 55%, transparent 80%)"
                    : "radial-gradient(ellipse at 40% 45%, rgba(90,174,126,0.28), rgba(46,125,50,0.08) 55%, transparent 80%)",
                  animation: "breathPulse 12s cubic-bezier(0.45,0.05,0.55,0.95) infinite, breathDrift 32s cubic-bezier(0.45,0.05,0.55,0.95) infinite",
                }}
              />
              {/* Secondary breath — warm counter-drift */}
              <div
                style={{
                  "--breath-lo": dark ? "0.03" : "0.05",
                  "--breath-hi": dark ? "0.08" : "0.11",
                  "--breath-blur-lo": "90px",
                  "--breath-blur-hi": "110px",
                  position: "absolute",
                  inset: "-15%",
                  borderRadius: "50%",
                  background: dark
                    ? "radial-gradient(ellipse at 65% 60%, rgba(224,143,109,0.15), rgba(180,120,80,0.04) 50%, transparent 78%)"
                    : "radial-gradient(ellipse at 65% 60%, rgba(224,163,109,0.20), rgba(180,140,80,0.06) 50%, transparent 78%)",
                  animation: "breathPulse 14s cubic-bezier(0.45,0.05,0.55,0.95) infinite -4s, breathDrift 38s cubic-bezier(0.45,0.05,0.55,0.95) infinite reverse",
                }}
              />
              {/* Tertiary — subtle hue-shifting veil */}
              <div
                style={{
                  position: "absolute",
                  inset: "-10%",
                  borderRadius: "40%",
                  background: dark
                    ? "radial-gradient(ellipse at 50% 40%, rgba(90,140,126,0.07), transparent 65%)"
                    : "radial-gradient(ellipse at 50% 40%, rgba(90,160,126,0.10), transparent 65%)",
                  animation: "breathHueShift 28s cubic-bezier(0.45,0.05,0.55,0.95) infinite",
                }}
              />
            </>
          )}
        </div>

        {/* ── Card ────────────────────────────────────────────── */}
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 400,
            background: p.cardBg,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: `1px solid ${p.cardBorder}`,
            borderRadius: 22,
            padding: "36px 28px 28px",
            boxShadow: p.cardShadow,
            ...(mounted ? anim("loginCardIn") : { opacity: 0 }),
          }}
        >
          {/* ── Brand ─────────────────────────────────────────── */}
          <h2
            className="hibi-brand-headline"
            style={{
              margin: "0 0 2px",
              color: p.title,
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: -0.5,
              ...anim("hibiFadeIn", "80ms"),
            }}
          >
            Hibi
          </h2>
          <p
            style={{
              margin: "0 0 22px",
              color: p.subtitle,
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: 0.3,
              ...anim("hibiFadeIn", "140ms"),
            }}
          >
            {greeting} — day by day, you grow
          </p>

          {/* ── Heading ───────────────────────────────────────── */}
          <h1
            className="hibi-brand-headline"
            style={{
              margin: "0 0 4px",
              color: p.heading,
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: -0.3,
              ...anim("hibiFadeIn", "200ms"),
            }}
          >
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h1>
          <p
            style={{
              margin: "0 0 20px",
              color: p.text,
              fontWeight: 500,
              fontSize: 14,
              lineHeight: 1.5,
              ...anim("hibiFadeIn", "260ms"),
            }}
          >
            {mode === "login"
              ? "Sign in to your private studio."
              : "Set up your personal space in seconds."}
          </p>

          {/* ── Form ──────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            {mode === "signup" && (
              <div style={anim("loginFieldIn", "300ms")}>
                <label
                  style={{
                    display: "block",
                    color: p.text,
                    fontWeight: 600,
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    marginBottom: 6,
                  }}
                >
                  Your name
                </label>
                <input
                  className="login-input"
                  type="text"
                  placeholder="What should Hibi call you?"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  style={{
                    width: "100%",
                    padding: "11px 14px",
                    borderRadius: 12,
                    border: `1.5px solid ${p.inputBorder}`,
                    fontSize: 15,
                    color: p.inputText,
                    background: p.inputBg,
                    WebkitTextFillColor: p.inputText,
                    transition:
                      "border-color 0.2s ease, box-shadow 0.2s ease",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            <div style={anim("loginFieldIn", mode === "signup" ? "350ms" : "300ms")}>
              <label
                style={{
                  display: "block",
                  color: p.text,
                  fontWeight: 600,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 6,
                }}
              >
                Email
              </label>
              <input
                className="login-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: 12,
                  border: `1.5px solid ${p.inputBorder}`,
                  fontSize: 15,
                  color: p.inputText,
                  background: p.inputBg,
                  WebkitTextFillColor: p.inputText,
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={anim("loginFieldIn", mode === "signup" ? "400ms" : "350ms")}>
              <label
                style={{
                  display: "block",
                  color: p.text,
                  fontWeight: 600,
                  fontSize: 12,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: 6,
                }}
              >
                Password
              </label>
              <input
                className="login-input"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: 12,
                  border: `1.5px solid ${p.inputBorder}`,
                  fontSize: 15,
                  color: p.inputText,
                  background: p.inputBg,
                  WebkitTextFillColor: p.inputText,
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              className="login-btn-primary"
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                background: p.btnBg,
                color: p.btnText,
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15,
                padding: "12px 16px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                transition:
                  "transform 0.18s var(--hibi-ease-standard), filter 0.18s ease, opacity 0.2s ease",
                ...anim("loginBtnIn", mode === "signup" ? "450ms" : "400ms"),
              }}
            >
              {loading ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTopColor: "#fff",
                      borderRadius: "50%",
                      display: "inline-block",
                      animation: "hibiPullSpin 0.6s linear infinite",
                    }}
                  />
                  Signing {mode === "login" ? "in" : "up"}…
                </span>
              ) : mode === "login" ? (
                "Sign in"
              ) : (
                "Create account"
              )}
            </button>
          </form>

          {/* ── Divider ───────────────────────────────────────── */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "18px 0",
              ...anim("hibiFadeIn", "460ms"),
            }}
          >
            <div style={{ flex: 1, height: 1, background: p.cardBorder }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: p.text,
                textTransform: "uppercase",
                letterSpacing: 1,
                opacity: 0.6,
              }}
            >
              or
            </span>
            <div style={{ flex: 1, height: 1, background: p.cardBorder }} />
          </div>

          {/* ── Google ────────────────────────────────────────── */}
          <button
            className="login-btn-google"
            type="button"
            onClick={handleGoogleAuth}
            disabled={loading}
            style={{
              width: "100%",
              background: p.googleBg,
              color: p.googleText,
              border: `1.5px solid ${p.googleBorder}`,
              borderRadius: 12,
              fontWeight: 600,
              fontSize: 14,
              padding: "11px 14px",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              transition:
                "transform 0.18s var(--hibi-ease-standard), background 0.2s ease, border-color 0.2s ease",
              ...anim("loginBtnIn", "500ms"),
            }}
          >
            {/* Google icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.1a7.12 7.12 0 010-4.24V7.02H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.02l3.66-2.92z"
                fill="#FBBC05"
              />
              <path
                d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          {/* ── Mode switch ───────────────────────────────────── */}
          <button
            className="login-switch"
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setStatus("");
            }}
            style={{
              marginTop: 18,
              background: "transparent",
              border: "none",
              color: p.linkColor,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              padding: 0,
              transition: "color 0.18s ease",
              ...anim("hibiFadeIn", "540ms"),
            }}
          >
            {mode === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>

          {/* ── Status ────────────────────────────────────────── */}
          {status && (
            <p
              style={{
                margin: "14px 0 0",
                color: status.toLowerCase().includes("error") || status.toLowerCase().includes("invalid")
                  ? "#e57373"
                  : p.statusColor,
                fontWeight: 500,
                fontSize: 13,
                lineHeight: 1.5,
                animation: "hibiFadeIn 0.25s ease both",
              }}
            >
              {status}
            </p>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <p
          style={{
            position: "absolute",
            bottom: 20,
            left: 0,
            right: 0,
            textAlign: "center",
            color: p.text,
            fontSize: 11,
            fontWeight: 500,
            opacity: 0.5,
            ...anim("hibiFadeIn", "600ms"),
          }}
        >
          Hibi — your daily studio
        </p>
      </main>
    </>
  );
}
