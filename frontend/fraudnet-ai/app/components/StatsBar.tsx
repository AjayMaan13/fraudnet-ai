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
      background: "var(--bg)",
      display: "flex",
      alignItems: "center",
      padding: "10px 14px",
      gap: 8,
      flexShrink: 0,
      zIndex: 10,
    }}>
      {/* Logo tile */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        background: "var(--card)",
        border: "1px solid var(--card-border)",
        boxShadow: "var(--card-shadow)",
        borderRadius: "var(--radius)",
        padding: "8px 16px",
        flexShrink: 0,
        height: 54,
      }}>
        <div style={{
          width: 28, height: 28,
          background: "linear-gradient(135deg, #6366F1 0%, #EF4444 100%)",
          borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 0 12px rgba(99,102,241,0.45)",
          flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.95"/>
            <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2" fill="none" opacity="0.65"/>
            <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2" fill="none" opacity="0.82"/>
          </svg>
        </div>
        <div>
          <div style={{
            fontWeight: 800, fontSize: 14, letterSpacing: "-0.01em", lineHeight: 1.2,
          }}>
            <span style={{ color: "#FFFFFF" }}>FraudNet</span>
            <span style={{ color: "#F87171" }}>·AI</span>
          </div>
          <div style={{ fontSize: 8, color: "var(--muted)", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>
            Real-Time Detection
          </div>
        </div>
      </div>

      {/* Stat tiles — equal width via flex */}
      <div style={{ display: "flex", gap: 8, flex: 1 }}>
        {[
          { label: "Transactions",    value: fmt(stats.total_txns || txCount), icon: "⟳" },
          { label: "Active Accounts", value: fmt(stats.active_accounts),       icon: "◈" },
          { label: "Fraud Rings",     value: String(stats.fraud_rings),        icon: "⌖", highlight: stats.fraud_rings > 0,        color: "#F87171" },
          { label: "Flagged Amount",  value: fmtMoney(stats.flagged_amount),   icon: "⚑", highlight: stats.flagged_amount > 0,     color: "#FB923C" },
          { label: "Uptime",          value: fmtUptime(stats.uptime),          icon: "◷" },
        ].map(({ label, value, icon, highlight, color }) => (
          <StatTile key={label} label={label} value={value} icon={icon} highlight={highlight} color={color} />
        ))}
      </div>

      {/* Right badges */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {/* watsonx.ai badge */}
        <div
          title="watsonx.ai — insufficient tokens on IBM Cloud trial"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--card)",
            border: "1px solid rgba(251,191,36,0.35)",
            borderRadius: "var(--radius-sm)", padding: "6px 12px",
            boxShadow: "var(--card-shadow)",
            height: 54,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" fill="#92400E" />
            <text x="5" y="21" fontSize="13" fontWeight="800" fill="white" fontFamily="Arial">AI</text>
          </svg>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#FBBF24", letterSpacing: "0.05em" }}>watsonx.ai</span>
            <span style={{ fontSize: 7, color: "#D97706", letterSpacing: "0.03em", fontWeight: 500 }}>insufficient tokens</span>
          </div>
        </div>

        {/* Db2 badge */}
        <div
          title="IBM Db2 connection removed — app runs on SQLite fallback"
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--card)",
            border: "1px solid rgba(248,113,113,0.35)",
            borderRadius: "var(--radius-sm)", padding: "6px 12px",
            boxShadow: "var(--card-shadow)",
            height: 54,
          }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F87171", boxShadow: "0 0 5px #F87171", flexShrink: 0 }} />
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#FCA5A5", letterSpacing: "0.05em" }}>IBM Db2</span>
            <span style={{ fontSize: 7, color: "#F87171", letterSpacing: "0.03em", fontWeight: 500 }}>connection removed</span>
          </div>
        </div>

        {/* Live / Reconnecting */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--card)",
          border: `1px solid ${isConnected ? "rgba(52,211,153,0.4)" : "rgba(248,113,113,0.4)"}`,
          borderRadius: "var(--radius-sm)", padding: "6px 16px",
          boxShadow: "var(--card-shadow)",
          height: 54,
        }}>
          <div style={{ position: "relative", width: 8, height: 8 }}>
            {isConnected && (
              <div style={{
                position: "absolute", inset: 0, borderRadius: "50%",
                background: "#34D399", opacity: 0.4,
                animation: "ping 2s cubic-bezier(0,0,0.2,1) infinite",
              }} />
            )}
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: isConnected ? "#34D399" : "#F87171",
              boxShadow: `0 0 8px ${isConnected ? "#34D399" : "#F87171"}`,
            }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: isConnected ? "#34D399" : "#F87171", letterSpacing: "0.02em" }}>
            {isConnected ? "Live" : "Reconnecting"}
          </span>
        </div>
      </div>
    </header>
  );
}

function StatTile({ label, value, highlight, color, icon }: {
  label: string; value: string; highlight?: boolean; color?: string; icon?: string;
}) {
  const c = highlight ? (color || "#F87171") : undefined;
  return (
    <div style={{
      flex: "1 1 0", minWidth: 0,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 4, padding: "8px 6px",
      height: 54,
      background: "var(--card)",
      border: `1px solid ${c ? c + "45" : "var(--card-border)"}`,
      borderRadius: "var(--radius)",
      boxShadow: c ? `0 2px 16px rgba(0,0,0,0.4), 0 0 18px ${c}30` : "var(--card-shadow)",
      transition: "border-color 0.4s, box-shadow 0.4s",
    }}>
      <div style={{
        fontSize: 9, color: "var(--muted)", textTransform: "uppercase",
        letterSpacing: "0.09em", fontWeight: 700,
        display: "flex", alignItems: "center", gap: 3,
        whiteSpace: "nowrap",
      }}>
        {icon && <span style={{ opacity: 0.7 }}>{icon}</span>}
        {label}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 800,
        color: c ?? "#FFFFFF",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "-0.02em",
        lineHeight: 1,
        textShadow: c ? `0 0 16px ${c}60` : "none",
        transition: "color 0.4s, text-shadow 0.4s",
      }}>
        {value}
      </div>
    </div>
  );
}
