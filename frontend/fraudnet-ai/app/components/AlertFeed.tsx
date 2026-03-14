"use client";

import type { Alert } from "./useWebSocket";

interface Props {
  alerts: Alert[];
  selectedId: string | null;
  onSelect: (alert: Alert) => void;
}

const TYPE_META: Record<string, { label: string; color: string; icon: string; bg: string }> = {
  circular_flow:  { label: "Circular Ring",  color: "#EF4444", icon: "⟳", bg: "rgba(239,68,68,0.06)"  },
  burst_transfer: { label: "Burst Transfer", color: "#F97316", icon: "⚡", bg: "rgba(249,115,22,0.06)" },
  fanout:         { label: "Structuring",    color: "#EAB308", icon: "⤢", bg: "rgba(234,179,8,0.06)"  },
};

function timeAgo(ts: string) {
  if (!ts) return "just now";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function fmtMoney(n: number) {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${(n / 1_000).toFixed(1)}K`;
}

export default function AlertFeed({ alerts, selectedId, onSelect }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "11px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        background: "linear-gradient(90deg, rgba(239,68,68,0.04) 0%, transparent 100%)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          {/* Icon */}
          <div style={{
            width: 22, height: 22,
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: 5,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11,
          }}>⚠</div>
          <span style={{
            fontSize: 11, fontWeight: 700, color: "var(--text)",
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            Fraud Alerts
          </span>
          {alerts.length > 0 && (
            <span style={{
              background: "var(--fraud)", color: "#fff",
              borderRadius: 10, fontSize: 10, fontWeight: 700,
              padding: "1px 7px",
              boxShadow: "0 0 10px rgba(239,68,68,0.45)",
              lineHeight: "16px",
            }}>
              {alerts.length}
            </span>
          )}
        </div>
        {alerts.length > 0 && (
          <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.05em" }}>
            Click to analyze ›
          </span>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        {alerts.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: "100%", color: "var(--muted)", textAlign: "center",
            gap: 8,
          }}>
            <div style={{
              width: 40, height: 40,
              border: "1px solid var(--border2)",
              borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, opacity: 0.35,
            }}>🔍</div>
            <span style={{ fontSize: 11, lineHeight: 1.6, opacity: 0.6 }}>
              No alerts yet<br/>Monitoring live…
            </span>
          </div>
        ) : alerts.map((alert) => {
          const meta = TYPE_META[alert.type] || { label: alert.type, color: "#64748B", icon: "!", bg: "rgba(100,116,139,0.06)" };
          const selected = alert.id === selectedId;
          const risk = Math.round(alert.risk_score || 0);

          return (
            <div
              key={alert.id}
              className="alert-new interactive"
              onClick={() => onSelect(alert)}
              style={{
                background: selected ? meta.bg : "rgba(255,255,255,0.015)",
                border: `1px solid ${selected ? meta.color + "55" : "var(--border)"}`,
                borderRadius: 9,
                padding: "10px 12px",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Left accent bar */}
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0, width: 3,
                background: selected
                  ? meta.color
                  : `linear-gradient(180deg, ${meta.color}80, ${meta.color}30)`,
                borderRadius: "9px 0 0 9px",
                transition: "background 0.2s",
              }} />

              {/* Top row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, paddingLeft: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    width: 22, height: 22,
                    background: `${meta.color}15`,
                    border: `1px solid ${meta.color}30`,
                    borderRadius: 5,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, flexShrink: 0,
                  }}>{meta.icon}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: meta.color,
                    letterSpacing: "0.04em",
                  }}>
                    {meta.label}
                  </span>
                </div>
                <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.03em" }}>
                  {timeAgo(alert.timestamp)}
                </span>
              </div>

              {/* Accounts */}
              <div style={{
                fontSize: 10, color: "var(--muted)",
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                marginBottom: 8, paddingLeft: 2,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                letterSpacing: "0.02em",
              }}>
                {(alert.accounts || []).slice(0, 3).map(a => a.slice(0, 8)).join(" → ")}
                {(alert.accounts?.length || 0) > 3 && (
                  <span style={{ color: "var(--muted)", opacity: 0.6 }}>
                    {` +${alert.accounts.length - 3}`}
                  </span>
                )}
              </div>

              {/* Bottom row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 2 }}>
                <span style={{
                  fontSize: 14, fontWeight: 700, color: "var(--text)",
                  letterSpacing: "-0.01em",
                  textShadow: `0 0 10px ${meta.color}30`,
                }}>
                  {fmtMoney(alert.total_amount)}
                </span>

                {/* Risk bar */}
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{
                    width: 44, height: 3, background: "var(--border2)",
                    borderRadius: 2, overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      width: `${risk}%`,
                      background: `linear-gradient(90deg, ${meta.color}80, ${meta.color})`,
                      boxShadow: `0 0 4px ${meta.color}60`,
                    }} />
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: meta.color,
                    minWidth: 24, textAlign: "right",
                  }}>
                    {risk}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
