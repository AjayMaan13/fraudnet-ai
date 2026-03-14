"use client";

import * as d3 from "d3";
import { useEffect, useRef } from "react";
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

export default function GraphView({ nodes, edges, highlightIds }: Props) {
  const svgRef    = useRef<SVGSVGElement>(null);
  const simRef    = useRef<d3.Simulation<d3.SimulationNodeDatum, undefined> | null>(null);
  const zoomRef   = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const gRef      = useRef<d3.Selection<SVGGElement, unknown, null, undefined> | null>(null);
  const nodeMapRef = useRef<Map<string, GraphNode>>(new Map());

  // ── Initial D3 setup ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = svgRef.current.getBoundingClientRect();

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", e => g.attr("transform", e.transform));
    svg.call(zoom);
    zoomRef.current = zoom;

    const g = svg.append("g");
    gRef.current = g;

    g.append("g").attr("class", "links");
    g.append("g").attr("class", "nodes");

    // Force simulation
    const sim = d3.forceSimulation()
      .force("link", d3.forceLink().id((d: any) => d.id).distance(60).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide(14))
      .alphaDecay(0.02);

    simRef.current = sim;
  }, []);

  // ── Update graph when nodes/edges change ─────────────────────────────────
  useEffect(() => {
    if (!simRef.current || !gRef.current || !svgRef.current) return;

    const sim = simRef.current;
    const g   = gRef.current;

    // Show highest-risk nodes if > MAX_NODES
    const sorted = [...nodes].sort((a, b) => b.risk_score - a.risk_score);
    const visible = sorted.slice(0, MAX_NODES);
    const visibleIds = new Set(visible.map(n => n.id));

    nodeMapRef.current = new Map(visible.map(n => [n.id, n]));

    const visibleEdges = edges.filter(
      e => visibleIds.has(e.source) && visibleIds.has(e.target)
    ).slice(-800);

    // Preserve existing positions
    const oldNodes = new Map<string, { x: number; y: number; vx: number; vy: number }>();
    (sim.nodes() as any[]).forEach(n => {
      oldNodes.set(n.id, { x: n.x, y: n.y, vx: n.vx || 0, vy: n.vy || 0 });
    });

    const simNodes: any[] = visible.map(n => ({
      ...n,
      ...(oldNodes.get(n.id) || {}),
    }));

    const simEdges = visibleEdges.map(e => ({ ...e }));

    // Links
    const linkSel = g.select<SVGGElement>(".links")
      .selectAll<SVGLineElement, typeof simEdges[0]>("line")
      .data(simEdges, (d: any) => `${d.source}-${d.target}`);

    linkSel.exit().remove();

    const linkEnter = linkSel.enter().append("line")
      .attr("stroke", "#2D2D44")
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", (d: any) => Math.max(0.5, Math.log(d.amount + 1) / 10));

    // Nodes
    const nodeSel = g.select<SVGGElement>(".nodes")
      .selectAll<SVGGElement, typeof simNodes[0]>("g.node")
      .data(simNodes, (d: any) => d.id);

    nodeSel.exit().remove();

    const nodeEnter = nodeSel.enter()
      .append("g")
      .attr("class", "node")
      .call(
        d3.drag<SVGGElement, any>()
          .on("start", (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on("end", (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null; d.fy = null;
          })
      );

    nodeEnter.append("circle")
      .attr("r", (d: any) => {
        const deg = edges.filter(e => e.source === d.id || e.target === d.id).length;
        return Math.max(5, Math.min(14, 5 + Math.sqrt(deg)));
      });

    nodeEnter.append("title");

    const nodeMerge = nodeSel.merge(nodeEnter as any);

    // Update colors + pulse class
    nodeMerge.select("circle")
      .transition().duration(800)
      .attr("fill", (d: any) => RISK_COLOR[d.risk_level] || "#3B82F6")
      .attr("stroke", (d: any) =>
        highlightIds.includes(d.id) ? "#FFFFFF" :
        d.risk_level === "fraud" ? "#FF0000" : "transparent"
      )
      .attr("stroke-width", (d: any) => highlightIds.includes(d.id) ? 3 : 1.5);

    nodeMerge.select("title").text((d: any) =>
      `${d.name || d.id}\nRisk: ${Math.round(d.risk_score)} (${d.risk_level})\nType: ${d.account_type}`
    );

    // Pulse class for fraud nodes
    nodeMerge.classed("node-fraud-pulse", (d: any) => d.risk_level === "fraud");

    // Update simulation
    sim.nodes(simNodes);
    (sim.force("link") as d3.ForceLink<any, any>).links(simEdges);
    sim.alpha(0.3).restart();

    sim.on("tick", () => {
      g.select(".links").selectAll<SVGLineElement, any>("line")
        .attr("x1", d => (d.source as any).x)
        .attr("y1", d => (d.source as any).y)
        .attr("x2", d => (d.target as any).x)
        .attr("y2", d => (d.target as any).y);

      g.select(".nodes").selectAll<SVGGElement, any>("g.node")
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });
  }, [nodes, edges]);

  // ── Highlight / zoom when selection changes ───────────────────────────────
  useEffect(() => {
    if (!gRef.current || !svgRef.current || !zoomRef.current) return;

    gRef.current.select(".nodes").selectAll<SVGGElement, any>("g.node")
      .select("circle")
      .attr("stroke", (d: any) =>
        highlightIds.includes(d.id) ? "#FFFFFF" :
        d.risk_level === "fraud" ? "#FF0000" : "transparent"
      )
      .attr("stroke-width", (d: any) => highlightIds.includes(d.id) ? 3 : 1.5);

    if (highlightIds.length === 0) return;

    // Zoom to highlighted nodes
    const sim = simRef.current;
    if (!sim) return;
    const highlightedNodes = (sim.nodes() as any[]).filter(n => highlightIds.includes(n.id));
    if (highlightedNodes.length === 0) return;

    const cx = d3.mean(highlightedNodes, n => n.x) ?? 0;
    const cy = d3.mean(highlightedNodes, n => n.y) ?? 0;
    const { width, height } = svgRef.current.getBoundingClientRect();

    d3.select(svgRef.current)
      .transition().duration(700)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(2)
          .translate(-cx, -cy)
      );
  }, [highlightIds]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "var(--bg)" }}>
      <svg
        ref={svgRef}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
      {/* Legend */}
      <div style={{
        position: "absolute",
        bottom: 12,
        left: 12,
        display: "flex",
        gap: 10,
        background: "rgba(26,26,46,0.85)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "6px 10px",
      }}>
        {Object.entries(RISK_COLOR).map(([level, color]) => (
          <div key={level} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "capitalize" }}>{level}</span>
          </div>
        ))}
      </div>
      {/* Node count */}
      <div style={{
        position: "absolute",
        top: 10,
        right: 12,
        fontSize: 10,
        color: "var(--muted)",
        background: "rgba(26,26,46,0.85)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "3px 8px",
      }}>
        {nodes.length > MAX_NODES ? `Top ${MAX_NODES} / ${nodes.length} nodes` : `${nodes.length} nodes`}
      </div>
    </div>
  );
}
