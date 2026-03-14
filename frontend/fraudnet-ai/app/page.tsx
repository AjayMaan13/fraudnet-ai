"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import AIExplanation from "./components/AIExplanation";
import AlertFeed from "./components/AlertFeed";
import StatsBar from "./components/StatsBar";
import type { Alert } from "./components/useWebSocket";
import { useWebSocket } from "./components/useWebSocket";

// D3 must only run client-side
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
      {/* Top stats bar */}
      <StatsBar stats={stats} isConnected={isConnected} txCount={txCount} />

      {/* Main grid */}
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: "1fr 280px",
        gridTemplateRows: "1fr",
        overflow: "hidden",
      }}>
        {/* Left: Graph */}
        <div style={{ overflow: "hidden", position: "relative" }}>
          <GraphView
            nodes={nodes}
            edges={edges}
            highlightIds={highlightIds}
          />
        </div>

        {/* Right: Alert feed + AI panel */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          borderLeft: "1px solid var(--border)",
          overflow: "hidden",
          background: "var(--panel)",
        }}>
          {/* Alert feed — top 55% */}
          <div style={{
            flex: "0 0 55%",
            borderBottom: "1px solid var(--border)",
            overflow: "hidden",
          }}>
            <AlertFeed
              alerts={alerts}
              selectedId={selectedAlert?.id ?? null}
              onSelect={setSelectedAlert}
            />
          </div>

          {/* AI explanation — bottom 45% */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <AIExplanation alert={selectedAlert} />
          </div>
        </div>
      </div>
    </div>
  );
}
