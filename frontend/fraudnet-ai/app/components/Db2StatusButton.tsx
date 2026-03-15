"use client";

import { useEffect, useRef, useState } from "react";

type Status =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "connected"; accounts: number; transactions: number }
  | { state: "disconnected"; reason: string };

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export default function Db2StatusButton() {
  const [status, setStatus] = useState<Status>({ state: "idle" });
  const [open, setOpen]     = useState(false);
  const ref                 = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleClick = async () => {
    setOpen(o => !o);
    if (status.state === "idle" || status.state === "disconnected") {
      setStatus({ state: "loading" });
      try {
        const res  = await fetch("http://localhost:8000/db2/status");
        const data = await res.json();
        if (data.connected) {
          setStatus({ state: "connected", accounts: data.accounts, transactions: data.transactions });
        } else {
          setStatus({ state: "disconnected", reason: data.reason ?? "unknown" });
        }
      } catch {
        setStatus({ state: "disconnected", reason: "backend unreachable" });
      }
    }
  };

  const dotColor =
    status.state === "connected"   ? "#22C55E" :
    status.state === "loading"     ? "#F59E0B" :
    status.state === "disconnected"? "#EF4444" : "#60A5FA";

  const dotGlow =
    status.state === "connected"   ? "0 0 5px #22C55E" :
    status.state === "loading"     ? "0 0 5px #F59E0B" :
    status.state === "disconnected"? "0 0 5px #EF4444" : "none";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Badge button */}
      <button
        onClick={handleClick}
        title="Check IBM Db2 connection"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 9, fontWeight: 600, color: "#60A5FA",
          background: "rgba(59,130,246,0.08)",
          border: "1px solid rgba(59,130,246,0.2)",
          borderRadius: 6, padding: "4px 10px",
          letterSpacing: "0.05em",
          cursor: "pointer",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = "rgba(59,130,246,0.16)";
          e.currentTarget.style.borderColor = "rgba(59,130,246,0.4)";
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = "rgba(59,130,246,0.08)";
          e.currentTarget.style.borderColor = "rgba(59,130,246,0.2)";
        }}
      >
        {/* Status dot */}
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: dotColor,
          boxShadow: dotGlow,
          flexShrink: 0,
          animation: status.state === "loading" ? "pulse-dot 1s ease-in-out infinite" : "none",
        }} />
        IBM Db2
      </button>

      {/* Popover */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 240,
          background: "linear-gradient(160deg, #0C0C1E 0%, #09091A 100%)",
          border: "1px solid rgba(59,130,246,0.25)",
          borderRadius: 10,
          boxShadow: "0 16px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.08)",
          zIndex: 100,
          overflow: "hidden",
        }}>
          {/* Top accent */}
          <div style={{
            height: 2,
            background: "linear-gradient(90deg, #3B82F6, #60A5FA, #93C5FD)",
          }} />

          <div style={{ padding: "14px 16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 28, height: 28,
                background: "rgba(59,130,246,0.12)",
                border: "1px solid rgba(59,130,246,0.25)",
                borderRadius: 6,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, flexShrink: 0,
              }}>🗄</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#E8EEFF", letterSpacing: "0.02em" }}>
                  IBM Db2
                </div>
                <div style={{ fontSize: 9, color: "#4A5270", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Cloud Database
                </div>
              </div>
            </div>

            {/* Body */}
            {status.state === "loading" && (
              <div style={{ fontSize: 10, color: "#F59E0B", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ animation: "spin-slow 1s linear infinite", display: "inline-block" }}>◌</span>
                Connecting…
              </div>
            )}

            {status.state === "idle" && (
              <div style={{ fontSize: 10, color: "#4A5270" }}>Click to check connection</div>
            )}

            {status.state === "connected" && (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  marginBottom: 12,
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "#22C55E", boxShadow: "0 0 6px #22C55E",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#22C55E" }}>Connected</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Row label="Transactions" value={fmt(status.transactions)} color="#60A5FA" />
                  <Row label="Accounts"     value={fmt(status.accounts)}     color="#818CF8" />
                </div>
                <div style={{
                  marginTop: 10, padding: "6px 8px",
                  background: "rgba(34,197,94,0.05)",
                  border: "1px solid rgba(34,197,94,0.15)",
                  borderRadius: 6,
                  fontSize: 9, color: "#6EE7B7", lineHeight: 1.5,
                }}>
                  Serving live data from IBM Cloud (ca-tor)
                </div>
              </>
            )}

            {status.state === "disconnected" && (
              <>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  marginBottom: 10,
                }}>
                  <div style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: "#EF4444", boxShadow: "0 0 6px #EF4444",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 10, fontWeight: 600, color: "#EF4444" }}>Disconnected</span>
                </div>

                <div style={{
                  padding: "8px 10px",
                  background: "rgba(239,68,68,0.06)",
                  border: "1px solid rgba(239,68,68,0.18)",
                  borderRadius: 7,
                  fontSize: 9, color: "#FCA5A5", lineHeight: 1.6,
                  marginBottom: 10,
                }}>
                  IBM Cloud trial instance has expired.<br/>
                  App is running on <strong style={{ color: "#93C5FD" }}>SQLite fallback</strong> automatically.
                </div>

                <div style={{ fontSize: 9, color: "#4A5270", lineHeight: 1.6 }}>
                  During development, Db2 stored <strong style={{ color: "#60A5FA" }}>5,000 transactions</strong> and <strong style={{ color: "#818CF8" }}>500 accounts</strong>.
                  Add credentials to <code style={{ color: "#A5B4FC", background: "rgba(99,102,241,0.1)", padding: "0 3px", borderRadius: 3 }}>backend/.env</code> to reconnect.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "5px 8px",
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.05)",
      borderRadius: 5,
    }}>
      <span style={{ fontSize: 9, color: "#4A5270", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}
