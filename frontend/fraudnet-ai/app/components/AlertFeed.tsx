"use client";

import type { Alert } from "./useWebSocket";

interface Props {
  alerts: Alert[];
  selectedId: string | null;
  onSelect: (alert: Alert) => void;
}

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  circular_flow:  { label: "Circular Ring",   color: "#EF4444", icon: "⟳" },
  burst_transfer: { label: "Burst Transfer",  color: "#F97316", icon: "⚡" },
  fanout:         { label: "Structuring",     color: "#EAB308", icon: "⤢" },
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
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        background: "linear-gradient(90deg, rgba(239,68,68,0.04), transparent)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: "var(--text)",
            textTransform: "uppercase", letterSpacing: "0.1em",
          }}>
            Fraud Alerts
          </span>
          {alerts.length > 0 && (
            <span style={{
              background: "var(--fraud)", color: "#fff",
              borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 7px",
              boxShadow: "0 0 8px rgba(239,68,68,0.5)",
            }}>
              {alerts.length}
            </span>
          )}
        </div>
        {alerts.length > 0 && (
          <span style={{ fontSize: 9, color: "var(--muted)" }}>Click to analyze</span>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {alerts.length === 0 ? (
          <div style={{
            padding: "32px 20px", textAlign: "center",
            color: "var(--muted)", fontSize: 12,
          }}>
            <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>🔍</div>
            No alerts yet — monitoring live…
          </div>
        ) : alerts.map((alert, idx) => {
          const meta = TYPE_META[alert.type] || { label: alert.type, color: "#64748B", icon: "!" };
          const selected = alert.id === selectedId;
          return (
            <div
              key={alert.id}
              className="alert-new"
              onClick={() => onSelect(alert)}
              style={{
                background: selected
                  ? `linear-gradient(135deg, ${meta.color}15, ${meta.color}08)`
                  : "rgba(255,255,255,0.02)",
                border: `1px solid ${selected ? meta.color + "60" : "var(--border)"}`,
                borderLeft: `3px solid ${selected ? meta.color : meta.color + "40"}`,
                borderRadius: 7,
                padding: "9px 10px",
                marginBottom: 5,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {/* Top row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ fontSize: 12 }}>{meta.icon}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: meta.color,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                  }}>
                    {meta.label}
                  </span>
                </div>
                <span style={{ fontSize: 9, color: "var(--muted)" }}>
                  {timeAgo(alert.timestamp)}
                </span>
              </div>

              {/* Accounts */}
              <div style={{
                fontSize: 10, color: "var(--muted)",
                fontFamily: "monospace", marginBottom: 6,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {(alert.accounts || []).slice(0, 4).map(a => a.slice(0, 8)).join(" → ")}
                {(alert.accounts?.length || 0) > 4 && ` +${alert.accounts.length - 4} more`}
              </div>

              {/* Bottom row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{
                  fontSize: 13, fontWeight: 700, color: "var(--text)",
                  textShadow: `0 0 8px ${meta.color}40`,
                }}>
                  {fmtMoney(alert.total_amount)}
                </span>
                <div style={{
                  fontSize: 10, fontWeight: 700, color: meta.color,
                  background: `${meta.color}15`,
                  border: `1px solid ${meta.color}30`,
                  borderRadius: 4, padding: "1px 6px",
                }}>
                  Risk {Math.round(alert.risk_score || 0)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
