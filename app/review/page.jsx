"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useNightMode } from "@/lib/useNightMode";
import { useAuthBootstrap } from "@/lib/hooks/useAuthBootstrap";
import { computeWeeklyStats, computeMonthlyStats, computeMoodCorrelations } from "@/lib/repositories/reviewRepo";
import NavBar from "@/app/components/NavBar";
import BreathingBackground from "@/app/components/BreathingBackground";

const MOOD_META = {
  warm:    { label: "Warm",    color: "#F4C7A1", emoji: "🌅" },
  neutral: { label: "Neutral", color: "#E8DCC2", emoji: "🌿" },
  steady:  { label: "Steady",  color: "#C8D8C0", emoji: "🌳" },
  cool:    { label: "Cool",    color: "#BFCAD8", emoji: "🌊" },
  deep:    { label: "Deep",    color: "#8A94A6", emoji: "🌙" },
  gentle:  { label: "Gentle",  color: "#E8DCC2", emoji: "☁️" },
  quiet:   { label: "Quiet",   color: "#BFCAD8", emoji: "🤫" },
};

function MoodBar({ moodCounts, nightMode }) {
  const total = Object.values(moodCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return <p style={{ color: nightMode ? "#6a7a6a" : "#4a7a50", fontSize: 13 }}>No mood data yet this period.</p>;

  const sorted = Object.entries(moodCounts).sort((a, b) => b[1] - a[1]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map(([mood, count]) => {
        const meta = MOOD_META[mood] || { label: mood, color: "#ccc", emoji: "•" };
        const pct = Math.round((count / total) * 100);
        return (
          <div key={mood} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 24, textAlign: "center" }}>{meta.emoji}</span>
            <span style={{ width: 60, fontSize: 12, fontWeight: 600, color: nightMode ? "#b0bac8" : "#2e5c34" }}>{meta.label}</span>
            <div style={{ flex: 1, height: 10, borderRadius: 999, background: nightMode ? "rgba(255,255,255,0.06)" : "rgba(46,125,50,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: meta.color, transition: "width 0.5s ease" }} />
            </div>
            <span style={{ width: 36, textAlign: "right", fontSize: 12, fontWeight: 700, color: nightMode ? "#e9ecef" : "#0d2a14" }}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniHeatmap({ dailyRates, nightMode }) {
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
      {dailyRates.map(({ day, rate }) => {
        const intensity = rate > 80 ? 1 : rate > 50 ? 0.6 : rate > 0 ? 0.3 : 0.08;
        return (
          <div
            key={day}
            title={`Day ${day}: ${rate}%`}
            style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              background: nightMode
                ? `rgba(34,197,94,${intensity})`
                : `rgba(46,125,50,${intensity})`,
              border: `1px solid ${nightMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}`,
              fontSize: 8,
              display: "grid",
              placeItems: "center",
              color: rate > 50 ? "#fff" : (nightMode ? "#555" : "#aaa"),
              fontWeight: 700,
            }}
          >
            {day}
          </div>
        );
      })}
    </div>
  );
}

function CorrelationInsights({ correlations, nightMode }) {
  if (!correlations) return null;
  const { highHabitMoods, lowHabitMoods, dayOfWeekMoods } = correlations;

  const topHighMood = Object.entries(highHabitMoods).sort((a, b) => b[1] - a[1])[0];
  const topLowMood = Object.entries(lowHabitMoods).sort((a, b) => b[1] - a[1])[0];

  const insights = [];
  if (topHighMood) {
    const meta = MOOD_META[topHighMood[0]] || { label: topHighMood[0], emoji: "•" };
    insights.push(`${meta.emoji} You tend to feel **${meta.label}** on days you complete 50%+ of your habits.`);
  }
  if (topLowMood) {
    const meta = MOOD_META[topLowMood[0]] || { label: topLowMood[0], emoji: "•" };
    insights.push(`${meta.emoji} On lower-habit days, **${meta.label}** is your most common mood.`);
  }

  // Find which day of week has the most "deep" or "quiet" moods
  const quietDays = Object.entries(dayOfWeekMoods)
    .map(([dow, moods]) => ({ dow, quiet: (moods.deep || 0) + (moods.quiet || 0) + (moods.cool || 0) }))
    .sort((a, b) => b.quiet - a.quiet);
  if (quietDays[0] && quietDays[0].quiet > 0) {
    insights.push(`🗓 **${quietDays[0].dow}** tends to be your quietest day of the week.`);
  }

  if (insights.length === 0) return <p style={{ color: nightMode ? "#6a7a6a" : "#4a7a50", fontSize: 13 }}>Not enough data yet for mood-habit correlations.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {insights.map((text, i) => (
        <p key={i} style={{ margin: 0, color: nightMode ? "#c9d1da" : "#1a4a22", fontSize: 14, lineHeight: 1.55 }}>
          {text.split("**").map((part, j) =>
            j % 2 === 1 ? <strong key={j}>{part}</strong> : part
          )}
        </p>
      ))}
    </div>
  );
}

function HabitBreakdownChart({ habitBreakdown, daysInMonth, nightMode }) {
  const sorted = Object.entries(habitBreakdown).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map(([habit, count]) => {
        const pct = Math.round((count / daysInMonth) * 100);
        return (
          <div key={habit} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 100, fontSize: 12, fontWeight: 600, color: nightMode ? "#b0bac8" : "#2e5c34", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{habit}</span>
            <div style={{ flex: 1, height: 10, borderRadius: 999, background: nightMode ? "rgba(255,255,255,0.06)" : "rgba(46,125,50,0.08)", overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: nightMode ? "#22c55e" : "#2e7d32", transition: "width 0.5s ease" }} />
            </div>
            <span style={{ width: 50, textAlign: "right", fontSize: 12, fontWeight: 700, color: nightMode ? "#e9ecef" : "#0d2a14" }}>{count}/{daysInMonth}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const { authReady, userId } = useAuthBootstrap({ supabase, router, redirectTo: "/login" });
  const nightMode = useNightMode();
  const [tab, setTab] = useState("week");

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const weeklyStats = useMemo(() => {
    if (!userId) return null;
    return computeWeeklyStats(userId, now);
  }, [userId]);

  const monthlyStats = useMemo(() => {
    if (!userId) return null;
    return computeMonthlyStats(userId, viewYear, viewMonth);
  }, [userId, viewYear, viewMonth]);

  const correlations = useMemo(() => {
    if (!userId) return null;
    return computeMoodCorrelations(userId, viewYear, viewMonth);
  }, [userId, viewYear, viewMonth]);

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  }

  const cardStyle = {
    background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)",
    border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`,
    borderRadius: 16,
    padding: "18px 20px",
  };

  const labelStyle = {
    margin: "0 0 4px",
    color: nightMode ? "#6a7a6a" : "#4a7a50",
    fontWeight: 600,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  };

  const bigNumStyle = {
    margin: 0,
    fontWeight: 800,
    fontSize: 32,
    letterSpacing: -0.5,
    color: nightMode ? "#e9ecef" : "#0d2a14",
  };

  if (!authReady) {
    return (
      <main style={{ minHeight: "100vh", padding: "28px 24px", background: nightMode ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)" : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", paddingTop: 60 }}>
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 48, borderRadius: 999, maxWidth: 500, marginBottom: 16 }} />
          <div className={nightMode ? "hibi-skeleton" : "hibi-skeleton-light"} style={{ height: 200, borderRadius: 16 }} />
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "28px 24px 100px",
        position: "relative",
        overflow: "hidden",
        isolation: "isolate",
        background: nightMode
          ? "linear-gradient(145deg, #070b0d 0%, #0c1117 35%, #101820 70%, #0e1a14 100%)"
          : "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
        fontFamily: "var(--font-manrope), sans-serif",
        color: nightMode ? "#e9ecef" : "#0d2a14",
      }}
    >
      <BreathingBackground nightMode={nightMode} />
      <div style={{ maxWidth: 900, margin: "0 auto 28px" }}>
        <NavBar activePage="review" />
      </div>

      <section style={{ maxWidth: 820, margin: "0 auto" }}>
        <h1 className="hibi-brand-headline" style={{ margin: "0 0 6px", fontSize: "clamp(28px, 5.5vw, 44px)", fontWeight: 800, lineHeight: 1.06, letterSpacing: -0.5 }}>Review</h1>
        <p style={{ margin: "0 0 20px", color: nightMode ? "#8a9e8a" : "#2e6e34", fontSize: 15 }}>
          Reflect on your patterns, celebrate progress, and set intentions.
        </p>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {["week", "month", "insights"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "none",
                background: tab === t ? (nightMode ? "rgba(34,197,94,0.18)" : "rgba(26,110,54,0.14)") : "transparent",
                color: tab === t ? (nightMode ? "#4ade80" : "#1a6e36") : (nightMode ? "#6a7a6a" : "#4a7a50"),
                fontWeight: tab === t ? 700 : 500,
                fontSize: 14,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t === "week" ? "This Week" : t === "month" ? "Monthly" : "Mood Insights"}
            </button>
          ))}
        </div>

        {/* WEEKLY TAB */}
        {tab === "week" && weeklyStats && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              <div style={cardStyle}>
                <p style={labelStyle}>Journal Days</p>
                <p style={bigNumStyle}>{weeklyStats.journalDays}<span style={{ fontSize: 14, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>/7</span></p>
              </div>
              <div style={cardStyle}>
                <p style={labelStyle}>Habit Days</p>
                <p style={bigNumStyle}>{weeklyStats.habitDays}<span style={{ fontSize: 14, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>/7</span></p>
              </div>
              <div style={cardStyle}>
                <p style={labelStyle}>Words Written</p>
                <p style={bigNumStyle}>{weeklyStats.totalWords >= 1000 ? `${(weeklyStats.totalWords / 1000).toFixed(1)}k` : weeklyStats.totalWords}</p>
              </div>
            </div>

            <div style={cardStyle}>
              <p style={labelStyle}>Mood Distribution</p>
              <MoodBar moodCounts={weeklyStats.moodCounts} nightMode={nightMode} />
            </div>

            <div style={cardStyle}>
              <p style={labelStyle}>Daily Habit Completion</p>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {weeklyStats.dailyHabitCounts.map(({ date, done, total }) => {
                  const pct = total > 0 ? done / total : 0;
                  const dayLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
                  return (
                    <div key={date} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ height: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                        <div style={{
                          width: "70%",
                          height: `${Math.max(4, pct * 100)}%`,
                          borderRadius: 4,
                          background: nightMode ? `rgba(34,197,94,${0.3 + pct * 0.7})` : `rgba(46,125,50,${0.2 + pct * 0.8})`,
                          transition: "height 0.5s ease",
                        }} />
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: 10, fontWeight: 600, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>{dayLabel}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={cardStyle}>
              <p style={labelStyle}>Mood Timeline</p>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {weeklyStats.dailyMoods.map(({ date, mood }) => {
                  const meta = MOOD_META[mood] || { emoji: "·", label: "none", color: "#ccc" };
                  const dayLabel = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
                  return (
                    <div key={date} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 20, height: 28 }}>{mood ? meta.emoji : "·"}</div>
                      <p style={{ margin: "2px 0 0", fontSize: 10, fontWeight: 600, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>{dayLabel}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* MONTHLY TAB */}
        {tab === "month" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
              <button onClick={prevMonth} style={{ border: "none", background: "transparent", color: nightMode ? "#b0bac8" : "#2e5c34", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>←</button>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{monthLabel}</span>
              <button onClick={nextMonth} style={{ border: "none", background: "transparent", color: nightMode ? "#b0bac8" : "#2e5c34", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>→</button>
            </div>

            {monthlyStats && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
                  <div style={cardStyle}>
                    <p style={labelStyle}>Active Days</p>
                    <p style={bigNumStyle}>{monthlyStats.habitActiveDays}<span style={{ fontSize: 14, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>/{monthlyStats.daysInMonth}</span></p>
                  </div>
                  <div style={cardStyle}>
                    <p style={labelStyle}>Journal Entries</p>
                    <p style={bigNumStyle}>{monthlyStats.journalEntries}</p>
                  </div>
                  <div style={cardStyle}>
                    <p style={labelStyle}>Words</p>
                    <p style={bigNumStyle}>{monthlyStats.totalWords >= 1000 ? `${(monthlyStats.totalWords / 1000).toFixed(1)}k` : monthlyStats.totalWords}</p>
                  </div>
                  <div style={cardStyle}>
                    <p style={labelStyle}>Completion</p>
                    <p style={bigNumStyle}>{monthlyStats.completionRate}<span style={{ fontSize: 14, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>%</span></p>
                  </div>
                  <div style={cardStyle}>
                    <p style={labelStyle}>Best Streak</p>
                    <p style={bigNumStyle}>{monthlyStats.longestStreak}<span style={{ fontSize: 14, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}> days</span></p>
                  </div>
                </div>

                <div style={cardStyle}>
                  <p style={labelStyle}>Daily Completion Heatmap</p>
                  <div style={{ marginTop: 8 }}>
                    <MiniHeatmap dailyRates={monthlyStats.dailyCompletionRates} nightMode={nightMode} />
                  </div>
                </div>

                <div style={cardStyle}>
                  <p style={labelStyle}>Habit Breakdown</p>
                  <div style={{ marginTop: 8 }}>
                    <HabitBreakdownChart habitBreakdown={monthlyStats.habitBreakdown} daysInMonth={monthlyStats.daysInMonth} nightMode={nightMode} />
                  </div>
                </div>

                <div style={cardStyle}>
                  <p style={labelStyle}>Mood Distribution</p>
                  <MoodBar moodCounts={monthlyStats.moodCounts} nightMode={nightMode} />
                </div>

                {Object.keys(monthlyStats.tagCounts).length > 0 && (
                  <div style={cardStyle}>
                    <p style={labelStyle}>Top Tags</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                      {Object.entries(monthlyStats.tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag, count]) => (
                        <span key={tag} style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: nightMode ? "rgba(34,197,94,0.12)" : "rgba(46,125,50,0.10)",
                          color: nightMode ? "#86efac" : "#14532d",
                          fontSize: 12,
                          fontWeight: 600,
                        }}>
                          #{tag} ({count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* INSIGHTS TAB */}
        {tab === "insights" && (
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
              <button onClick={prevMonth} style={{ border: "none", background: "transparent", color: nightMode ? "#b0bac8" : "#2e5c34", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>←</button>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{monthLabel}</span>
              <button onClick={nextMonth} style={{ border: "none", background: "transparent", color: nightMode ? "#b0bac8" : "#2e5c34", fontSize: 18, cursor: "pointer", padding: "4px 8px" }}>→</button>
            </div>

            <div style={cardStyle}>
              <p style={labelStyle}>🧠 Mood–Habit Correlations</p>
              <div style={{ marginTop: 8 }}>
                <CorrelationInsights correlations={correlations} nightMode={nightMode} />
              </div>
            </div>

            {monthlyStats && Object.keys(monthlyStats.moodCounts).length > 0 && (
              <div style={cardStyle}>
                <p style={labelStyle}>Monthly Mood Breakdown</p>
                <MoodBar moodCounts={monthlyStats.moodCounts} nightMode={nightMode} />
              </div>
            )}

            {correlations && Object.keys(correlations.dayOfWeekMoods).length > 0 && (
              <div style={cardStyle}>
                <p style={labelStyle}>Mood by Day of Week</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8, marginTop: 8 }}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dow) => {
                    const moods = correlations.dayOfWeekMoods[dow] || {};
                    const topMood = Object.entries(moods).sort((a, b) => b[1] - a[1])[0];
                    const meta = topMood ? (MOOD_META[topMood[0]] || { emoji: "·", label: topMood[0] }) : null;
                    return (
                      <div key={dow} style={{ textAlign: "center", padding: "8px 4px" }}>
                        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 600, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>{dow}</p>
                        <p style={{ margin: 0, fontSize: 22 }}>{meta ? meta.emoji : "·"}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 10, color: nightMode ? "#8a9e8a" : "#4a7a50" }}>{meta ? meta.label : "—"}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
