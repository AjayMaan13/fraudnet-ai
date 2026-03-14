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
      background: "linear-gradient(180deg, #0A0A1C 0%, #0D0D1F 100%)",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      alignItems: "center",
      padding: "0 24px",
      height: 60,
      flexShrink: 0,
      position: "relative",
      zIndex: 10,
    }}>
      {/* Subtle top glow line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: "linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.4) 30%, rgba(239,68,68,0.3) 70%, transparent 100%)",
      }} />

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 11, marginRight: 36, flexShrink: 0 }}>
        <div style={{
          width: 34, height: 34,
          background: "linear-gradient(135deg, #6366F1 0%, #EF4444 100%)",
          borderRadius: 9,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 16px rgba(99,102,241,0.35), 0 2px 8px rgba(0,0,0,0.4)",
          flexShrink: 0,
        }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.95"/>
            <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2" fill="none" opacity="0.65"/>
            <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2" fill="none" opacity="0.82"/>
          </svg>
        </div>
        <div>
          <div style={{
            fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em", lineHeight: 1.15,
            background: "linear-gradient(135deg, #E8EEFF 30%, #A0AABF 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            FraudNet<span style={{ WebkitTextFillColor: "#EF4444" }}>·AI</span>
          </div>
          <div style={{
            fontSize: 9, color: "var(--muted)",
            letterSpacing: "0.12em", textTransform: "uppercase",
            fontWeight: 500,
          }}>
            Real-Time Detection
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{
        width: 1, height: 28,
        background: "linear-gradient(180deg, transparent, var(--border2), transparent)",
        marginRight: 32, flexShrink: 0,
      }} />

      {/* Stats */}
      <div style={{ display: "flex", gap: 0, flex: 1, alignItems: "stretch" }}>
        <StatItem
          label="Transactions"
          value={fmt(stats.total_txns || txCount)}
          icon="⟳"
        />
        <Divider />
        <StatItem
          label="Active Accounts"
          value={fmt(stats.active_accounts)}
          icon="◈"
        />
        <Divider />
        <StatItem
          label="Fraud Rings"
          value={String(stats.fraud_rings)}
          highlight={stats.fraud_rings > 0}
          color="var(--fraud)"
          icon="⌖"
        />
        <Divider />
        <StatItem
          label="Flagged Amount"
          value={fmtMoney(stats.flagged_amount)}
          highlight={stats.flagged_amount > 0}
          color="var(--suspicious)"
          icon="⚑"
        />
        <Divider />
        <StatItem
          label="Uptime"
          value={fmtUptime(stats.uptime)}
          icon="◷"
        />
      </div>

      {/* Right badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: 24, flexShrink: 0 }}>
        {/* DB badge */}
        <div style={{
          fontSize: 9, fontWeight: 600, color: "#818CF8",
          background: "rgba(99,102,241,0.08)",
          border: "1px solid rgba(99,102,241,0.18)",
          borderRadius: 5, padding: "4px 9px",
          letterSpacing: "0.06em",
        }}>
          IBM Db2
        </div>

        {/* Connection pill */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          background: isConnected ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)",
          border: `1px solid ${isConnected ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)"}`,
          borderRadius: 20, padding: "5px 13px",
        }}>
          <div style={{ position: "relative", width: 7, height: 7 }}>
            {isConnected && (
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: "#22C55E", opacity: 0.4,
                animation: "ping 2s cubic-bezier(0,0,0.2,1) infinite",
              }} />
            )}
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: isConnected ? "#22C55E" : "#EF4444",
              boxShadow: `0 0 6px ${isConnected ? "#22C55E" : "#EF4444"}`,
            }} />
          </div>
          <span style={{
            fontSize: 11, fontWeight: 600,
            color: isConnected ? "#22C55E" : "#EF4444",
            letterSpacing: "0.03em",
          }}>
            {isConnected ? "Live" : "Reconnecting"}
          </span>
        </div>
      </div>
    </header>
  );
}

function Divider() {
  return (
    <div style={{
      width: 1, margin: "0 24px",
      background: "linear-gradient(180deg, transparent, var(--border), transparent)",
      alignSelf: "stretch",
      flexShrink: 0,
    }} />
  );
}

function StatItem({
  label, value, highlight, color, icon,
}: {
  label: string; value: string; highlight?: boolean; color?: string; icon?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
      <div style={{
        fontSize: 9, color: "var(--muted)",
        textTransform: "uppercase", letterSpacing: "0.1em",
        marginBottom: 3, fontWeight: 500,
        display: "flex", alignItems: "center", gap: 4,
      }}>
        {icon && <span style={{ fontSize: 9, opacity: 0.6 }}>{icon}</span>}
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 700,
        color: highlight ? (color || "var(--fraud)") : "var(--text)",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.02em",
        textShadow: highlight ? `0 0 16px ${color || "var(--fraud)"}50` : "none",
        transition: "color 0.4s, text-shadow 0.4s",
        lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}
