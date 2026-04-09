"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    async function checkSession() {
      if (!supabase) return;
      const { data } = await supabase.auth.getUser();
      if (data?.user) {
        router.replace("/");
      }
    }
    checkSession();
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!supabase) {
      setStatus("Supabase is not configured.");
      return;
    }

    if (mode === "signup" && !fullName.trim()) {
      setStatus("Please add your name to create your profile.");
      return;
    }

    setLoading(true);

    const response =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName.trim(),
                display_name: fullName.trim(),
              },
            },
          });

    const { data, error } = response;

    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }

    if (mode === "login") {
      setStatus("Logged in successfully.");
      router.replace("/");
    } else {
      if (data?.user?.id) {
        await supabase.from("profiles").upsert(
          {
            id: data.user.id,
            full_name: fullName.trim(),
            email,
          },
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
    if (!supabase) {
      setStatus("Supabase is not configured.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });

    if (error) {
      setStatus(error.message);
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "linear-gradient(150deg, #fdf6ec 0%, #e8f5e9 55%, #c8e6c9 100%)",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#e8f5e9",
          borderRadius: 16,
          padding: 24,
          boxShadow: "0 8px 24px #2e7d3222",
        }}
      >
        <h2 style={{ margin: "0 0 2px", color: "#0f3d1f", fontSize: 34, fontWeight: 900, letterSpacing: 0.3 }}>
          Hibi
        </h2>
        <p style={{ margin: "0 0 14px", color: "#2e7d32", fontWeight: 600 }}>
          Day by day, you grow
        </p>
        <h1 style={{ margin: "0 0 8px", color: "#14532d", fontSize: 30, fontWeight: 800 }}>
          {mode === "login" ? "Welcome Back" : "Create Account"}
        </h1>
        <p style={{ margin: "0 0 16px", color: "#2e7d32", fontWeight: 500 }}>
          {mode === "login" ? "Log in to see your private tracker." : "Sign up to start your private tracker."}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          {mode === "signup" && (
            <>
              <label style={{ color: "#14532d", fontWeight: 600 }}>Your Name</label>
              <input
                type="text"
                placeholder="What should Hibi call you?"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1.5px solid #388e3c",
                  fontSize: 15,
                  color: "#0f172a",
                  background: "#ffffff",
                  WebkitTextFillColor: "#0f172a",
                }}
              />
            </>
          )}

          <label style={{ color: "#14532d", fontWeight: 600 }}>Email</label>
          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1.5px solid #388e3c",
              fontSize: 15,
              color: "#0f172a",
              background: "#ffffff",
              WebkitTextFillColor: "#0f172a",
            }}
          />

          <label style={{ color: "#14532d", fontWeight: 600, marginTop: 4 }}>Password</label>
          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1.5px solid #388e3c",
              fontSize: 15,
              color: "#0f172a",
              background: "#ffffff",
              WebkitTextFillColor: "#0f172a",
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 6,
              background: "#2e7d32",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              padding: "10px 14px",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Please wait..." : mode === "login" ? "Log In" : "Sign Up"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={loading}
          style={{
            marginTop: 10,
            width: "100%",
            background: "#ffffff",
            color: "#14532d",
            border: "1.5px solid #388e3c",
            borderRadius: 8,
            fontWeight: 700,
            padding: "10px 14px",
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setStatus("");
          }}
          style={{
            marginTop: 12,
            background: "transparent",
            border: "none",
            color: "#2e7d32",
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
          }}
        >
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>

        <p style={{ minHeight: 24, margin: "12px 0 0", color: "#14532d", fontWeight: 500 }}>{status}</p>
      </div>
    </main>
  );
}
