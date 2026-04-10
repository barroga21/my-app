export default function SupportPage() {
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
          maxWidth: 780,
          margin: "0 auto",
          background: "rgba(255,255,255,0.82)",
          border: "1px solid rgba(46,125,50,0.12)",
          borderRadius: 20,
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow: "0 8px 30px rgba(46,125,50,0.10)",
          padding: "24px 22px",
        }}
      >
        <h1 className="hibi-brand-headline" style={{ margin: 0, fontSize: "clamp(28px, 5vw, 36px)", color: "#0d2a14" }}>
          Support Studio
        </h1>
        <p style={{ marginTop: 12, fontSize: 16, lineHeight: 1.55, color: "#1a4a22" }}>
          Need help with Hibi? Reach us at <a href="mailto:support@hibi.app">support@hibi.app</a>.
        </p>
        <p style={{ marginTop: 8, fontSize: 16, lineHeight: 1.55, color: "#1a4a22" }}>
          For account and privacy questions, include the email linked to your account so we can respond quickly.
        </p>
        <p style={{ marginTop: 20, fontSize: 14, color: "#48614d", fontWeight: 600 }}>
          Typical response window: 1-2 business days.
        </p>
      </section>
    </main>
  );
}
