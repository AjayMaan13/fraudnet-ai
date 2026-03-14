"use client";

import { useCallback, useState } from "react";

interface DemoConfig {
  n_accounts:     number;
  n_transactions: number;
  n_circular:     number;
  n_structuring:  number;
  n_burst:        number;
}

interface Props {
  onClose:  () => void;
  onLaunch: (cfg: DemoConfig) => Promise<void>;
}

const DEFAULTS: DemoConfig = {
  n_accounts:     100,
  n_transactions: 500,
  n_circular:     3,
  n_structuring:  2,
  n_burst:        2,
};

function Slider({
  label, hint, value, min, max, step = 1, color,
  onChange,
}: {
  label: string; hint: string; value: number;
  min: number; max: number; step?: number;
  color: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, alignItems: "baseline" }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#E8EEFF" }}>{label}</span>
          <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 8 }}>{hint}</span>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700, color,
          background: `${color}18`,
          border: `1px solid ${color}30`,
          borderRadius: 5, padding: "1px 8px",
          fontVariantNumeric: "tabular-nums",
        }}>
          {value.toLocaleString()}
        </span>
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${pct}%`, borderRadius: 3,
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          transition: "width 0.1s",
        }} />
        <input
          type="range"
          min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%",
            opacity: 0, cursor: "pointer", margin: 0,
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 9, color: "var(--muted)", opacity: 0.5 }}>{min}</span>
        <span style={{ fontSize: 9, color: "var(--muted)", opacity: 0.5 }}>{max}</span>
      </div>
    </div>
  );
}

function PresetBtn({
  label, cfg, active, onClick,
}: { label: string; cfg: Partial<DemoConfig>; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px", borderRadius: 6, fontSize: 10, fontWeight: 600,
        cursor: "pointer", letterSpacing: "0.04em",
        background: active ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)",
        border: active ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.08)",
        color: active ? "#818CF8" : "var(--muted)",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

export default function DemoModal({ onClose, onLaunch }: Props) {
  const [cfg, setCfg]       = useState<DemoConfig>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const set = useCallback(<K extends keyof DemoConfig>(k: K, v: DemoConfig[K]) => {
    setCfg(prev => ({ ...prev, [k]: v }));
  }, []);

  const fraudCount = cfg.n_circular + cfg.n_structuring + cfg.n_burst;
  const totalEdges = cfg.n_transactions + cfg.n_circular * 5 + cfg.n_structuring * 6 + cfg.n_burst * 12;

  const applyPreset = (preset: Partial<DemoConfig>) => {
    setCfg(prev => ({ ...prev, ...preset }));
  };

  const presets = [
    { label: "Minimal",  cfg: { n_accounts: 30,  n_transactions: 100, n_circular: 1, n_structuring: 0, n_burst: 0 } },
    { label: "Default",  cfg: DEFAULTS },
    { label: "Heavy",    cfg: { n_accounts: 200, n_transactions: 1000, n_circular: 6, n_structuring: 4, n_burst: 4 } },
    { label: "Chaos",    cfg: { n_accounts: 300, n_transactions: 2000, n_circular: 10, n_structuring: 8, n_burst: 8 } },
  ];

  const handleLaunch = async () => {
    setLoading(true);
    setError(null);
    try {
      await onLaunch(cfg);
    } catch (e: any) {
      setError(e.message || "Failed to start demo");
      setLoading(false);
    }
  };

  return (
    /* Backdrop */
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Modal panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 420, maxHeight: "90vh", overflowY: "auto",
          background: "linear-gradient(160deg, #0D0D1F 0%, #0A0A18 100%)",
          border: "1px solid rgba(99,102,241,0.25)",
          borderRadius: 16,
          boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,102,241,0.08)",
          padding: "24px 28px",
          position: "relative",
        }}
      >
        {/* Top glow */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(239,68,68,0.4), transparent)",
          borderRadius: "16px 16px 0 0",
        }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{
                width: 28, height: 28,
                background: "linear-gradient(135deg, #6366F1, #EF4444)",
                borderRadius: 7,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 0 12px rgba(99,102,241,0.4)",
                fontSize: 13,
              }}>⚡</div>
              <span style={{ fontSize: 16, fontWeight: 800, color: "#E8EEFF", letterSpacing: "-0.01em" }}>
                Demo Mode
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
              Generate synthetic fraud scenarios and watch the graph form live
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--muted)", fontSize: 18, lineHeight: 1,
              padding: "2px 6px", borderRadius: 5,
            }}
          >×</button>
        </div>

        {/* Presets */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            Presets
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {presets.map(p => (
              <PresetBtn
                key={p.label}
                label={p.label}
                cfg={p.cfg}
                active={JSON.stringify({ ...DEFAULTS, ...p.cfg }) === JSON.stringify(cfg)}
                onClick={() => applyPreset(p.cfg)}
              />
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border)", marginBottom: 22 }} />

        {/* Network size */}
        <div style={{ fontSize: 10, color: "#818CF8", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>
          Network Size
        </div>
        <Slider label="Accounts" hint="nodes in the graph" value={cfg.n_accounts}
          min={20} max={300} color="#60A5FA" onChange={v => set("n_accounts", v)} />
        <Slider label="Transactions" hint="normal transfers" value={cfg.n_transactions}
          min={50} max={2000} color="#818CF8" onChange={v => set("n_transactions", v)} />

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border)", marginBottom: 22 }} />

        {/* Fraud patterns */}
        <div style={{ fontSize: 10, color: "#EF4444", letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>
          Fraud Patterns
        </div>
        <Slider label="Circular Rings" hint="money laundering loops" value={cfg.n_circular}
          min={0} max={12} color="#EF4444" onChange={v => set("n_circular", v)} />
        <Slider label="Structuring" hint="smurfing / fan-out" value={cfg.n_structuring}
          min={0} max={8} color="#F97316" onChange={v => set("n_structuring", v)} />
        <Slider label="Burst / Mule" hint="hub & spoke networks" value={cfg.n_burst}
          min={0} max={8} color="#EAB308" onChange={v => set("n_burst", v)} />

        {/* Summary pills */}
        <div style={{
          display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap",
          padding: "12px 14px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)",
        }}>
          {[
            { label: "Nodes",        value: cfg.n_accounts,  color: "#60A5FA" },
            { label: "Total Edges",  value: totalEdges,       color: "#818CF8" },
            { label: "Fraud Blocks", value: fraudCount,       color: "#EF4444" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>
                {value.toLocaleString()}
              </div>
              <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 14, padding: "8px 12px",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 7, fontSize: 11, color: "#EF4444",
          }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 9, fontSize: 12, fontWeight: 600,
              cursor: "pointer",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--muted)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleLaunch}
            disabled={loading}
            style={{
              flex: 2, padding: "10px 0", borderRadius: 9, fontSize: 12, fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              background: loading
                ? "rgba(99,102,241,0.3)"
                : "linear-gradient(135deg, #6366F1 0%, #EF4444 100%)",
              border: "none",
              color: "white",
              letterSpacing: "0.03em",
              opacity: loading ? 0.7 : 1,
              boxShadow: loading ? "none" : "0 4px 20px rgba(99,102,241,0.4)",
              transition: "all 0.2s",
            }}
          >
            {loading ? "Generating…" : "⚡ Launch Demo"}
          </button>
        </div>
      </div>
    </div>
  );
}
