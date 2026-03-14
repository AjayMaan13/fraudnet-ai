"use client";

import { useEffect, useRef, useState } from "react";
import type { Alert } from "./useWebSocket";

interface Explanation {
  fraud_type: string;
  confidence: string;
  evidence: string[];
  recommendations: string[];
  source?: "live" | "cached";
}

interface Props {
  alert: Alert | null;
}

const CONF_COLOR: Record<string, string> = {
  High:   "#EF4444",
  Medium: "#EAB308",
  Low:    "#3B82F6",
};

const CONF_BG: Record<string, string> = {
  High:   "rgba(239,68,68,0.08)",
  Medium: "rgba(234,179,8,0.08)",
  Low:    "rgba(59,130,246,0.08)",
};

export default function AIExplanation({ alert }: Props) {
  const [result, setResult]   = useState<Explanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!alert) { setResult(null); setError(null); return; }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true); setError(null); setResult(null);

    fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_ids: alert.accounts }),
      signal: abortRef.current.signal,
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setResult(d); setLoading(false); })
      .catch(e => { if (e.name !== "AbortError") { setError(e.message); setLoading(false); } });

    return () => abortRef.current?.abort();
  }, [alert?.id]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "11px 16px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "linear-gradient(90deg, rgba(99,102,241,0.06) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 22, height: 22,
            background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))",
            border: "1px solid rgba(99,102,241,0.35)",
            borderRadius: 5,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "#818CF8",
          }}>✦</div>
          <span style={{
            fontSize: 11, fontWeight: 700, color: "var(--text)",
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            AI Analysis
          </span>
        </div>
        <div style={{
          fontSize: 9, color: "#818CF8",
          background: "rgba(99,102,241,0.1)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 5, padding: "3px 8px",
          fontWeight: 600, letterSpacing: "0.05em",
        }}>
          IBM watsonx.ai
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>

        {/* Empty state */}
        {!alert && (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            height: "100%", gap: 10,
          }}>
            <div style={{
              width: 44, height: 44,
              border: "1px solid var(--border2)",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, opacity: 0.25,
            }}>✦</div>
            <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", lineHeight: 1.7, opacity: 0.75 }}>
              Select an alert to see<br/>AI-powered fraud analysis
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} className="fade-in">
            {/* Shimmer bars */}
            {[80, 60, 90, 50, 70, 40].map((w, i) => (
              <div key={i} className="skeleton" style={{
                height: 9, width: `${w}%`, borderRadius: 5,
              }} />
            ))}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              marginTop: 6, fontSize: 10, color: "var(--muted)",
            }}>
              <div style={{
                width: 14, height: 14,
                border: "2px solid transparent",
                borderTopColor: "#6366F1",
                borderRadius: "50%",
                animation: "spin-slow 0.8s linear infinite",
                flexShrink: 0,
              }} />
              Querying Granite 3 · 8B…
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{
            display: "flex", gap: 8, alignItems: "flex-start",
            background: "rgba(239,68,68,0.07)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 8, padding: "10px 12px",
            fontSize: 11, color: "#F87171", lineHeight: 1.5,
          }} className="fade-in">
            <span style={{ flexShrink: 0, fontSize: 13 }}>⚠</span>
            {error}
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }} className="fade-in">

            {/* Fraud type card */}
            <div style={{
              background: CONF_BG[result.confidence] || "rgba(239,68,68,0.08)",
              border: `1px solid ${CONF_COLOR[result.confidence] || "var(--fraud)"}30`,
              borderRadius: 8,
              padding: "10px 12px",
            }}>
              <div style={{
                fontSize: 12, fontWeight: 700,
                color: CONF_COLOR[result.confidence] || "var(--fraud)",
                lineHeight: 1.4, marginBottom: 7,
              }}>
                {result.fraud_type}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {/* Confidence dot */}
                <div style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: CONF_COLOR[result.confidence],
                  boxShadow: `0 0 6px ${CONF_COLOR[result.confidence]}`,
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: CONF_COLOR[result.confidence],
                }}>
                  {result.confidence} Confidence
                </span>
              </div>
            </div>

            {/* Evidence */}
            <Section title="Evidence" icon="▲" iconColor="var(--suspicious)">
              {result.evidence.map((e, i) => (
                <BulletItem key={i} text={e} color="var(--suspicious)" />
              ))}
            </Section>

            {/* Recommendations */}
            <Section title="Recommendations" icon="▸" iconColor="var(--green)">
              {result.recommendations.map((r, i) => (
                <BulletItem key={i} text={r} color="var(--green)" />
              ))}
            </Section>

            {/* Footer badges */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 4,
              borderTop: "1px solid var(--border)",
              marginTop: 2,
            }}>
              {/* Live / Cached */}
              <div style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 9, fontWeight: 700,
                color: result.source === "live" ? "#22C55E" : "#EAB308",
                background: result.source === "live" ? "rgba(34,197,94,0.08)" : "rgba(234,179,8,0.08)",
                border: `1px solid ${result.source === "live" ? "rgba(34,197,94,0.25)" : "rgba(234,179,8,0.25)"}`,
                borderRadius: 5, padding: "3px 8px",
              }}>
                <div style={{ position: "relative", width: 6, height: 6, flexShrink: 0 }}>
                  {result.source === "live" && (
                    <div style={{
                      position: "absolute", inset: 0, borderRadius: "50%",
                      background: "#22C55E", opacity: 0.4,
                      animation: "ping 2s ease-in-out infinite",
                    }} />
                  )}
                  <div style={{
                    position: "absolute", inset: 0, borderRadius: "50%",
                    background: result.source === "live" ? "#22C55E" : "#EAB308",
                  }} />
                </div>
                {result.source === "live" ? "Live · watsonx.ai" : "Cached response"}
              </div>

              <span style={{
                fontSize: 9, color: "var(--muted)",
                border: "1px solid var(--border)",
                borderRadius: 5, padding: "3px 8px",
                letterSpacing: "0.03em",
              }}>
                Granite 3 · 8B
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title, icon, iconColor, children,
}: {
  title: string; icon: string; iconColor: string; children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{
        fontSize: 9, fontWeight: 700, color: "var(--muted)",
        textTransform: "uppercase", letterSpacing: "0.12em",
        marginBottom: 8,
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{ color: iconColor, fontSize: 8 }}>{icon}</span>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function BulletItem({ text, color }: { text: string; color: string }) {
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
      <div style={{
        width: 4, height: 4, borderRadius: "50%",
        background: color, flexShrink: 0,
        marginTop: 5,
        boxShadow: `0 0 4px ${color}60`,
      }} />
      <span style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.6 }}>
        {text}
      </span>
    </div>
  );
}
