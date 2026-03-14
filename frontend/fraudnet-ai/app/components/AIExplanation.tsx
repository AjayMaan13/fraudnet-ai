"use client";

import { useEffect, useState } from "react";
import type { Alert } from "./useWebSocket";

interface Explanation {
  fraud_type: string;
  confidence: string;
  evidence: string[];
  recommendations: string[];
}

interface Props {
  alert: Alert | null;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  High:   "var(--fraud)",
  Medium: "var(--watch)",
  Low:    "var(--clean)",
};

export default function AIExplanation({ alert }: Props) {
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!alert) {
      setExplanation(null);
      return;
    }

    setLoading(true);
    setError(null);
    setExplanation(null);

    fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_ids: alert.accounts }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => { setExplanation(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [alert?.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          AI Analysis
        </span>
        <span style={{ fontSize: 10, color: "var(--muted)" }}>IBM watsonx.ai</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {!alert && (
          <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", paddingTop: 24 }}>
            Select an alert to see AI analysis
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[80, 60, 90, 70].map((w, i) => (
              <div key={i} style={{
                height: 12,
                width: `${w}%`,
                background: "var(--border)",
                borderRadius: 4,
                animation: "pulse-fraud 1.2s ease-in-out infinite",
              }} />
            ))}
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Querying Granite model…</div>
          </div>
        )}

        {error && (
          <div style={{ color: "var(--fraud)", fontSize: 12 }}>Error: {error}</div>
        )}

        {explanation && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Fraud type + confidence */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: "var(--fraud)",
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 5,
                padding: "3px 8px",
              }}>
                {explanation.fraud_type}
              </span>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: CONFIDENCE_COLOR[explanation.confidence] || "var(--text)",
                background: `${CONFIDENCE_COLOR[explanation.confidence] || "var(--text)"}18`,
                border: `1px solid ${CONFIDENCE_COLOR[explanation.confidence] || "var(--border)"}40`,
                borderRadius: 5,
                padding: "3px 8px",
              }}>
                {explanation.confidence} Confidence
              </span>
            </div>

            {/* Evidence */}
            <Section title="Evidence">
              {explanation.evidence.map((e, i) => (
                <BulletItem key={i} text={e} color="var(--suspicious)" />
              ))}
            </Section>

            {/* Recommendations */}
            <Section title="Recommendations">
              {explanation.recommendations.map((r, i) => (
                <BulletItem key={i} text={r} color="var(--clean)" />
              ))}
            </Section>

            {/* Powered by badge */}
            <div style={{ marginTop: 4, display: "flex", justifyContent: "flex-end" }}>
              <span style={{
                fontSize: 9,
                color: "var(--muted)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "2px 6px",
              }}>
                Powered by IBM watsonx.ai · Granite 3
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 10,
        fontWeight: 600,
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 6,
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {children}
      </div>
    </div>
  );
}

function BulletItem({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ color, flexShrink: 0, fontSize: 11, marginTop: 1 }}>▸</span>
      <span style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}
