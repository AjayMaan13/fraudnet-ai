"use client";

import type { Stats } from "./useWebSocket";

interface Props {
  stats: Stats;
  isConnected: boolean;
  txCount: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

function fmtMoney(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtUptime(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function StatsBar({ stats, isConnected, txCount }: Props) {
  return (
    <header style={{
      background: "var(--panel)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      padding: "0 20px",
      height: 56,
      gap: 32,
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 8 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L2 7l10 5 10-5-10-5z" fill="var(--fraud)" opacity="0.9"/>
          <path d="M2 17l10 5 10-5" stroke="var(--fraud)" strokeWidth="1.5" fill="none" opacity="0.6"/>
          <path d="M2 12l10 5 10-5" stroke="var(--watch)" strokeWidth="1.5" fill="none" opacity="0.7"/>
        </svg>
        <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: "0.02em", color: "var(--text)" }}>
          FraudNet<span style={{ color: "var(--fraud)" }}>·AI</span>
        </span>
      </div>

      {/* Stats */}
      <StatItem label="Transactions" value={fmt(stats.total_txns || txCount)} />
      <StatItem label="Active Accounts" value={fmt(stats.active_accounts)} />
      <StatItem
        label="Fraud Rings"
        value={String(stats.fraud_rings)}
        highlight={stats.fraud_rings > 0}
      />
      <StatItem label="Flagged Amount" value={fmtMoney(stats.flagged_amount)} />
      <StatItem label="Uptime" value={fmtUptime(stats.uptime)} />

      {/* Connection indicator */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: isConnected ? "#22C55E" : "var(--fraud)",
          boxShadow: isConnected ? "0 0 6px #22C55E" : "0 0 6px var(--fraud)",
        }} />
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {isConnected ? "Live" : "Reconnecting…"}
        </span>
      </div>
    </header>
  );
}

function StatItem({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{
        fontSize: 16,
        fontWeight: 700,
        color: highlight ? "var(--fraud)" : "var(--text)",
        fontVariantNumeric: "tabular-nums",
      }}>
        {value}
      </span>
    </div>
  );
}
