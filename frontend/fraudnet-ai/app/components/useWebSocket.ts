"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GraphNode {
  id: string;
  name: string;
  risk_score: number;
  risk_level: "clean" | "watch" | "suspicious" | "fraud";
  account_type: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  amount: number;
  timestamp: string;
  tx_type: string;
}

export interface Alert {
  id: string;
  type: string;
  accounts: string[];
  total_amount: number;
  risk_score: number;
  timestamp: string;
}

export interface Stats {
  total_txns: number;
  active_accounts: number;
  fraud_rings: number;
  flagged_amount: number;
  uptime: number;
}

interface WebSocketState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  alerts: Alert[];
  stats: Stats;
  isConnected: boolean;
  txCount: number;
}

const WS_URL = "ws://localhost:8000/ws/stream";

const DEFAULT_STATS: Stats = {
  total_txns: 0,
  active_accounts: 0,
  fraud_rings: 0,
  flagged_amount: 0,
  uptime: 0,
};

export function useWebSocket() {
  const [state, setState] = useState<WebSocketState>({
    nodes: [],
    edges: [],
    alerts: [],
    stats: DEFAULT_STATS,
    isConnected: false,
    txCount: 0,
  });

  const wsRef      = useRef<WebSocket | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);
  const nodesRef   = useRef<Map<string, GraphNode>>(new Map());
  const edgesRef   = useRef<GraphEdge[]>([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      retryDelay.current = 1000;
      setState(s => ({ ...s, isConnected: true }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "snapshot") {
        const { nodes, edges } = msg.data as { nodes: GraphNode[]; edges: GraphEdge[] };
        nodesRef.current = new Map(nodes.map(n => [n.id, n]));
        edgesRef.current = edges;
        setState(s => ({
          ...s,
          nodes: [...nodesRef.current.values()],
          edges: [...edgesRef.current],
        }));

      } else if (msg.type === "transaction") {
        const txn = msg.data;
        // Update edge list (cap at 6000 to avoid memory bloat)
        edgesRef.current = [...edgesRef.current, {
          source: txn.from_account,
          target: txn.to_account,
          amount: txn.amount,
          timestamp: txn.timestamp,
          tx_type: txn.tx_type,
        }].slice(-6000);
        setState(s => ({
          ...s,
          edges: [...edgesRef.current],
          txCount: s.txCount + 1,
        }));

      } else if (msg.type === "alert") {
        const alert = msg.data as Alert;
        setState(s => ({
          ...s,
          alerts: [alert, ...s.alerts].slice(0, 50),
          stats: {
            ...s.stats,
            fraud_rings: s.stats.fraud_rings + (alert.type === "circular_flow" ? 1 : 0),
            flagged_amount: s.stats.flagged_amount + (alert.total_amount || 0),
          },
        }));

      } else if (msg.type === "risk_update") {
        const updates = msg.data as Record<string, number>;
        for (const [id, score] of Object.entries(updates)) {
          const node = nodesRef.current.get(id);
          if (node) {
            const level =
              score >= 76 ? "fraud" :
              score >= 51 ? "suspicious" :
              score >= 21 ? "watch" : "clean";
            nodesRef.current.set(id, { ...node, risk_score: score, risk_level: level });
          }
        }
        setState(s => ({
          ...s,
          nodes: [...nodesRef.current.values()],
        }));
      }
    };

    ws.onclose = () => {
      setState(s => ({ ...s, isConnected: false }));
      retryRef.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 16000);
        connect();
      }, retryDelay.current);
    };

    ws.onerror = () => ws.close();
  }, []);

  // Poll /stats every 5s to keep uptime + txn count fresh
  useEffect(() => {
    const poll = setInterval(async () => {
      try {
        const r = await fetch("http://localhost:8000/stats");
        if (r.ok) {
          const data: Stats = await r.json();
          setState(s => ({ ...s, stats: data }));
        }
      } catch { /* backend not ready yet */ }
    }, 5000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return state;
}
