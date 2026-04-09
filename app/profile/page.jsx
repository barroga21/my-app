"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  getStoredNightModePreference,
  isNightModeEnabled,
  NIGHT_MODE_OPTIONS,
  setStoredNightModePreference,
} from "@/lib/nightModePreference";

export default function ProfilePage() {
  const router = useRouter();

  const [authReady, setAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [preferredName, setPreferredName] = useState("");
  const [nightModePreference, setNightModePreference] = useState(NIGHT_MODE_OPTIONS.AUTO);
  const [autoNightTimestamp, setAutoNightTimestamp] = useState(Date.now());
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const nightMode = isNightModeEnabled(nightModePreference, new Date(autoNightTimestamp));

  useEffect(() => {
    setNightModePreference(getStoredNightModePreference());
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNightModePreference(getStoredNightModePreference());
      setAutoNightTimestamp(Date.now());
    }, 60 * 1000);

    const handleStorage = (event) => {
      if (!event.key || event.key === "hibi_night_mode_preference") {
        setNightModePreference(getStoredNightModePreference());
        setAutoNightTimestamp(Date.now());
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    let unsubscribe = null;

    async function loadUser() {
      if (!supabase) {
        setAuthReady(true);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const user = data?.user || null;
      if (!user) {
        router.replace("/login");
        return;
      }

      setUserId(user.id);
      setEmail(user.email || "");
      setFullName(
        user.user_metadata?.full_name ||
          user.user_metadata?.display_name ||
          user.user_metadata?.name ||
          ""
      );
      setPreferredName(user.user_metadata?.preferred_name || "");
      setAuthReady(true);

      const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
        if (!session?.user) {
          router.replace("/login");
          return;
        }
        setUserId(session.user.id);
      });
      unsubscribe = () => listener.subscription.unsubscribe();
    }

    loadUser();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [router]);

  async function saveProfile(e) {
    e.preventDefault();
    if (!supabase || !userId) return;

    if (!fullName.trim()) {
      setStatus("Please add your name before saving.");
      return;
    }

    setSaving(true);
    setStatus("");

    // Persist visual preference regardless of profile table availability.
    setStoredNightModePreference(nightModePreference);

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        full_name: fullName.trim(),
        display_name: fullName.trim(),
        preferred_name: preferredName.trim(),
      },
    });

    if (authError) {
      setStatus(authError.message);
      setSaving(false);
      return;
    }

    await supabase.from("profiles").upsert(
      {
        id: userId,
        email,
        full_name: fullName.trim(),
        preferred_name: preferredName.trim() || null,
      },
      { onConflict: "id" }
    );

    setStatus("Profile updated.");
    setSaving(false);
  }

  if (!authReady) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          background: nightMode
            ? "linear-gradient(165deg, #0f1113 0%, #15181c 50%, #1c2025 100%)"
            : "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
          color: nightMode ? "#e9ecef" : "#14532d",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        Loading profile...
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        background: nightMode
          ? "linear-gradient(165deg, #0f1113 0%, #15181c 50%, #1c2025 100%)"
          : "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
        fontFamily: "system-ui, sans-serif",
        color: nightMode ? "#e9ecef" : "#14532d",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          marginBottom: 18,
          position: "relative",
        }}
      >
        <Link
          href="/"
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            textDecoration: "none",
            fontWeight: 900,
            fontSize: 28,
            color: nightMode ? "#e9ecef" : "#14532d",
            letterSpacing: 1.5,
            paddingLeft: 12,
            userSelect: "none",
          }}
        >
          Hibi
        </Link>
        <Link href="/calendar" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Calendar
        </Link>
        <Link href="/habits" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Habit Tracker
        </Link>
        <Link href="/today" style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}` }}>
          Journal
        </Link>
        <Link href="/profile" style={{ textDecoration: "none", background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", padding: "10px 16px", borderRadius: 10, fontWeight: 700, boxShadow: nightMode ? "0 2px 8px #00000088" : "0 2px 8px #2e7d3240" }}>
          Profile
        </Link>
        <button
          onClick={async () => {
            if (supabase) await supabase.auth.signOut();
            router.replace("/login");
          }}
          style={{ textDecoration: "none", background: nightMode ? "#1c2127" : "#e8f5e9", color: nightMode ? "#e9ecef" : "#14532d", padding: "10px 16px", borderRadius: 10, fontWeight: 700, border: `1.5px solid ${nightMode ? "#2b3139" : "#2e7d32"}`, cursor: "pointer" }}
        >
          Log Out
        </button>
      </div>

      <section
        style={{
          maxWidth: 620,
          margin: "0 auto",
          background: nightMode ? "#171a1f" : "#ffffffcc",
          border: `1px solid ${nightMode ? "#2b3139" : "#dcebdc"}`,
          borderRadius: 18,
          boxShadow: nightMode ? "0 10px 26px #00000066" : "0 10px 26px #2e7d321f",
          padding: 22,
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: 34, color: nightMode ? "#e9ecef" : "#14532d" }}>Edit Profile</h1>
        <p style={{ margin: "0 0 16px", color: nightMode ? "#b6bdc7" : "#2e7d32" }}>Update what Hibi calls you on your home page.</p>

        <form onSubmit={saveProfile} style={{ display: "grid", gap: 10 }}>
          <label style={{ color: "#14532d", fontWeight: 700 }}>Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            required
            style={{ padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${nightMode ? "#353c46" : "#388e3c"}`, fontSize: 15, color: nightMode ? "#e9ecef" : "#0f172a", background: nightMode ? "#111418" : "#fff" }}
          />

          <label style={{ color: nightMode ? "#e9ecef" : "#14532d", fontWeight: 700, marginTop: 4 }}>Preferred Name (optional)</label>
          <input
            type="text"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            placeholder="What should Hibi call you?"
            style={{ padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${nightMode ? "#353c46" : "#388e3c"}`, fontSize: 15, color: nightMode ? "#e9ecef" : "#0f172a", background: nightMode ? "#111418" : "#fff" }}
          />

          <label style={{ color: nightMode ? "#e9ecef" : "#14532d", fontWeight: 700, marginTop: 4 }}>Night Mode Preference</label>
          <select
            value={nightModePreference}
            onChange={(e) => {
              const next = e.target.value;
              setNightModePreference(next);
              setStoredNightModePreference(next);
            }}
            style={{ padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${nightMode ? "#353c46" : "#388e3c"}`, fontSize: 15, color: nightMode ? "#e9ecef" : "#0f172a", background: nightMode ? "#111418" : "#fff" }}
          >
            <option value={NIGHT_MODE_OPTIONS.AUTO}>Auto</option>
            <option value={NIGHT_MODE_OPTIONS.ON}>Always on</option>
            <option value={NIGHT_MODE_OPTIONS.OFF}>Always off</option>
          </select>

          <label style={{ color: nightMode ? "#e9ecef" : "#14532d", fontWeight: 700, marginTop: 4 }}>Email</label>
          <input
            type="email"
            value={email}
            readOnly
            style={{ padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${nightMode ? "#353c46" : "#b8d5b9"}`, fontSize: 15, color: nightMode ? "#9aa3af" : "#64748b", background: nightMode ? "#141920" : "#f8fbf8" }}
          />

          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: 8, background: nightMode ? "#2b3139" : "#2e7d32", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, padding: "10px 14px", cursor: saving ? "not-allowed" : "pointer" }}
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>

        <p style={{ minHeight: 22, margin: "10px 0 0", color: nightMode ? "#e9ecef" : "#14532d", fontWeight: 500 }}>{status}</p>
      </section>
    </main>
  );
}
