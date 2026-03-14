"use client";

import type { Stats } from "./useWebSocket";

interface Props {
  stats: Stats;
  isConnected: boolean;
  txCount: number;
}

function fmt(n: number) { return n.toLocaleString("en-US"); }
function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtUptime(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function StatsBar({ stats, isConnected, txCount }: Props) {
  return (
    <header style={{
      background: "linear-gradient(90deg, #0D0D1F 0%, #10101E 100%)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      padding: "0 20px",
      height: 58,
      gap: 0,
      flexShrink: 0,
      position: "relative",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32 }}>
        <div style={{
          width: 32, height: 32,
          background: "linear-gradient(135deg, #6366F1, #EF4444)",
          borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 12px rgba(99,102,241,0.4)",
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.95"/>
            <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2" fill="none" opacity="0.7"/>
            <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2" fill="none" opacity="0.85"/>
          </svg>
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: "0.01em", lineHeight: 1.1 }}>
            FraudNet<span style={{ color: "#EF4444" }}>·AI</span>
          </div>
          <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Fraud Detection
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 32, background: "var(--border)", marginRight: 28 }} />

      {/* Stats */}
      <div style={{ display: "flex", gap: 28, flex: 1 }}>
        <StatItem label="Transactions" value={fmt(stats.total_txns || txCount)} />
        <StatItem label="Active Accounts" value={fmt(stats.active_accounts)} />
        <StatItem
          label="Fraud Rings"
          value={String(stats.fraud_rings)}
          highlight={stats.fraud_rings > 0}
          color="var(--fraud)"
        />
        <StatItem
          label="Flagged Amount"
          value={fmtMoney(stats.flagged_amount)}
          highlight={stats.flagged_amount > 0}
          color="var(--suspicious)"
        />
        <StatItem label="Uptime" value={fmtUptime(stats.uptime)} />
      </div>

      {/* Connection pill */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        background: isConnected ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
        border: `1px solid ${isConnected ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
        borderRadius: 20,
        padding: "5px 12px",
      }}>
        <div style={{
          width: 7, height: 7, borderRadius: "50%",
          background: isConnected ? "#22C55E" : "#EF4444",
          boxShadow: `0 0 8px ${isConnected ? "#22C55E" : "#EF4444"}`,
          animation: isConnected ? "glow-pulse 2s ease-in-out infinite" : "none",
        }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: isConnected ? "#22C55E" : "#EF4444" }}>
          {isConnected ? "Live" : "Reconnecting"}
        </span>
      </div>
    </header>
  );
}

function StatItem({ label, value, highlight, color }: {
  label: string; value: string; highlight?: boolean; color?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontSize: 17,
        fontWeight: 700,
        color: highlight ? (color || "var(--fraud)") : "var(--text)",
        fontVariantNumeric: "tabular-nums",
        textShadow: highlight ? `0 0 12px ${color || "var(--fraud)"}60` : "none",
        transition: "color 0.3s",
      }}>
        {value}
      </div>
    </div>
  );
}
