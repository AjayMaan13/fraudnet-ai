"use client";

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";
import AIExplanation from "./components/AIExplanation";
import AlertFeed from "./components/AlertFeed";
import DemoModal from "./components/DemoModal";
import LaunchScreen from "./components/LaunchScreen";
import StatsBar from "./components/StatsBar";
import type { Alert } from "./components/useWebSocket";
import { useWebSocket } from "./components/useWebSocket";
import { HTTP_BASE } from "./lib/api";

const GraphView = dynamic(() => import("./components/GraphView"), { ssr: false });

const MIN_SPLIT = 20;
const MAX_SPLIT = 80;

export default function Dashboard() {
  const { nodes, edges, alerts, stats, isConnected, txCount } = useWebSocket();
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [splitPct, setSplitPct]           = useState(56);
  const [panelWidth, setPanelWidth]       = useState(340);   // sidebar width px
  const [hasLaunched, setHasLaunched]     = useState(false);
  const [showReconfig, setShowReconfig]   = useState(false);
  const [db2Loading, setDb2Loading]       = useState(false);
  const sidebarRef    = useRef<HTMLDivElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const dragging      = useRef(false);
  const hDragging     = useRef(false);           // horizontal panel resize

  const MIN_PANEL = 260;
  const MAX_PANEL = 560;

  const highlightIds = selectedAlert?.accounts ?? [];

  const handleLaunch = useCallback(async (cfg: {
    n_accounts: number; n_transactions: number;
    n_circular: number; n_structuring: number; n_burst: number;
  }) => {
    const res = await fetch(`${HTTP_BASE}/demo/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    setHasLaunched(true);
    setSelectedAlert(null);
    setShowReconfig(false);
    // demo_reset WS message handles state clear + reconnect
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor     = "row-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      const pct  = ((ev.clientY - rect.top) / rect.height) * 100;
      setSplitPct(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, pct)));
    };
    const onUp = () => {
      dragging.current = false;
      document.body.style.cursor     = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  const onPanelDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    hDragging.current = true;
    document.body.style.cursor     = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!hDragging.current || !containerRef.current) return;
      const rect  = containerRef.current.getBoundingClientRect();
      const width = rect.right - ev.clientX;          // distance from right edge
      setPanelWidth(Math.min(MAX_PANEL, Math.max(MIN_PANEL, width)));
    };
    const onUp = () => {
      hDragging.current = false;
      document.body.style.cursor     = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, []);

  // ── Launch screen ────────────────────────────────────────────────────────
  if (!hasLaunched) {
    return <LaunchScreen onLaunch={handleLaunch} />;
  }

  // ── Dashboard ────────────────────────────────────────────────────────────
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", overflow: "hidden",
      background: "var(--bg)",
    }}>
      <StatsBar stats={stats} isConnected={isConnected} txCount={txCount} />

      <div
        ref={containerRef}
        style={{
          flex: 1, display: "flex", flexDirection: "row",
          overflow: "hidden", minHeight: 0,
        }}
      >
        {/* 3D Graph */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}>
          <GraphView nodes={nodes} edges={edges} highlightIds={highlightIds} />

          {/* Top center buttons */}
          <div style={{
            position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
            zIndex: 10, display: "flex", gap: 8, alignItems: "center",
          }}>
            <button
              onClick={() => setShowReconfig(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                cursor: "pointer",
                background: "rgba(99,102,241,0.12)",
                border: "1px solid rgba(99,102,241,0.3)",
                color: "#818CF8",
                backdropFilter: "blur(10px)",
                letterSpacing: "0.03em",
                transition: "all 0.15s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background  = "rgba(99,102,241,0.22)";
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background  = "rgba(99,102,241,0.12)";
                e.currentTarget.style.borderColor = "rgba(99,102,241,0.3)";
              }}
            >
              <span style={{ fontSize: 12 }}>⚙</span>
              Reconfigure
            </button>

            <button
              disabled={db2Loading}
              onClick={async () => {
                setDb2Loading(true);
                try {
                  await fetch(`${HTTP_BASE}/db2/load`, { method: "POST" });
                  setHasLaunched(true);
                  setSelectedAlert(null);
                } finally {
                  setDb2Loading(false);
                }
              }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                cursor: db2Loading ? "not-allowed" : "pointer",
                background: "rgba(59,130,246,0.10)",
                border: "1px solid rgba(59,130,246,0.28)",
                color: "#60A5FA",
                backdropFilter: "blur(10px)",
                letterSpacing: "0.03em",
                transition: "all 0.15s",
                opacity: db2Loading ? 0.6 : 1,
              }}
              onMouseEnter={e => {
                if (!db2Loading) {
                  e.currentTarget.style.background  = "rgba(59,130,246,0.20)";
                  e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)";
                }
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background  = "rgba(59,130,246,0.10)";
                e.currentTarget.style.borderColor = "rgba(59,130,246,0.28)";
              }}
            >
              {db2Loading
                ? <><span style={{ animation: "spin-slow 1s linear infinite", display: "inline-block" }}>◌</span> Loading…</>
                : <><span style={{ fontSize: 12 }}>🗄</span> Load Db2 Dataset</>
              }
            </button>
          </div>
        </div>

        {/* ── Horizontal drag handle ─────────────────────────── */}
        <div
          onMouseDown={onPanelDragStart}
          style={{
            width: 5, flexShrink: 0,
            cursor: "col-resize",
            background: "var(--border)",
            position: "relative", zIndex: 2,
            transition: "background 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "#6366F155")}
          onMouseLeave={e => (e.currentTarget.style.background = "var(--border)")}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--muted)", opacity: 0.5 }} />
            ))}
          </div>
        </div>

        {/* Right sidebar */}
        <div
          ref={sidebarRef}
          style={{
            width: panelWidth, flexShrink: 0,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
            background: "var(--panel)",
            minHeight: 0, position: "relative",
          }}
        >
          {/* Top accent */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1, zIndex: 1,
            background: "linear-gradient(90deg, rgba(239,68,68,0.4) 0%, rgba(99,102,241,0.4) 100%)",
          }} />

          {/* Alert feed */}
          <div style={{
            height: `${splitPct}%`, minHeight: 0,
            flexShrink: 0, overflow: "hidden",
            display: "flex", flexDirection: "column",
          }}>
            <AlertFeed
              alerts={alerts}
              selectedId={selectedAlert?.id ?? null}
              onSelect={setSelectedAlert}
            />
          </div>

          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            style={{
              height: 5, flexShrink: 0, cursor: "row-resize",
              background: "var(--border)", position: "relative", zIndex: 2,
              transition: "background 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "#6366F155")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--border)")}
          >
            <div style={{ display: "flex", gap: 3 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 3, height: 3, borderRadius: "50%", background: "var(--muted)", opacity: 0.6 }} />
              ))}
            </div>
          </div>

          {/* AI panel */}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <AIExplanation alert={selectedAlert} />
          </div>
        </div>
      </div>

      {/* Reconfigure modal */}
      {showReconfig && (
        <DemoModal
          onClose={() => setShowReconfig(false)}
          onLaunch={handleLaunch}
        />
      )}

      {/* Footer */}
      <div style={{
        height: 26, flexShrink: 0,
        background: "linear-gradient(90deg, #08080F 0%, #0A0A1A 100%)",
        borderTop: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 18px", gap: 12,
      }}>
        <span style={{ fontSize: 9, color: "var(--muted)", letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
          Real-time financial fraud detection powered by graph analysis &amp; IBM Granite AI
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 8, color: "#4A5270", letterSpacing: "0.08em", textTransform: "uppercase" }}>Powered by</span>
          {[
            { label: "IBM watsonx.ai", color: "#818CF8", bg: "rgba(99,102,241,0.1)",  border: "rgba(99,102,241,0.2)"  },
            { label: "IBM Db2",        color: "#60A5FA", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.18)" },
            { label: "Granite 3 · 8B", color: "#A78BFA", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.18)" },
          ].map(({ label, color, bg, border }) => (
            <span key={label} style={{
              fontSize: 8, fontWeight: 700, color,
              background: bg, border: `1px solid ${border}`,
              borderRadius: 4, padding: "1px 7px", letterSpacing: "0.06em",
            }}>{label}</span>
          ))}
        </div>

        <a
          href="https://github.com/AjayMaan13/fraudnet-ai"
          target="_blank" rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", gap: 5,
            fontSize: 9, color: "var(--muted)", textDecoration: "none",
            flexShrink: 0, transition: "color 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--text)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12"/>
          </svg>
          AjayMaan13/fraudnet-ai
        </a>
      </div>
    </div>
  );
}
