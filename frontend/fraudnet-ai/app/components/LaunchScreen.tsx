"use client";

import { useCallback, useState } from "react";

interface DemoConfig {
  n_accounts:     number;
  n_transactions: number;
  n_circular:     number;
  n_structuring:  number;
  n_burst:        number;
}

const DEFAULTS: DemoConfig = {
  n_accounts:     100,
  n_transactions: 500,
  n_circular:     3,
  n_structuring:  2,
  n_burst:        2,
};

const PRESETS = [
  { label: "Quick",   cfg: { n_accounts: 40,  n_transactions: 150,  n_circular: 2, n_structuring: 1, n_burst: 1 } },
  { label: "Default", cfg: DEFAULTS },
  { label: "Heavy",   cfg: { n_accounts: 200, n_transactions: 1000, n_circular: 6, n_structuring: 4, n_burst: 4 } },
  { label: "Chaos",   cfg: { n_accounts: 300, n_transactions: 2000, n_circular: 10, n_structuring: 8, n_burst: 8 } },
];

function Slider({
  label, hint, value, min, max, color, onChange,
}: {
  label: string; hint: string; value: number;
  min: number; max: number; color: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7, alignItems: "baseline" }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#C8D0E8" }}>{label}</span>
          <span style={{ fontSize: 10, color: "#4A5270", marginLeft: 8 }}>{hint}</span>
        </div>
        <span style={{
          fontSize: 13, fontWeight: 700, color,
          background: `${color}18`, border: `1px solid ${color}30`,
          borderRadius: 5, padding: "1px 9px",
          fontVariantNumeric: "tabular-nums",
        }}>{value.toLocaleString()}</span>
      </div>
      <div style={{ position: "relative", height: 5, borderRadius: 3, background: "rgba(255,255,255,0.05)" }}>
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${pct}%`, borderRadius: 3,
          background: `linear-gradient(90deg, ${color}66, ${color})`,
          transition: "width 0.08s",
        }} />
        <input
          type="range" min={min} max={max} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", margin: 0 }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
        <span style={{ fontSize: 9, color: "#2A2E45" }}>{min}</span>
        <span style={{ fontSize: 9, color: "#2A2E45" }}>{max}</span>
      </div>
    </div>
  );
}

export default function LaunchScreen({ onLaunch }: { onLaunch: (cfg: DemoConfig) => Promise<void> }) {
  const [cfg, setCfg] = useState<DemoConfig>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = useCallback(<K extends keyof DemoConfig>(k: K, v: DemoConfig[K]) =>
    setCfg(prev => ({ ...prev, [k]: v })), []);

  const totalEdges  = cfg.n_transactions + cfg.n_circular * 5 + cfg.n_structuring * 6 + cfg.n_burst * 12;
  const fraudBlocks = cfg.n_circular + cfg.n_structuring + cfg.n_burst;

  const handleLaunch = async () => {
    setLoading(true);
    setError(null);
    try { await onLaunch(cfg); }
    catch (e: any) { setError(e.message || "Failed to generate"); setLoading(false); }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "#06060F",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      overflow: "auto",
      padding: "40px 20px",
    }}>
      {/* Subtle radial glow */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse 800px 500px at 50% 30%, rgba(99,102,241,0.07) 0%, transparent 70%)",
      }} />

      <div style={{ width: "100%", maxWidth: 580, position: "relative", zIndex: 1 }}>

        {/* ── Logo & heading ───────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 52, height: 52,
            background: "linear-gradient(135deg, #6366F1 0%, #EF4444 100%)",
            borderRadius: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 0 40px rgba(99,102,241,0.35), 0 0 80px rgba(239,68,68,0.12)",
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="white" opacity="0.95"/>
              <path d="M2 17l10 5 10-5" stroke="white" strokeWidth="2" fill="none" opacity="0.65"/>
              <path d="M2 12l10 5 10-5" stroke="white" strokeWidth="2" fill="none" opacity="0.82"/>
            </svg>
          </div>

          <div style={{
            fontSize: 30, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1,
            background: "linear-gradient(135deg, #E8EEFF 40%, #8090B0 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            FraudNet<span style={{ WebkitTextFillColor: "#EF4444" }}>·AI</span>
          </div>

          <p style={{
            fontSize: 13, color: "#4A5270", marginTop: 8, lineHeight: 1.6,
            letterSpacing: "0.01em",
          }}>
            Real-time financial fraud detection &mdash; powered by graph analysis &amp; IBM Granite AI.<br/>
            Configure your simulation to explore how fraud patterns are detected live.
          </p>
        </div>

        {/* ── Config card ─────────────────────────────── */}
        <div style={{
          background: "linear-gradient(160deg, #0C0C1E 0%, #09091A 100%)",
          border: "1px solid rgba(99,102,241,0.18)",
          borderRadius: 18,
          padding: "28px 32px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.06)",
          position: "relative", overflow: "hidden",
        }}>
          {/* Top accent */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(99,102,241,0.5), rgba(239,68,68,0.3), transparent)",
          }} />

          {/* Presets */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 9, color: "#4A5270", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 10 }}>
              Presets
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {PRESETS.map(p => {
                const active = JSON.stringify({ ...DEFAULTS, ...p.cfg }) === JSON.stringify(cfg);
                return (
                  <button
                    key={p.label}
                    onClick={() => setCfg(prev => ({ ...prev, ...p.cfg }))}
                    style={{
                      padding: "5px 14px", borderRadius: 7, fontSize: 11, fontWeight: 600,
                      cursor: "pointer",
                      background: active ? "rgba(99,102,241,0.18)" : "rgba(255,255,255,0.04)",
                      border: active ? "1px solid rgba(99,102,241,0.45)" : "1px solid rgba(255,255,255,0.07)",
                      color: active ? "#818CF8" : "#4A5270",
                      transition: "all 0.15s",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 22 }} />

          {/* Two-column sliders */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
            {/* Left col — network size */}
            <div>
              <div style={{ fontSize: 9, color: "#6366F1", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>
                Network Size
              </div>
              <Slider label="Accounts"     hint="nodes"           value={cfg.n_accounts}     min={20}  max={300}  color="#60A5FA" onChange={v => set("n_accounts", v)} />
              <Slider label="Transactions" hint="normal transfers" value={cfg.n_transactions} min={50}  max={2000} color="#818CF8" onChange={v => set("n_transactions", v)} />
            </div>

            {/* Right col — fraud patterns */}
            <div>
              <div style={{ fontSize: 9, color: "#EF4444", letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700, marginBottom: 14 }}>
                Fraud Patterns
              </div>
              <Slider label="Circular Rings" hint="money laundering" value={cfg.n_circular}    min={0} max={12} color="#EF4444" onChange={v => set("n_circular", v)} />
              <Slider label="Structuring"    hint="smurfing"         value={cfg.n_structuring}  min={0} max={8}  color="#F97316" onChange={v => set("n_structuring", v)} />
              <Slider label="Burst / Mule"  hint="hub & spoke"      value={cfg.n_burst}        min={0} max={8}  color="#EAB308" onChange={v => set("n_burst", v)} />
            </div>
          </div>

          {/* Summary pills */}
          <div style={{
            display: "flex", gap: 0,
            background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 12, overflow: "hidden", marginTop: 8, marginBottom: 24,
          }}>
            {[
              { label: "Accounts",  value: cfg.n_accounts, color: "#60A5FA" },
              { label: "Est. Edges", value: totalEdges,     color: "#818CF8" },
              { label: "Fraud Blocks", value: fraudBlocks, color: "#EF4444" },
            ].map(({ label, value, color }, i) => (
              <div key={label} style={{
                flex: 1, padding: "12px 0", textAlign: "center",
                borderRight: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none",
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                  {value.toLocaleString()}
                </div>
                <div style={{ fontSize: 9, color: "#4A5270", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>
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
              borderRadius: 8, fontSize: 11, color: "#EF4444",
            }}>
              {error}
            </div>
          )}

          {/* Launch button */}
          <button
            onClick={handleLaunch}
            disabled={loading}
            style={{
              width: "100%", padding: "14px 0",
              borderRadius: 12, fontSize: 14, fontWeight: 800,
              cursor: loading ? "not-allowed" : "pointer",
              background: loading
                ? "rgba(99,102,241,0.25)"
                : "linear-gradient(135deg, #6366F1 0%, #7C3AED 50%, #EF4444 100%)",
              border: "none", color: "white",
              letterSpacing: "0.04em",
              opacity: loading ? 0.7 : 1,
              boxShadow: loading ? "none" : "0 8px 32px rgba(99,102,241,0.45), 0 2px 8px rgba(0,0,0,0.4)",
              transition: "all 0.2s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {loading ? (
              <>
                <span style={{ fontSize: 14, animation: "spin-slow 1s linear infinite", display: "inline-block" }}>◌</span>
                Generating simulation…
              </>
            ) : (
              <>
                <span style={{ fontSize: 16 }}>⚡</span>
                Generate Simulation
              </>
            )}
          </button>
        </div>

        {/* ── IBM branding ─────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, marginTop: 20,
        }}>
          <span style={{ fontSize: 9, color: "#2A2E45", letterSpacing: "0.08em", textTransform: "uppercase" }}>Powered by</span>
          {["IBM watsonx.ai", "IBM Db2", "Granite 3 · 8B"].map(label => (
            <span key={label} style={{
              fontSize: 9, fontWeight: 600, color: "#4A5270",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 4, padding: "2px 7px", letterSpacing: "0.05em",
            }}>{label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
