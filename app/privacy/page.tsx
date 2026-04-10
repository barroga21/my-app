export default function PrivacyPage() {
  return (
    <main
      className="hibi-aurora-bg"
      style={{
        minHeight: "100vh",
        padding: "28px 20px",
        fontFamily: "var(--font-manrope), sans-serif",
        background: "linear-gradient(145deg, #f7fbf4 0%, #eef7e8 40%, #e0f0da 75%, #d4ead4 100%)",
      }}
    >
      <section
        style={{
          maxWidth: 860,
          margin: "0 auto",
          background: "rgba(255,255,255,0.82)",
          border: "1px solid rgba(46,125,50,0.12)",
          borderRadius: 20,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 8px 30px rgba(46,125,50,0.10)",
          padding: "24px 22px",
          color: "#1a4a22",
        }}
      >
        <h1 className="hibi-brand-headline" style={{ margin: 0, fontSize: "clamp(28px, 5vw, 36px)", color: "#0d2a14" }}>
          Privacy Studio
        </h1>
        <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.55 }}>
          Hibi stores your journal, habit, and calendar data in your account and synchronizes selected data with Supabase so your experience can continue across sessions.
        </p>
        <h2 className="hibi-brand-headline" style={{ marginTop: 24, fontSize: 24, color: "#0d2a14" }}>Data We Process</h2>
        <ul style={{ lineHeight: 1.7 }}>
          <li>Account data (email, profile name).</li>
          <li>User-generated content (journal entries, habits, calendar notes, media references).</li>
          <li>Operational diagnostics when enabled (error and performance events).</li>
        </ul>
        <h2 className="hibi-brand-headline" style={{ marginTop: 24, fontSize: 24, color: "#0d2a14" }}>How We Use Data</h2>
        <ul style={{ lineHeight: 1.7 }}>
          <li>Provide core app features and sync behavior.</li>
          <li>Detect and resolve reliability issues.</li>
          <li>Support account recovery and user support requests.</li>
        </ul>
        <h2 className="hibi-brand-headline" style={{ marginTop: 24, fontSize: 24, color: "#0d2a14" }}>Data Requests</h2>
        <p style={{ lineHeight: 1.6 }}>
          To request export or deletion assistance, contact <a href="mailto:privacy@hibi.app">privacy@hibi.app</a>.
        </p>
        <p style={{ marginTop: 20, fontSize: 14, color: "#48614d", fontWeight: 600 }}>Last updated: April 2026</p>
      </section>
    </main>
  );
}
