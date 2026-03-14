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

const CONF_COLOR: Record<string, string> = {
  High:   "#EF4444",
  Medium: "#EAB308",
  Low:    "#3B82F6",
};

export default function AIExplanation({ alert }: Props) {
  const [result, setResult]   = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!alert) { setResult(null); return; }
    setLoading(true); setError(null); setResult(null);

    fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_ids: alert.accounts }),
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setResult(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [alert?.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "linear-gradient(90deg, rgba(99,102,241,0.04), transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 16, height: 16,
            background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
            borderRadius: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8,
          }}>✦</div>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            AI Analysis
          </span>
        </div>
        <span style={{
          fontSize: 9, color: "#6366F1",
          background: "rgba(99,102,241,0.1)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 4, padding: "2px 6px",
          fontWeight: 600,
        }}>
          IBM watsonx.ai
        </span>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {!alert && (
          <div style={{
            paddingTop: 28, textAlign: "center",
            color: "var(--muted)", fontSize: 11,
          }}>
            <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.3 }}>✦</div>
            Select an alert to see<br/>AI-powered fraud analysis
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[75, 55, 90, 65, 80].map((w, i) => (
              <div key={i} style={{
                height: 10, width: `${w}%`,
                background: "linear-gradient(90deg, var(--border), var(--panel2), var(--border))",
                backgroundSize: "200% 100%",
                borderRadius: 4,
                animation: `glow-pulse ${1 + i * 0.15}s ease-in-out infinite`,
              }} />
            ))}
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ animation: "glow-pulse 1s infinite" }}>✦</span>
              Querying Granite 3 model…
            </div>
          </div>
        )}

        {error && (
          <div style={{
            color: "var(--fraud)", fontSize: 11,
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6, padding: "8px 10px",
          }}>
            ⚠ {error}
          </div>
        )}

        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            {/* Type + confidence */}
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: CONF_COLOR[result.confidence] || "var(--fraud)",
                background: `${CONF_COLOR[result.confidence] || "var(--fraud)"}10`,
                border: `1px solid ${CONF_COLOR[result.confidence] || "var(--fraud)"}30`,
                borderRadius: 6, padding: "5px 10px",
                lineHeight: 1.3,
              }}>
                {result.fraud_type}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  fontSize: 10, fontWeight: 700,
                  color: CONF_COLOR[result.confidence],
                  background: `${CONF_COLOR[result.confidence]}15`,
                  border: `1px solid ${CONF_COLOR[result.confidence]}35`,
                  borderRadius: 4, padding: "2px 8px",
                }}>
                  {result.confidence} Confidence
                </div>
              </div>
            </div>

            {/* Evidence */}
            <Section title="Evidence" icon="▲">
              {result.evidence.map((e, i) => (
                <BulletItem key={i} text={e} color="var(--suspicious)" />
              ))}
            </Section>

            {/* Recommendations */}
            <Section title="Recommendations" icon="▸">
              {result.recommendations.map((r, i) => (
                <BulletItem key={i} text={r} color="#22C55E" />
              ))}
            </Section>

            {/* Badge */}
            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 2 }}>
              <span style={{
                fontSize: 9, color: "var(--muted)",
                border: "1px solid var(--border)",
                borderRadius: 4, padding: "2px 7px",
              }}>
                Powered by IBM watsonx.ai · Granite 3 · 8B
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 700, color: "var(--muted)",
        textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 7, display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{ color: "var(--accent)" }}>{icon}</span>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{children}</div>
    </div>
  );
}

function BulletItem({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span style={{ color, flexShrink: 0, fontSize: 10, marginTop: 2 }}>●</span>
      <span style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.55, opacity: 0.9 }}>{text}</span>
    </div>
  );
}
