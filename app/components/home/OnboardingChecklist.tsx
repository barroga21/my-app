type Step = {
  done: boolean;
  label: string;
};

type OnboardingChecklistProps = {
  steps: Step[];
  nightMode: boolean;
};

export default function OnboardingChecklist({ steps, nightMode }: OnboardingChecklistProps) {
  const doneCount = steps.filter((step) => step.done).length;
  if (doneCount >= steps.length) return null;

  return (
    <div style={{ background: nightMode ? "rgba(34,197,94,0.08)" : "rgba(26,110,54,0.06)", border: `1px solid ${nightMode ? "rgba(34,197,94,0.20)" : "rgba(26,110,54,0.20)"}`, borderRadius: 16, padding: "14px 16px" }}>
      <p style={{ margin: "0 0 8px", color: nightMode ? "#86efac" : "#166534", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.8 }}>
        Getting Started {doneCount}/{steps.length}
      </p>
      <div style={{ display: "grid", gap: 6 }}>
        {steps.map((step) => (
          <div key={step.label} style={{ fontSize: 13, color: step.done ? (nightMode ? "#86efac" : "#166534") : (nightMode ? "#c9d1da" : "#1a4a22"), fontWeight: step.done ? 700 : 500 }}>
            {step.done ? "✓" : "○"} {step.label}
          </div>
        ))}
      </div>
    </div>
  );
}
