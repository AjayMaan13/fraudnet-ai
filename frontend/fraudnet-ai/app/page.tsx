"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import AIExplanation from "./components/AIExplanation";
import AlertFeed from "./components/AlertFeed";
import StatsBar from "./components/StatsBar";
import type { Alert } from "./components/useWebSocket";
import { useWebSocket } from "./components/useWebSocket";

const GraphView = dynamic(() => import("./components/GraphView"), { ssr: false });

export default function Dashboard() {
  const { nodes, edges, alerts, stats, isConnected, txCount } = useWebSocket();
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

  const highlightIds = selectedAlert?.accounts ?? [];

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      overflow: "hidden",
      background: "var(--bg)",
    }}>
      <StatsBar stats={stats} isConnected={isConnected} txCount={txCount} />

      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 300px",
        overflow: "hidden",
        minHeight: 0,
      }}>
        {/* 3D Graph */}
        <div style={{ overflow: "hidden", position: "relative", minHeight: 0 }}>
          <GraphView nodes={nodes} edges={edges} highlightIds={highlightIds} />
        </div>

        {/* Right sidebar */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          overflow: "hidden",
          background: "var(--panel)",
          minHeight: 0,
          position: "relative",
        }}>
          {/* Subtle top gradient accent */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: "linear-gradient(90deg, rgba(239,68,68,0.4) 0%, rgba(99,102,241,0.4) 100%)",
            zIndex: 1,
          }} />

          {/* Alert feed — top 56% */}
          <div style={{
            flex: "0 0 56%",
            borderBottom: "1px solid var(--border)",
            overflow: "hidden",
            minHeight: 0,
          }}>
            <AlertFeed
              alerts={alerts}
              selectedId={selectedAlert?.id ?? null}
              onSelect={setSelectedAlert}
            />
          </div>

          {/* AI panel — bottom 44% */}
          <div style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
            <AIExplanation alert={selectedAlert} />
          </div>
        </div>
      </div>
    </div>
  );
}
