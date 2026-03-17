"use client";

import { useEffect, useRef, useState } from "react";
import type { Alert } from "./useWebSocket";
import { HTTP_BASE } from "../lib/api";

interface Explanation {
  fraud_type: string;
  confidence: string;
  severity: string;
  pattern_summary: string;
  evidence: string[];
  risk_indicators: string[];
  regulatory_flags: string[];
  recommendations: string[];
  investigation_priority: string;
  source?: "live" | "cached";
}

interface Props {
  alert: Alert | null;
}

const SEV_COLOR: Record<string, string> = {
  Critical: "#FF2222",
  High:     "#EF4444",
  Medium:   "#EAB308",
  Low:      "#3B82F6",
};

const PRIORITY_COLOR: Record<string, string> = {
  Immediate: "#FF2222",
  Urgent:    "#F97316",
  Standard:  "#3B82F6",
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

    fetch(`${HTTP_BASE}/analyze`, {
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
        padding: "13px 16px",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: "transparent",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 22, height: 22,
            background: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(139,92,246,0.25))",
            border: "1px solid rgba(99,102,241,0.35)",
            borderRadius: 5,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: "#818CF8",
          }}>✦</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Fraud Intelligence
          </span>
        </div>
        <div
          title="watsonx.ai link broken — insufficient tokens on IBM Cloud trial. Using cached responses."
          style={{
            display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.3,
            fontSize: 9,
            background: "rgba(234,179,8,0.07)", border: "1px solid rgba(234,179,8,0.28)",
            borderRadius: 5, padding: "3px 8px", fontWeight: 600, letterSpacing: "0.05em",
          }}
        >
          <span style={{ color: "#EAB308" }}>IBM watsonx.ai</span>
          <span style={{ fontSize: 7, color: "#92400E", fontWeight: 500 }}>link broken · insufficient tokens</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Empty state */}
        {!alert && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
            <div style={{ width: 44, height: 44, border: "1px solid var(--border2)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, opacity: 0.25 }}>✦</div>
            <div style={{ fontSize: 11, color: "var(--text2)", textAlign: "center", lineHeight: 1.7 }}>
              Select an alert to generate<br/>a full fraud intelligence report
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }} className="fade-in">
            {[85, 60, 75, 45, 90, 55, 70].map((w, i) => (
              <div key={i} className="skeleton" style={{ height: 8, width: `${w}%`, borderRadius: 4 }} />
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 10, color: "var(--muted)" }}>
              <div style={{ width: 13, height: 13, border: "2px solid transparent", borderTopColor: "#6366F1", borderRadius: "50%", animation: "spin-slow 0.8s linear infinite", flexShrink: 0 }} />
              <span style={{ color: "var(--text2)" }}>Generating fraud intelligence report…</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 12px", fontSize: 11, color: "#F87171", lineHeight: 1.5 }} className="fade-in">
            <span style={{ flexShrink: 0 }}>⚠</span>{error}
          </div>
        )}

        {/* Full report */}
        {result && !loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }} className="fade-in">

            {/* Classification row */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {/* Severity */}
              <div style={{
                flex: 1, minWidth: 80,
                background: `${SEV_COLOR[result.severity] || "#EF4444"}12`,
                border: `1px solid ${SEV_COLOR[result.severity] || "#EF4444"}35`,
                borderRadius: 10, padding: "8px 12px",
              }}>
                <div style={{ fontSize: 8, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Severity</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: SEV_COLOR[result.severity] || "#EF4444" }}>
                  {result.severity}
                </div>
              </div>
              {/* Confidence */}
              <div style={{
                flex: 1, minWidth: 80,
                background: `${SEV_COLOR[result.confidence] || "#EF4444"}12`,
                border: `1px solid ${SEV_COLOR[result.confidence] || "#EF4444"}35`,
                borderRadius: 10, padding: "8px 12px",
              }}>
                <div style={{ fontSize: 8, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Confidence</div>
                <div style={{ fontSize: 12, fontWeight: 800, color: SEV_COLOR[result.confidence] || "#EF4444" }}>
                  {result.confidence}
                </div>
              </div>
              {/* Priority */}
              <div style={{
                flex: 1, minWidth: 80,
                background: `${PRIORITY_COLOR[result.investigation_priority] || "#3B82F6"}12`,
                border: `1px solid ${PRIORITY_COLOR[result.investigation_priority] || "#3B82F6"}35`,
                borderRadius: 10, padding: "8px 12px",
              }}>
                <div style={{ fontSize: 8, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>Priority</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: PRIORITY_COLOR[result.investigation_priority] || "#3B82F6" }}>
                  {result.investigation_priority}
                </div>
              </div>
            </div>

            {/* Fraud type */}
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid var(--border2)",
              borderRadius: 7, padding: "8px 11px",
            }}>
              <div style={{ fontSize: 8, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Fraud Classification</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>{result.fraud_type}</div>
            </div>

            {/* Pattern summary */}
            {result.pattern_summary && (
              <div style={{
                background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.15)",
                borderRadius: 7, padding: "8px 11px",
              }}>
                <div style={{ fontSize: 8, color: "#818CF8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Pattern Analysis</div>
                <div style={{ fontSize: 11, color: "#E0E8FF", lineHeight: 1.65 }}>{result.pattern_summary}</div>
              </div>
            )}

            {/* Evidence */}
            <Section title="Evidence" color="var(--suspicious)">
              {result.evidence.map((e, i) => <BulletItem key={i} text={e} color="var(--suspicious)" />)}
            </Section>

            {/* Risk indicators */}
            {result.risk_indicators?.length > 0 && (
              <Section title="Risk Indicators" color="#EF4444">
                {result.risk_indicators.map((r, i) => <BulletItem key={i} text={r} color="#EF4444" />)}
              </Section>
            )}

            {/* Regulatory flags */}
            {result.regulatory_flags?.length > 0 && (
              <div>
                <div style={{ fontSize: 8, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
                  Regulatory Flags
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {result.regulatory_flags.map((f, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "flex-start", gap: 7,
                      background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
                      borderRadius: 5, padding: "5px 9px", fontSize: 10, color: "#FCA5A5", lineHeight: 1.5,
                    }}>
                      <span style={{ flexShrink: 0, color: "#EF4444", marginTop: 1 }}>⚑</span>
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            <Section title="Recommended Actions" color="var(--green)">
              {result.recommendations.map((r, i) => <BulletItem key={i} text={r} color="var(--green)" index={i + 1} />)}
            </Section>

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6, borderTop: "1px solid var(--border)", marginTop: 2 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 700,
                color: result.source === "live" ? "#22C55E" : "#EAB308",
                background: result.source === "live" ? "rgba(34,197,94,0.08)" : "rgba(234,179,8,0.08)",
                border: `1px solid ${result.source === "live" ? "rgba(34,197,94,0.25)" : "rgba(234,179,8,0.25)"}`,
                borderRadius: 5, padding: "3px 8px",
              }}>
                <div style={{ position: "relative", width: 6, height: 6, flexShrink: 0 }}>
                  {result.source === "live" && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22C55E", opacity: 0.4, animation: "ping 2s ease-in-out infinite" }} />}
                  <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: result.source === "live" ? "#22C55E" : "#EAB308" }} />
                </div>
                {result.source === "live" ? "Live · watsonx.ai" : "Cached response"}
              </div>
              <span style={{ fontSize: 9, color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 5, padding: "3px 8px" }}>
                Granite 3 · 8B
              </span>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 8, fontWeight: 700, color: "var(--text2)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{children}</div>
    </div>
  );
}

function BulletItem({ text, color, index }: { text: string; color: string; index?: number }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      {index !== undefined ? (
        <div style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          background: `${color}18`, border: `1px solid ${color}35`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: 700, color, marginTop: 1,
        }}>{index}</div>
      ) : (
        <div style={{ width: 4, height: 4, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5, boxShadow: `0 0 4px ${color}60` }} />
      )}
      <span style={{ fontSize: 11, color: "#E0E8FF", lineHeight: 1.6 }}>{text}</span>
    </div>
  );
}
