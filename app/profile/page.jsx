"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NavBar from "@/app/components/NavBar";
import { supabase } from "@/lib/supabaseClient";
import {
  getStoredNightModePreference,
  isNightModeEnabled,
  NIGHT_MODE_OPTIONS,
  setStoredNightModePreference,
} from "@/lib/nightModePreference";

const CROP_CANVAS_W = 360;
const CROP_CANVAS_H = 360;
const CROP_RADIUS = 140;

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
  const [avatarSrc, setAvatarSrc] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [appStats, setAppStats] = useState({ habits: 0, entries: 0, totalWords: 0, completionRate: null });
  const nightMode = isNightModeEnabled(nightModePreference, new Date(autoNightTimestamp));

  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [rawImageSrc, setRawImageSrc] = useState("");
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [cropZoomDisplay, setCropZoomDisplay] = useState(1.0);
  const cropCanvasRef = useRef(null);
  const cropImgObjRef = useRef(null);
  const avatarInputRef = useRef(null);
  const cropOffsetRef = useRef({ x: 0, y: 0 });
  const cropZoomRef = useRef(1.0);
  const cropMinZoomRef = useRef(1.0);
  const lastPanPosRef = useRef(null);
  const statusTimerRef = useRef(null);

  function showStatus(msg) {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatus(msg);
    statusTimerRef.current = setTimeout(() => setStatus(""), 3000);
  }

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

  useEffect(() => {
    if (!userId) return;
    try {
      const storedAvatar = localStorage.getItem(`hibi_avatar_${userId}`);
      if (storedAvatar) setAvatarSrc(storedAvatar);
      const habitListRaw = localStorage.getItem(`habit_list_${userId}`);
      const habitList = habitListRaw ? JSON.parse(habitListRaw) : [];
      let entryCount = 0;
      let totalWords = 0;
      const currentYear = new Date().getFullYear();
      for (let y = 2023; y <= currentYear; y++) {
        const journalRaw = localStorage.getItem(`hibi_journal_${userId}_${y}_all`);
        if (!journalRaw) continue;
        const journalData = JSON.parse(journalRaw);
        Object.values(journalData).forEach((list) => {
          if (!Array.isArray(list)) return;
          entryCount += list.length;
          list.forEach((entry) => {
            const t = String(entry?.text || "").trim();
            if (t) totalWords += t.split(/\s+/).length;
          });
        });
      }
      const todayDate = new Date();
      const yr = todayDate.getFullYear();
      const mo = todayDate.getMonth() + 1;
      const daysElapsed = todayDate.getDate();
      const habitsKey = `habit_checks_${userId}_${yr}_${String(mo).padStart(2, "0")}`;
      const habitsChecksRaw = localStorage.getItem(habitsKey);
      const habitsChecks = habitsChecksRaw ? JSON.parse(habitsChecksRaw) : {};
      let doneCalls = 0;
      const possible = habitList.length * daysElapsed;
      if (possible > 0) {
        for (let d = 1; d <= daysElapsed; d++) {
          habitList.forEach((habit) => {
            if (habitsChecks[`${habit}-${d}`] === "dot") doneCalls++;
          });
        }
      }
      const completionRate = possible > 0 ? Math.round((doneCalls / possible) * 100) : null;
      setAppStats({ habits: habitList.length, entries: entryCount, totalWords, completionRate });
    } catch {}
  }, [userId]);

  useEffect(() => {
    if (!cropModalOpen || !rawImageSrc) return;
    const img = new Image();
    img.onload = () => {
      cropImgObjRef.current = img;
      const baseScale = Math.min(CROP_CANVAS_W / img.naturalWidth, CROP_CANVAS_H / img.naturalHeight);
      const scaledW = img.naturalWidth * baseScale;
      const scaledH = img.naturalHeight * baseScale;
      const minZoom = Math.max(1, (2 * CROP_RADIUS) / Math.min(scaledW, scaledH));
      cropMinZoomRef.current = minZoom;
      cropZoomRef.current = minZoom;
      cropOffsetRef.current = { x: 0, y: 0 };
      setCropZoomDisplay(minZoom);
      drawCropCanvas({ x: 0, y: 0 }, minZoom, img);
    };
    img.src = rawImageSrc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropModalOpen, rawImageSrc]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && cropModalOpen) {
        setCropModalOpen(false);
        setRawImageSrc("");
        cropImgObjRef.current = null;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cropModalOpen]);

  async function saveProfile(e) {
    e.preventDefault();
    if (!supabase || !userId) return;

    if (!fullName.trim()) {
      showStatus("Please add your name before saving.");
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
      showStatus(authError.message);
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

    showStatus("Profile updated.");
    setSaving(false);
  }

  function drawCropCanvas(offset, zoom, img) {
    const canvas = cropCanvasRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    const CX = CROP_CANVAS_W / 2;
    const CY = CROP_CANVAS_H / 2;
    const baseScale = Math.min(CROP_CANVAS_W / img.naturalWidth, CROP_CANVAS_H / img.naturalHeight);
    const scaledW = img.naturalWidth * baseScale * zoom;
    const scaledH = img.naturalHeight * baseScale * zoom;
    const dx = CX + offset.x - scaledW / 2;
    const dy = CY + offset.y - scaledH / 2;
    ctx.clearRect(0, 0, CROP_CANVAS_W, CROP_CANVAS_H);
    ctx.drawImage(img, dx, dy, scaledW, scaledH);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, CROP_CANVAS_W, CROP_CANVAS_H);
    ctx.save();
    ctx.beginPath();
    ctx.arc(CX, CY, CROP_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, dx, dy, scaledW, scaledH);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(CX, CY, CROP_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const src = String(reader.result || "");
      if (!src) return;
      setRawImageSrc(src);
      setCropModalOpen(true);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  }

  function handleCropConfirm() {
    const img = cropImgObjRef.current;
    if (!img || !userId) return;
    const baseScale = Math.min(CROP_CANVAS_W / img.naturalWidth, CROP_CANVAS_H / img.naturalHeight);
    const zoom = cropZoomRef.current;
    const offset = cropOffsetRef.current;
    const imgR = CROP_RADIUS / (baseScale * zoom);
    const imgCX = img.naturalWidth / 2 - offset.x / (baseScale * zoom);
    const imgCY = img.naturalHeight / 2 - offset.y / (baseScale * zoom);
    const OUTPUT_SIZE = 200;
    const outCanvas = document.createElement("canvas");
    outCanvas.width = OUTPUT_SIZE;
    outCanvas.height = OUTPUT_SIZE;
    const outCtx = outCanvas.getContext("2d");
    outCtx.beginPath();
    outCtx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    outCtx.clip();
    outCtx.drawImage(img, imgCX - imgR, imgCY - imgR, imgR * 2, imgR * 2, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const dataUrl = outCanvas.toDataURL("image/jpeg", 0.9);
    setAvatarSrc(dataUrl);
    try { localStorage.setItem(`hibi_avatar_${userId}`, dataUrl); } catch {}
    setCropModalOpen(false);
    setRawImageSrc("");
    cropImgObjRef.current = null;
  }

  function clampCropOffset(offset, zoom, img) {
    const baseScale = Math.min(CROP_CANVAS_W / img.naturalWidth, CROP_CANVAS_H / img.naturalHeight);
    const scaledW = img.naturalWidth * baseScale * zoom;
    const scaledH = img.naturalHeight * baseScale * zoom;
    const maxX = Math.max(0, scaledW / 2 - CROP_RADIUS);
    const maxY = Math.max(0, scaledH / 2 - CROP_RADIUS);
    return {
      x: Math.max(-maxX, Math.min(maxX, offset.x)),
      y: Math.max(-maxY, Math.min(maxY, offset.y)),
    };
  }

  function applyZoom(nextZoom) {
    const img = cropImgObjRef.current;
    if (!img) return;
    const clamped = Math.max(cropMinZoomRef.current, Math.min(4.0, nextZoom));
    cropZoomRef.current = clamped;
    cropOffsetRef.current = clampCropOffset(cropOffsetRef.current, clamped, img);
    setCropZoomDisplay(clamped);
    drawCropCanvas(cropOffsetRef.current, clamped, img);
  }

  function handleCropPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDraggingCrop(true);
    lastPanPosRef.current = { x: e.clientX, y: e.clientY };
  }

  function handleCropPointerMove(e) {
    if (!isDraggingCrop || !lastPanPosRef.current) return;
    const img = cropImgObjRef.current;
    if (!img) return;
    const canvas = cropCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CROP_CANVAS_W / rect.width;
    const scaleY = CROP_CANVAS_H / rect.height;
    const dx = (e.clientX - lastPanPosRef.current.x) * scaleX;
    const dy = (e.clientY - lastPanPosRef.current.y) * scaleY;
    lastPanPosRef.current = { x: e.clientX, y: e.clientY };
    const newOffset = clampCropOffset(
      { x: cropOffsetRef.current.x + dx, y: cropOffsetRef.current.y + dy },
      cropZoomRef.current,
      img
    );
    cropOffsetRef.current = newOffset;
    drawCropCanvas(newOffset, cropZoomRef.current, img);
  }

  function handleCropPointerUp() {
    setIsDraggingCrop(false);
    lastPanPosRef.current = null;
  }

  function handleCropWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    applyZoom(cropZoomRef.current + delta);
  }

  function exportData() {
    try {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && userId && key.includes(userId)) {
          try { data[key] = JSON.parse(localStorage.getItem(key)); }
          catch { data[key] = localStorage.getItem(key); }
        }
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hibi-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  }

  async function handleDeleteAccount() {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      return;
    }
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && userId && k.includes(userId)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
  }

  async function handleLogout() {
    if (supabase) await supabase.auth.signOut();
    router.replace("/login");
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
            ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)"
            : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
          color: nightMode ? "#dde3ea" : "#0d2a14",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
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
        padding: "28px 24px",
        background: nightMode
          ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)"
          : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif",
        color: nightMode ? "#dde3ea" : "#0d2a14",
        animation: "hibiFadeIn 0.35s ease",
      }}
    >
      <NavBar activePage="profile" />

      <section
        style={{
          maxWidth: 620,
          margin: "0 auto",
          background: nightMode ? "rgba(12,16,22,0.82)" : "rgba(255,255,255,0.82)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`,
          borderRadius: 22,
          boxShadow: nightMode ? "0 8px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4)" : "0 8px 40px rgba(46,125,50,0.10), 0 2px 8px rgba(0,0,0,0.04)",
          padding: 28,
        }}
      >
        <h1 style={{ margin: "0 0 8px", fontSize: "clamp(24px,5vw,32px)", fontWeight: 800, letterSpacing: -0.5, color: nightMode ? "#dde3ea" : "#0d2a14" }}>Edit Profile</h1>
        <p style={{ margin: "0 0 16px", color: nightMode ? "#6a8a70" : "#4a7a50" }}>Update what Hibi calls you on your home page.</p>

        <form onSubmit={saveProfile} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 6 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              {avatarSrc ? (
                <img src={avatarSrc} alt="Profile" style={{ width: 72, height: 72, borderRadius: "50%", objectFit: "cover", border: `2px solid ${nightMode ? "#2b3139" : "#a5d6a7"}` }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: nightMode ? "#2b3139" : "#c8e6c9", display: "grid", placeItems: "center", fontSize: 28, color: nightMode ? "#9aa3af" : "#2e7d32", border: `2px solid ${nightMode ? "#39424d" : "#a5d6a7"}` }}>
                  {(preferredName || fullName || "?").charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <p style={{ margin: "0 0 6px", fontWeight: 700, fontSize: 15, color: nightMode ? "#dde3ea" : "#0d2a14" }}>Profile Photo</p>
              <label style={{ cursor: "pointer", border: `1px solid ${nightMode ? "rgba(255,255,255,0.10)" : "rgba(46,125,50,0.20)"}`, borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, color: nightMode ? "#6a8a70" : "#4a7a50", display: "inline-block" }}>
                Upload Photo
                <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: "none" }} />
              </label>
              {avatarSrc && (
                <button type="button" onClick={() => { setAvatarSrc(""); try { localStorage.removeItem(`hibi_avatar_${userId}`); } catch {} }} style={{ marginLeft: 8, border: "none", background: "transparent", color: nightMode ? "#6a8a70" : "#888", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}>Remove</button>
              )}
            </div>
          </div>
          <label style={{ color: nightMode ? "#dde3ea" : "#0d2a14", fontWeight: 700 }}>Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            required
            style={{ padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${nightMode ? "rgba(255,255,255,0.12)" : "rgba(46,125,50,0.25)"}`, fontSize: 15, color: nightMode ? "#dde3ea" : "#0d2a14", background: nightMode ? "rgba(7,10,15,0.9)" : "rgba(255,255,255,0.95)" }}
          />

          <label style={{ color: nightMode ? "#dde3ea" : "#0d2a14", fontWeight: 700, marginTop: 4 }}>Preferred Name (optional)</label>
          <input
            type="text"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            placeholder="What should Hibi call you?"
            style={{ padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${nightMode ? "rgba(255,255,255,0.12)" : "rgba(46,125,50,0.25)"}`, fontSize: 15, color: nightMode ? "#dde3ea" : "#0d2a14", background: nightMode ? "rgba(7,10,15,0.9)" : "rgba(255,255,255,0.95)" }}
          />

          <label style={{ color: nightMode ? "#dde3ea" : "#0d2a14", fontWeight: 700, marginTop: 4 }}>Night Mode Preference</label>
          <select
            value={nightModePreference}
            onChange={(e) => {
              const next = e.target.value;
              setNightModePreference(next);
              setStoredNightModePreference(next);
            }}
            style={{ padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${nightMode ? "rgba(255,255,255,0.12)" : "rgba(46,125,50,0.25)"}`, fontSize: 15, color: nightMode ? "#dde3ea" : "#0d2a14", background: nightMode ? "rgba(7,10,15,0.9)" : "rgba(255,255,255,0.95)" }}
          >
            <option value={NIGHT_MODE_OPTIONS.AUTO}>Auto</option>
            <option value={NIGHT_MODE_OPTIONS.ON}>Always on</option>
            <option value={NIGHT_MODE_OPTIONS.OFF}>Always off</option>
          </select>

          <label style={{ color: nightMode ? "#dde3ea" : "#0d2a14", fontWeight: 700, marginTop: 4 }}>Email</label>
          <input
            type="email"
            value={email}
            readOnly
            style={{ padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${nightMode ? "rgba(255,255,255,0.06)" : "rgba(46,125,50,0.10)"}`, fontSize: 15, color: nightMode ? "#6a8a70" : "#64748b", background: nightMode ? "rgba(7,10,15,0.6)" : "rgba(240,250,240,0.6)" }}
          />

          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: 8, background: nightMode ? "rgba(34,197,94,0.20)" : "#1a6e36", color: nightMode ? "#4ade80" : "#fff", border: nightMode ? "1px solid rgba(34,197,94,0.30)" : "none", borderRadius: 999, fontWeight: 700, padding: "11px 14px", cursor: saving ? "not-allowed" : "pointer", fontSize: 15, boxShadow: nightMode ? "0 0 20px rgba(34,197,94,0.12)" : "0 4px 14px rgba(26,110,54,0.30)" }}
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </form>

        <p style={{ minHeight: 22, margin: "10px 0 0", color: nightMode ? "#4ade80" : "#1a6e36", fontWeight: 500 }}>{status}</p>

        <div style={{ marginTop: 20, borderTop: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`, paddingTop: 16 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: 15, color: nightMode ? "#dde3ea" : "#0d2a14" }}>Your Stats</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.06)", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`, borderRadius: 12, padding: "10px 14px" }}>
              <p style={{ margin: 0, color: nightMode ? "#6a8a70" : "#4a7a50", fontSize: 12 }}>Habits tracked</p>
              <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: nightMode ? "#dde3ea" : "#0d2a14" }}>{appStats.habits}</p>
            </div>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.06)", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`, borderRadius: 12, padding: "10px 14px" }}>
              <p style={{ margin: 0, color: nightMode ? "#6a8a70" : "#4a7a50", fontSize: 12 }}>Journal entries</p>
              <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: nightMode ? "#dde3ea" : "#0d2a14" }}>{appStats.entries}</p>
            </div>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.06)", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`, borderRadius: 12, padding: "10px 14px" }}>
              <p style={{ margin: 0, color: nightMode ? "#6a8a70" : "#4a7a50", fontSize: 12 }}>Words written</p>
              <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: nightMode ? "#dde3ea" : "#0d2a14" }}>{appStats.totalWords.toLocaleString()}</p>
            </div>
            <div style={{ background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.06)", border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`, borderRadius: 12, padding: "10px 14px" }}>
              <p style={{ margin: 0, color: nightMode ? "#6a8a70" : "#4a7a50", fontSize: 12 }}>Habit completion</p>
              <p style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 800, color: nightMode ? "#dde3ea" : "#0d2a14" }}>
                {appStats.completionRate !== null ? `${appStats.completionRate}%` : "—"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={exportData}
            style={{ width: "100%", marginBottom: 8, border: `1px solid ${nightMode ? "rgba(255,255,255,0.10)" : "rgba(46,125,50,0.20)"}`, background: "transparent", color: nightMode ? "#6a8a70" : "#4a7a50", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
          >
            Export My Data (JSON)
          </button>

          <button
            type="button"
            onClick={handleLogout}
            style={{ width: "100%", marginBottom: 8, border: `1px solid ${nightMode ? "rgba(255,255,255,0.12)" : "rgba(46,125,50,0.25)"}`, background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.06)", color: nightMode ? "#dde3ea" : "#1a5c2a", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
          >
            Log Out
          </button>

          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              style={{ width: "100%", border: "1px solid rgba(239,68,68,0.30)", background: "transparent", color: nightMode ? "#f87171" : "#991b1b", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
            >
              Delete Account
            </button>
          ) : (
            <div style={{ border: "1px solid rgba(239,68,68,0.30)", borderRadius: 12, padding: "12px 14px", background: nightMode ? "rgba(239,68,68,0.06)" : "rgba(254,242,242,0.9)" }}>
              <p style={{ margin: "0 0 10px", color: nightMode ? "#f87171" : "#991b1b", fontWeight: 700 }}>Are you sure? This will clear your local data and sign you out.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  style={{ flex: 1, background: "rgba(239,68,68,0.80)", color: "#fff", border: "none", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{ flex: 1, border: `1px solid ${nightMode ? "rgba(255,255,255,0.10)" : "rgba(46,125,50,0.20)"}`, background: "transparent", color: nightMode ? "#6a8a70" : "#4a7a50", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {cropModalOpen && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.72)",
            display: "grid", placeItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: nightMode ? "rgba(12,16,22,0.95)" : "rgba(255,255,255,0.96)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: `1px solid ${nightMode ? "rgba(255,255,255,0.08)" : "rgba(46,125,50,0.14)"}`,
              borderRadius: 20,
              padding: "20px 20px 16px",
              maxWidth: 420,
              width: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: nightMode ? "#dde3ea" : "#0d2a14" }}>
              Crop Profile Photo
            </h2>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: nightMode ? "#6a8a70" : "#4a7a50" }}>
              Drag to pan · Scroll or slide to zoom.
            </p>
            <canvas
              ref={cropCanvasRef}
              width={CROP_CANVAS_W}
              height={CROP_CANVAS_H}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerLeave={handleCropPointerUp}
              onWheel={handleCropWheel}
              style={{
                display: "block",
                width: "100%",
                borderRadius: 8,
                cursor: isDraggingCrop ? "grabbing" : "grab",
                touchAction: "none",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <span style={{ fontSize: 12, color: nightMode ? "#6a8a70" : "#4a7a50", flexShrink: 0 }}>Zoom</span>
              <input
                type="range"
                min={cropMinZoomRef.current}
                max={4.0}
                step={0.05}
                value={cropZoomDisplay}
                onChange={(e) => applyZoom(parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: nightMode ? "#22c55e" : "#1a6e36" }}
              />
              <span style={{ fontSize: 12, color: nightMode ? "#6a8a70" : "#4a7a50", width: 36, textAlign: "right", flexShrink: 0 }}>
                {cropZoomDisplay.toFixed(1)}×
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button
                type="button"
                onClick={handleCropConfirm}
                style={{
                  flex: 1, background: nightMode ? "rgba(34,197,94,0.20)" : "#1a6e36",
                  color: nightMode ? "#4ade80" : "#fff",
                  border: nightMode ? "1px solid rgba(34,197,94,0.30)" : "none",
                  borderRadius: 10,
                  padding: "10px", fontWeight: 700, cursor: "pointer", fontSize: 14,
                }}
              >
                Crop &amp; Save
              </button>
              <button
                type="button"
                onClick={() => { setCropModalOpen(false); setRawImageSrc(""); cropImgObjRef.current = null; }}
                style={{
                  flex: 1, background: "transparent",
                  color: nightMode ? "#6a8a70" : "#4a7a50",
                  border: `1px solid ${nightMode ? "rgba(255,255,255,0.10)" : "rgba(46,125,50,0.20)"}`,
                  borderRadius: 10, padding: "10px", fontWeight: 700, cursor: "pointer", fontSize: 14,
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
