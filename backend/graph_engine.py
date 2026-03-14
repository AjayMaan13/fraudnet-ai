"""
FraudNet-AI — Graph Engine
Loads transaction data into a NetworkX directed graph, runs fraud detection,
and computes composite risk scores for all accounts.

Usage (from repo root):
    from backend.graph_engine import FraudGraphEngine
    engine = FraudGraphEngine("data-gen/transactions.db")
    engine.load_from_db()
    engine.calculate_risk_scores()
"""

import itertools
import json
import math
import sqlite3
import statistics
import uuid
from collections import defaultdict
from datetime import datetime, timedelta

import community as community_louvain  # python-louvain package
import networkx as nx

DB_PATH_DEFAULT = "data-gen/transactions.db"


class FraudGraphEngine:
    
    def __init__(self, db_path: str = DB_PATH_DEFAULT):
        self.G = nx.DiGraph()       # directed graph: edges = transactions
        self.risk_scores: dict[str, float] = {}   # account_id → 0–100
        self.alerts: list[dict] = []              # detected fraud events
        self.db_path = db_path

        # Intermediate detection flags (node-level)
        self._cycle_nodes: set[str] = set()
        self._community_scores: dict[str, float] = {}
        self._pagerank_scores: dict[str, float] = {}
        self._burst_nodes: set[str] = set()

    # ─────────────────────────────────────────────
    # LOAD
    # ─────────────────────────────────────────────

    def load_from_db(self): 
        """Read accounts + transactions from SQLite and populate the graph."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        # Load accounts as nodes
        cur.execute("SELECT id, name, created_at, account_type FROM accounts")
        for row in cur.fetchall():
            self.G.add_node(
                row["id"],
                name=row["name"],
                created_at=row["created_at"],
                account_type=row["account_type"],
            )

        # Load transactions as edges (multi-edges allowed via key=tx_id)
        cur.execute(
            "SELECT id, from_account, to_account, amount, timestamp, tx_type, is_fraud "
            "FROM transactions"
        )
        for row in cur.fetchall():
            self.G.add_edge(
                row["from_account"],
                row["to_account"],
                key=row["id"],
                tx_id=row["id"],
                amount=row["amount"],
                timestamp=row["timestamp"],
                tx_type=row["tx_type"],
                is_fraud=row["is_fraud"],
            )

        conn.close()

        # Run all detection passes after loading
        self.detect_cycles()
        self.detect_communities()
        self.detect_pagerank_anomaly()
        self.detect_temporal_burst()

    # ─────────────────────────────────────────────
    # DETECTION METHOD 1: CIRCULAR FLOWS
    # ─────────────────────────────────────────────

    def detect_cycles(self):
        """
        Find closed transaction loops (money laundering rings).
        Strategy:
          - Build a subgraph of only high-value recent edges (last 24h, amount > $1K).
          - Run simple_cycles on that, capped at 2000 candidates via islice.
        Criteria for a valid cycle:
          - Cycle length 3–8
          - Total edge weight > $5,000
          - All edge timestamps within a 24-hour window
        """
        cutoff = (datetime.now() - timedelta(hours=24)).isoformat()
        recent_edges = [
            (u, v)
            for u, v, d in self.G.edges(data=True)
            if (d or {}).get("timestamp", "") >= cutoff
            and (d or {}).get("amount", 0) >= 1_000
        ]
        recent = self.G.edge_subgraph(recent_edges)

        seen_cycle_sets: set[frozenset] = set()

        for cycle in itertools.islice(nx.simple_cycles(recent), 2000):
            length = len(cycle)
            if not (3 <= length <= 8):
                continue

            key = frozenset(cycle)
            if key in seen_cycle_sets:
                continue
            seen_cycle_sets.add(key)

            # Gather edges on the cycle (from full graph for accurate data)
            edge_data = []
            total_amount = 0.0
            valid = True
            for i in range(length):
                src = cycle[i]
                dst = cycle[(i + 1) % length]
                if not self.G.has_edge(src, dst):
                    valid = False
                    break
                edata: dict = self.G.edges[src, dst]
                edge_data.append(edata)
                total_amount += edata.get("amount", 0)

            if not valid or total_amount < 5_000:
                continue

            timestamps = []
            for e in edge_data:
                try:
                    timestamps.append(datetime.fromisoformat(e["timestamp"]))
                except (KeyError, ValueError):
                    pass

            if not timestamps:
                continue
            if max(timestamps) - min(timestamps) > timedelta(hours=24):
                continue

            for node in cycle:
                self._cycle_nodes.add(node)
                self.G.nodes[node]["fraud_cycle"] = True

            alert = {
                "id": str(uuid.uuid4()),
                "type": "circular_flow",
                "accounts": cycle,
                "total_amount": round(total_amount, 2),
                "risk_score": 90,
                "timestamp": min(timestamps).isoformat(),
                "subgraph": self.get_subgraph(cycle),
            }
            self.alerts.append(alert)

    # ─────────────────────────────────────────────
    # DETECTION METHOD 2: COMMUNITY ISOLATION
    # ─────────────────────────────────────────────

    def detect_communities(self):
        """
        Use Louvain community detection to find suspicious isolated clusters.
        Flagged when:
          - Community size >= 4 nodes
          - Internal edge density > 0.6
          - External connections < 2
        """
        G_und = self.G.to_undirected()
        if len(G_und.nodes) == 0:
            return

        partition = community_louvain.best_partition(G_und)
        # Group nodes by community id
        communities: dict[int, list[str]] = defaultdict(list)
        for node, comm_id in partition.items():
            communities[comm_id].append(node)

        for comm_id, members in communities.items():
            if len(members) < 4:
                continue

            sub = G_und.subgraph(members)
            n = len(members)
            max_edges = n * (n - 1) / 2
            internal_edges = sub.number_of_edges()
            density = internal_edges / max_edges if max_edges > 0 else 0

            if density <= 0.6:
                continue

            # Count external connections
            external = sum(
                1 for node in members
                for neighbor in G_und.neighbors(node)
                if neighbor not in members
            )
            if external >= 2:
                continue

            # Suspicious isolated cluster
            isolation_score = min(100, density * 100)
            for node in members:
                self._community_scores[node] = isolation_score

            alert = {
                "id": str(uuid.uuid4()),
                "type": "isolated_community",
                "accounts": members,
                "total_amount": round(
                    sum(
                        d.get("amount", 0)
                        for u, v, d in self.G.edges(members, data=True)
                    ),
                    2,
                ),
                "risk_score": round(isolation_score),
                "timestamp": datetime.utcnow().isoformat(),
                "subgraph": self.get_subgraph(members),
            }
            self.alerts.append(alert)

    # ─────────────────────────────────────────────
    # DETECTION METHOD 3: PAGERANK ANOMALY
    # ─────────────────────────────────────────────

    @staticmethod
    def _pagerank(G: nx.DiGraph, weight: str = "amount", alpha: float = 0.85,
                  max_iter: int = 100, tol: float = 1e-6) -> dict[str, float]:
        """Pure-Python power-iteration PageRank (no scipy required)."""
        nodes = list(G.nodes())
        N = len(nodes)
        if N == 0:
            return {}

        # Weighted out-degree per node
        out_w: dict[str, float] = {}
        for n in nodes:
            total = sum(d.get(weight, 1) or 1 for _, _, d in G.out_edges(n, data=True))
            out_w[n] = total if total > 0 else 1.0

        x: dict[str, float] = {n: 1.0 / N for n in nodes}
        dangling_nodes = [n for n in nodes if G.out_degree(n) == 0]

        for _ in range(max_iter):
            xlast = x.copy()
            danglesum = alpha / N * sum(xlast[n] for n in dangling_nodes)
            x = {n: danglesum + (1.0 - alpha) / N for n in nodes}
            for n in nodes:
                for _, nbr, data in G.out_edges(n, data=True):
                    w = data.get(weight, 1) or 1
                    x[nbr] += alpha * xlast[n] * w / out_w[n]
            if sum(abs(x[n] - xlast[n]) for n in nodes) < N * tol:
                break

        return x

    def detect_pagerank_anomaly(self):
        """
        Flag accounts receiving disproportionate fund flows.
        Threshold: PageRank > mean + 2 * stdev
        """
        if len(self.G.nodes) == 0:
            return

        pr = self._pagerank(self.G, weight="amount")

        values = list(pr.values())
        if len(values) < 2:
            return

        mean = statistics.mean(values)
        stdev = statistics.stdev(values)
        threshold = mean + 2 * stdev

        # Normalise to 0–100 relative to the max value
        max_val = max(values)
        for node, score in pr.items():
            normalised = (score / max_val) * 100 if max_val > 0 else 0
            self._pagerank_scores[node] = normalised

            if score > threshold:
                self.G.nodes[node]["pagerank_anomaly"] = True

    # ─────────────────────────────────────────────
    # DETECTION METHOD 4: TEMPORAL BURST
    # ─────────────────────────────────────────────

    def detect_temporal_burst(self):
        """
        Detect accounts that receive 10+ transactions in any 30-minute window,
        OR more than 3× their own average transaction rate.
        """
        for node in self.G.nodes:
            in_edges = [
                (d["timestamp"], d)
                for _, _, d in self.G.in_edges(node, data=True)
                if "timestamp" in d
            ]
            if not in_edges:
                continue

            in_edges.sort(key=lambda x: x[0])
            timestamps = [
                datetime.fromisoformat(ts) for ts, _ in in_edges
            ]

            total = len(timestamps)
            window = timedelta(minutes=30)
            max_in_window = 0

            # Sliding window
            left = 0
            for right in range(total):
                while timestamps[right] - timestamps[left] > window:
                    left += 1
                count = right - left + 1
                if count > max_in_window:
                    max_in_window = count

            avg_per_window = total / max(
                1,
                (timestamps[-1] - timestamps[0]).total_seconds() / window.total_seconds(),
            )

            if max_in_window >= 10 or (max_in_window >= 5 and avg_per_window > 0 and max_in_window > 3 * avg_per_window):
                self._burst_nodes.add(node)
                self.G.nodes[node]["burst"] = True

                alert = {
                    "id": str(uuid.uuid4()),
                    "type": "burst_transfer",
                    "accounts": [node],
                    "total_amount": round(
                        sum(d.get("amount", 0) for _, _, d in self.G.in_edges(node, data=True)),
                        2,
                    ),
                    "risk_score": 85,
                    "timestamp": timestamps[-1].isoformat(),
                    "subgraph": self.get_subgraph([node]),
                }
                self.alerts.append(alert)

    # ─────────────────────────────────────────────
    # COMPOSITE RISK SCORES
    # ─────────────────────────────────────────────

    def calculate_risk_scores(self):
        """
        Composite risk score per node (0–100):
          30% cycle involvement
          25% community isolation
          20% PageRank anomaly
          15% temporal burst
          10% neighbour risk propagation  (2 passes)
        """
        nodes = list(self.G.nodes)

        # First pass — base scores (no propagation yet)
        for node in nodes:
            cycle_s  = 100.0 if node in self._cycle_nodes else 0.0
            comm_s   = self._community_scores.get(node, 0.0)
            pr_s     = self._pagerank_scores.get(node, 0.0)
            burst_s  = 100.0 if node in self._burst_nodes else 0.0
            neighbor_s = 0.0  # populated in propagation passes

            score = (
                0.30 * cycle_s
                + 0.25 * comm_s
                + 0.20 * pr_s
                + 0.15 * burst_s
                + 0.10 * neighbor_s
            )
            self.risk_scores[node] = min(100.0, max(0.0, score))

        # Propagation passes (2 iterations)
        for _ in range(2):
            new_scores: dict[str, float] = {}
            for node in nodes:
                neighbors = list(self.G.predecessors(node)) + list(self.G.successors(node))
                if neighbors:
                    neighbor_avg = statistics.mean(
                        self.risk_scores.get(n, 0.0) for n in neighbors
                    )
                else:
                    neighbor_avg = 0.0

                cycle_s = 100.0 if node in self._cycle_nodes else 0.0
                comm_s  = self._community_scores.get(node, 0.0)
                pr_s    = self._pagerank_scores.get(node, 0.0)
                burst_s = 100.0 if node in self._burst_nodes else 0.0

                score = (
                    0.30 * cycle_s
                    + 0.25 * comm_s
                    + 0.20 * pr_s
                    + 0.15 * burst_s
                    + 0.10 * neighbor_avg
                )
                new_scores[node] = min(100.0, max(0.0, score))

            self.risk_scores = new_scores

    # ─────────────────────────────────────────────
    # OUTPUT METHODS
    # ─────────────────────────────────────────────

    def _risk_level(self, score: float) -> str:
        if score <= 20:
            return "clean"
        elif score <= 50:
            return "watch"
        elif score <= 75:
            return "suspicious"
        else:
            return "fraud"

    def get_graph_json(self) -> dict:
        """
        Returns the full graph as JSON-serialisable dict.
        {
          "nodes": [{id, name, risk_score, risk_level, account_type}],
          "edges": [{source, target, amount, timestamp, tx_type, tx_id}]
        }
        """
        nodes = []
        for node_id, data in self.G.nodes(data=True):
            score = self.risk_scores.get(node_id, 0.0)
            nodes.append({
                "id":           node_id,
                "name":         data.get("name", ""),
                "risk_score":   round(score, 2),
                "risk_level":   self._risk_level(score),
                "account_type": data.get("account_type", "personal"),
            })

        edges = []
        for src, dst, data in self.G.edges(data=True):
            edges.append({
                "source":    src,
                "target":    dst,
                "tx_id":     data.get("tx_id", ""),
                "amount":    data.get("amount", 0),
                "timestamp": data.get("timestamp", ""),
                "tx_type":   data.get("tx_type", ""),
            })

        return {"nodes": nodes, "edges": edges}

    def get_alerts(self) -> list[dict]:
        """Returns all detected fraud alerts (without embedded subgraphs to keep payload small)."""
        return [
            {k: v for k, v in alert.items() if k != "subgraph"}
            for alert in self.alerts
        ]

    def get_subgraph(self, account_ids: list[str]) -> dict:
        """
        Returns nodes + edges for the given accounts plus their direct neighbours.
        Used for the AI explanation panel.
        """
        account_set = set(account_ids)

        # Expand to include direct neighbours
        for acc in list(account_set):
            if acc in self.G:
                account_set.update(self.G.predecessors(acc))
                account_set.update(self.G.successors(acc))

        sub_nodes = []
        for node_id in account_set:
            if node_id not in self.G:
                continue
            data = self.G.nodes[node_id]
            score = self.risk_scores.get(node_id, 0.0)
            sub_nodes.append({
                "id":           node_id,
                "name":         data.get("name", ""),
                "risk_score":   round(score, 2),
                "risk_level":   self._risk_level(score),
                "account_type": data.get("account_type", "personal"),
            })

        sub_edges = []
        for src, dst, data in self.G.edges(data=True):
            if src in account_set and dst in account_set:
                sub_edges.append({
                    "source":    src,
                    "target":    dst,
                    "tx_id":     data.get("tx_id", ""),
                    "amount":    data.get("amount", 0),
                    "timestamp": data.get("timestamp", ""),
                    "tx_type":   data.get("tx_type", ""),
                })

        return {"nodes": sub_nodes, "edges": sub_edges}

    def get_risk_scores(self) -> dict[str, float]:
        """Returns {account_id: risk_score} for all nodes."""
        return {k: round(v, 2) for k, v in self.risk_scores.items()}

    def add_transaction(self, txn: dict):
        """
        Dynamically add a single transaction during real-time simulation.
        Updates node attributes and re-flags obvious fraud types.
        """
        src = txn.get("from_account")
        dst = txn.get("to_account")
        if not src or not dst:
            return

        # Ensure nodes exist
        for acc in (src, dst):
            if acc not in self.G:
                self.G.add_node(acc, name="", account_type="personal")

        self.G.add_edge(
            src, dst,
            key=txn.get("id", str(uuid.uuid4())),
            tx_id=txn.get("id", ""),
            amount=txn.get("amount", 0),
            timestamp=txn.get("timestamp", ""),
            tx_type=txn.get("tx_type", ""),
            is_fraud=txn.get("is_fraud", 0),
        )

    def check_new_alerts(self) -> list[dict]:
        """
        Lightweight incremental check for new fraud patterns after each transaction.
        Re-runs detection and returns alerts that weren't previously emitted.
        Full re-detection is too slow for real-time; in production this would be
        incremental. For demo: return new alerts since last call.
        """
        old_count = len(self.alerts)
        # Lightweight re-score only (skip expensive community detection)
        self.detect_cycles()
        self.detect_temporal_burst()
        self.calculate_risk_scores()
        return self.alerts[old_count:]
