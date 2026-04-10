type StatCardProps = {
  label: string;
  value: string | number;
  suffix?: string;
  nightMode: boolean;
  delay?: string;
};

export default function StatCard({ label, value, suffix = "", nightMode, delay = "0ms" }: StatCardProps) {
  return (
    <div
      style={{
        background: nightMode ? "rgba(255,255,255,0.04)" : "rgba(46,125,50,0.05)",
        border: `1px solid ${nightMode ? "rgba(255,255,255,0.07)" : "rgba(46,125,50,0.12)"}`,
        borderRadius: 16,
        padding: "14px 16px",
        animation: "hibiFadeIn var(--hibi-motion-normal) var(--hibi-ease-enter)",
        animationDelay: delay,
        animationFillMode: "both",
      }}
    >
      <p style={{ margin: "0 0 4px", color: nightMode ? "#6a7a6a" : "#4a7a50", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </p>
      <p style={{ margin: 0, color: nightMode ? "#e9ecef" : "#0d2a14", fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>
        {value}
        {suffix ? <span style={{ fontSize: 14, fontWeight: 500, color: nightMode ? "#6a7a6a" : "#4a7a50" }}>{suffix}</span> : null}
      </p>
    </div>
  );
}
