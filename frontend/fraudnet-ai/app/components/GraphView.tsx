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

const MAX_NODES = 300;
const UPDATE_MS = 2000;

export default function GraphView({ nodes, edges, highlightIds }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef     = useRef<any>(null);
  const rafRef       = useRef<number>(0);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef   = useRef<{ nodes: any[]; links: any[] } | null>(null);
  const [label, setLabel] = useState("");

  // ── Init 3D graph once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    import("3d-force-graph").then((mod) => {
      if (destroyed || !containerRef.current) return;

      const ForceGraph3D = (mod.default || (mod as any)) as any;
      const el = containerRef.current;

      const fg = ForceGraph3D({ antialias: true, alpha: true })(el)
        .backgroundColor("#06060F")
        .showNavInfo(false)
        .nodeLabel((n: any) =>
          `<div style="background:#0D0D1F;border:1px solid #1A1A35;border-radius:8px;padding:8px 12px;font-size:11px;line-height:1.65;color:#E8EEFF;pointer-events:none;box-shadow:0 4px 20px rgba(0,0,0,0.5)">
            <b style="color:${RISK_COLOR[n.risk_level] || "#3B82F6"};font-size:12px">${n.name || n.id}</b><br/>
            <span style="color:#4A5270;font-size:10px">Risk</span> <b>${Math.round(n.risk_score)}</b>
            <span style="color:#4A5270"> · </span>
            <span style="text-transform:capitalize;color:${RISK_COLOR[n.risk_level]}">${n.risk_level}</span><br/>
            <span style="color:#4A5270;font-size:10px">${n.account_type}</span>
          </div>`
        )
        .nodeColor((n: any) => RISK_COLOR[n.risk_level] || "#3B82F6")
        .nodeVal((n: any) =>
          n.risk_level === "fraud" ? 7 :
          n.risk_level === "suspicious" ? 5 :
          n.risk_level === "watch" ? 3 : 2
        )
        .nodeOpacity(0.9)
        .linkColor((l: any) => l.tx_type?.startsWith("fraud") ? "#EF444460" : "#1A1A3580")
        .linkWidth((l: any) => l.tx_type?.startsWith("fraud") ? 1.6 : 0.35)
        .linkDirectionalParticles((l: any) => l.tx_type?.startsWith("fraud") ? 5 : 0)
        .linkDirectionalParticleWidth(1.6)
        .linkDirectionalParticleColor(() => "#EF4444")
        .linkDirectionalParticleSpeed(0.005)
        .d3AlphaDecay(0.022)
        .d3VelocityDecay(0.38);

      // Auto-rotate, stop on mousedown
      let angle = 0;
      let rotating = true;
      el.addEventListener("mousedown", () => { rotating = false; });

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        if (!rotating || !fg) return;
        fg.cameraPosition({
          x: 620 * Math.sin(angle),
          z: 620 * Math.cos(angle),
        });
        angle += 0.0012;
      };
      rafRef.current = requestAnimationFrame(tick);

      // Resize without blanking
      const ro = new ResizeObserver(() => {
        if (!containerRef.current) return;
        const { width, height } = containerRef.current.getBoundingClientRect();
        fg.width(width).height(height);
      });
      ro.observe(el);

      graphRef.current = fg;

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

  // ── Debounced data update ────────────────────────────────────────────────
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
      ? `Top ${MAX_NODES} of ${nodes.length} nodes`
      : `${visible.length} nodes · ${gEdges.length} edges`;

    if (!graphRef.current) {
      pendingRef.current = { nodes: gNodes, links: gEdges };
      setLabel(nextLabel);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      graphRef.current?.graphData({ nodes: gNodes, links: gEdges });
      setLabel(nextLabel);
    }, UPDATE_MS);
  }, [nodes, edges]);

  // ── Zoom to highlighted nodes ────────────────────────────────────────────
  useEffect(() => {
    if (!graphRef.current || highlightIds.length === 0) return;
    const data    = graphRef.current.graphData();
    const targets = (data.nodes as any[]).filter((n: any) => highlightIds.includes(n.id));
    if (!targets.length) return;
    const cx = targets.reduce((s: number, n: any) => s + (n.x || 0), 0) / targets.length;
    const cy = targets.reduce((s: number, n: any) => s + (n.y || 0), 0) / targets.length;
    const cz = targets.reduce((s: number, n: any) => s + (n.z || 0), 0) / targets.length;
    graphRef.current.cameraPosition(
      { x: cx, y: cy, z: cz + 240 },
      { x: cx, y: cy, z: cz },
      750
    );
  }, [highlightIds]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* Node/edge counter — top left */}
      <div className="glass" style={{
        position: "absolute", top: 14, left: 16,
        fontSize: 10, color: "var(--muted)",
        borderRadius: 7, padding: "5px 11px",
        letterSpacing: "0.04em",
      }}>
        {label}
      </div>

      {/* 3D badge — top right */}
      <div style={{
        position: "absolute", top: 14, right: 16,
        display: "flex", alignItems: "center", gap: 6,
        background: "rgba(59,130,246,0.08)",
        border: "1px solid rgba(59,130,246,0.2)",
        borderRadius: 7, padding: "5px 11px",
        backdropFilter: "blur(10px)",
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#3B82F6",
          boxShadow: "0 0 6px #3B82F6",
          animation: "glow-pulse 2.5s ease-in-out infinite",
        }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: "#60A5FA",
          letterSpacing: "0.08em",
        }}>
          3D · WebGL
        </span>
      </div>

      {/* Legend — bottom left */}
      <div className="glass" style={{
        position: "absolute", bottom: 16, left: 16,
        display: "flex", alignItems: "center", gap: 14,
        borderRadius: 9, padding: "7px 16px",
      }}>
        {Object.entries(RISK_COLOR).map(([level, color]) => (
          <div key={level} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: color,
              boxShadow: `0 0 6px ${color}90`,
            }} />
            <span style={{
              fontSize: 10, color: "var(--muted)",
              textTransform: "capitalize", letterSpacing: "0.04em",
            }}>
              {level}
            </span>
          </div>
        ))}
      </div>

      {/* Fraud particle hint — bottom right, only if fraud edges present */}
      <div className="glass" style={{
        position: "absolute", bottom: 16, right: 16,
        fontSize: 9, color: "var(--muted)",
        borderRadius: 7, padding: "5px 11px",
        display: "flex", alignItems: "center", gap: 5,
      }}>
        <span style={{ color: "#EF4444", fontSize: 8 }}>●</span>
        Fraud flow particles
      </div>
    </div>
  );
}
