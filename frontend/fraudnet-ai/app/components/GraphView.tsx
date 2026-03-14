"use client";

import { useEffect, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "./useWebSocket";

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlightIds: string[];
}

const RISK_COLOR: Record<string, string> = {
  clean:      "#3B82F6",
  watch:      "#EAB308",
  suspicious: "#F97316",
  fraud:      "#EF4444",
};

const MAX_NODES  = 300;
const UPDATE_MS  = 2000; // only push new data to 3D graph every 2 seconds

export default function GraphView({ nodes, edges, highlightIds }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const graphRef      = useRef<any>(null);
  const rafRef        = useRef<number>(0);
  const timerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef    = useRef<{ nodes: any[]; links: any[] } | null>(null);
  const [label, setLabel] = useState("");

  // ── Init 3D graph once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;

    import("3d-force-graph").then((mod) => {
      if (destroyed || !containerRef.current) return;

      const ForceGraph3D = (mod.default || (mod as any)) as any;
      const el = containerRef.current;

      const fg = ForceGraph3D({ antialias: true, alpha: true })(el)
        .backgroundColor("#080810")
        .showNavInfo(false)
        .nodeLabel((n: any) =>
          `<div style="background:#10101E;border:1px solid #1E1E3A;border-radius:6px;padding:6px 10px;font-size:11px;line-height:1.6;color:#E2E8F0;pointer-events:none">
            <b style="color:${RISK_COLOR[n.risk_level] || "#3B82F6"}">${n.name || n.id}</b><br/>
            Risk: <b>${Math.round(n.risk_score)}</b> (${n.risk_level})<br/>
            Type: ${n.account_type}
          </div>`
        )
        .nodeColor((n: any) => RISK_COLOR[n.risk_level] || "#3B82F6")
        .nodeVal((n: any) =>
          n.risk_level === "fraud" ? 6 :
          n.risk_level === "suspicious" ? 4 : 2
        )
        .nodeOpacity(0.92)
        .linkColor((l: any) => l.tx_type?.startsWith("fraud") ? "#EF444455" : "#1E1E3A99")
        .linkWidth((l: any) => l.tx_type?.startsWith("fraud") ? 1.5 : 0.4)
        .linkDirectionalParticles((l: any) => l.tx_type?.startsWith("fraud") ? 4 : 0)
        .linkDirectionalParticleWidth(1.4)
        .linkDirectionalParticleColor(() => "#EF4444")
        .linkDirectionalParticleSpeed(0.006)
        .d3AlphaDecay(0.025)
        .d3VelocityDecay(0.35);

      // Slow auto-rotate — stopped when user interacts
      let angle = 0;
      let rotating = true;
      el.addEventListener("mousedown", () => { rotating = false; });

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        if (!rotating || !fg) return;
        fg.cameraPosition({
          x: 600 * Math.sin(angle),
          z: 600 * Math.cos(angle),
        });
        angle += 0.0015;
      };
      rafRef.current = requestAnimationFrame(tick);

      // Handle container resize without blanking
      const ro = new ResizeObserver(() => {
        if (!containerRef.current) return;
        const { width, height } = containerRef.current.getBoundingClientRect();
        fg.width(width).height(height);
      });
      ro.observe(el);

      graphRef.current = fg;

      // Flush any data that arrived before the graph was ready
      if (pendingRef.current) {
        fg.graphData({ nodes: pendingRef.current.nodes, links: pendingRef.current.links });
        pendingRef.current = null;
      }
    });

    return () => {
      destroyed = true;
      cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearTimeout(timerRef.current);
      graphRef.current = null;
    };
  }, []);

  // ── Debounced data update — max once every UPDATE_MS ─────────────────────
  useEffect(() => {
    const sorted  = [...nodes].sort((a, b) => b.risk_score - a.risk_score);
    const visible = sorted.slice(0, MAX_NODES);
    const visIds  = new Set(visible.map(n => n.id));

    const gNodes = visible.map(n => ({ ...n }));
    const gEdges = edges
      .filter(e => visIds.has(e.source) && visIds.has(e.target))
      .slice(-800)
      .map(e => ({ source: e.source, target: e.target, tx_type: e.tx_type, amount: e.amount }));

    const nextLabel = nodes.length > MAX_NODES
      ? `Top ${MAX_NODES} / ${nodes.length} nodes`
      : `${visible.length} nodes · ${gEdges.length} edges`;

    if (!graphRef.current) {
      // Graph not ready yet — stash data using library key name "links"
      pendingRef.current = { nodes: gNodes, links: gEdges };
      setLabel(nextLabel);
      return;
    }

    // Debounce: clear pending timer, set new one
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      graphRef.current?.graphData({ nodes: gNodes, links: gEdges });
      setLabel(nextLabel);
    }, UPDATE_MS);
  }, [nodes, edges]);

  // ── Zoom to highlighted nodes ─────────────────────────────────────────────
  useEffect(() => {
    if (!graphRef.current || highlightIds.length === 0) return;
    const data    = graphRef.current.graphData();
    const targets = (data.nodes as any[]).filter((n: any) => highlightIds.includes(n.id));
    if (!targets.length) return;
    const cx = targets.reduce((s: number, n: any) => s + (n.x || 0), 0) / targets.length;
    const cy = targets.reduce((s: number, n: any) => s + (n.y || 0), 0) / targets.length;
    const cz = targets.reduce((s: number, n: any) => s + (n.z || 0), 0) / targets.length;
    graphRef.current.cameraPosition(
      { x: cx, y: cy, z: cz + 220 },
      { x: cx, y: cy, z: cz },
      700
    );
  }, [highlightIds]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 14, left: 14,
        display: "flex", gap: 12,
        background: "rgba(16,16,30,0.9)", border: "1px solid #1E1E3A",
        borderRadius: 8, padding: "7px 14px",
        backdropFilter: "blur(8px)",
      }}>
        {Object.entries(RISK_COLOR).map(([level, color]) => (
          <div key={level} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}` }} />
            <span style={{ fontSize: 10, color: "#4A5568", textTransform: "capitalize" }}>{level}</span>
          </div>
        ))}
      </div>

      {/* Node/edge counter */}
      <div style={{
        position: "absolute", top: 12, left: 14,
        fontSize: 10, color: "#4A5568",
        background: "rgba(16,16,30,0.9)", border: "1px solid #1E1E3A",
        borderRadius: 6, padding: "4px 10px", backdropFilter: "blur(8px)",
      }}>
        {label}
      </div>

      {/* 3D badge */}
      <div style={{
        position: "absolute", top: 12, right: 14,
        fontSize: 10, fontWeight: 700, color: "#3B82F6",
        background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.25)",
        borderRadius: 6, padding: "4px 10px", letterSpacing: "0.08em",
      }}>
        3D · WebGL
      </div>
    </div>
  );
}
