"use client";

import type { Alert } from "./useWebSocket";

interface Props {
  alerts: Alert[];
  selectedId: string | null;
  onSelect: (alert: Alert) => void;
}

const TYPE_LABELS: Record<string, string> = {
  circular_flow:  "Circular Ring",
  burst_transfer: "Burst Transfer",
  fanout:         "Structuring",
};

const TYPE_COLORS: Record<string, string> = {
  circular_flow:  "var(--fraud)",
  burst_transfer: "var(--suspicious)",
  fanout:         "var(--watch)",
};

function timeAgo(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function fmtMoney(n: number) {
  if (!n) return "$0";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${(n / 1_000).toFixed(1)}K`;
}

export default function AlertFeed({ alerts, selectedId, onSelect }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Fraud Alerts
        </span>
        {alerts.length > 0 && (
          <span style={{
            background: "var(--fraud)",
            color: "#fff",
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 700,
            padding: "1px 6px",
          }}>
            {alerts.length}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {alerts.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
            No alerts yet — monitoring live…
          </div>
        ) : (
          alerts.map(alert => {
            const color = TYPE_COLORS[alert.type] || "var(--watch)";
            const label = TYPE_LABELS[alert.type] || alert.type;
            const selected = alert.id === selectedId;
            return (
              <div
                key={alert.id}
                onClick={() => onSelect(alert)}
                style={{
                  background: selected ? "rgba(239,68,68,0.08)" : "transparent",
                  border: `1px solid ${selected ? "var(--fraud)" : "var(--border)"}`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  marginBottom: 6,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
              >
                {/* Top row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color,
                    background: `${color}20`,
                    border: `1px solid ${color}40`,
                    borderRadius: 4,
                    padding: "1px 6px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>
                    {alert.timestamp ? timeAgo(alert.timestamp) : "just now"}
                  </span>
                </div>

                {/* Accounts */}
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, fontFamily: "monospace" }}>
                  {(alert.accounts || []).slice(0, 3).map(a => a.slice(0, 8)).join(" → ")}
                  {(alert.accounts?.length || 0) > 3 && ` +${alert.accounts.length - 3}`}
                </div>

                {/* Bottom row */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>
                    {fmtMoney(alert.total_amount)}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color,
                  }}>
                    Risk {Math.round(alert.risk_score || 0)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
