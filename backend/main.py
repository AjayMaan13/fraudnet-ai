"""
FraudNet-AI — FastAPI Backend
Serves graph data, fraud alerts, and streams real-time transactions via WebSocket.

Run from repo root:
    python3 -m uvicorn backend.main:app --reload --port 8000
"""

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.graph_engine import FraudGraphEngine

# ─────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────

REPO_ROOT = Path(__file__).parent.parent
DB_PATH   = REPO_ROOT / "data-gen" / "transactions.db"
JSON_PATH = REPO_ROOT / "data-gen" / "transactions.json"

# ─────────────────────────────────────────────
# GLOBAL STATE
# ─────────────────────────────────────────────

engine: FraudGraphEngine
start_time: float
all_transactions: list[dict] = []
connected_clients: set[WebSocket] = set()


# ─────────────────────────────────────────────
# STARTUP / SHUTDOWN
# ─────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global engine, start_time, all_transactions

    start_time = time.time()

    print("Loading graph from database...")
    engine = FraudGraphEngine(str(DB_PATH))

    try:
        from backend.db2_client import load_transactions_with_fallback
        accounts, txns, db_source = load_transactions_with_fallback()
        engine.load_from_data(accounts, txns)
        print(f"  Source: {db_source.upper()}")
    except Exception as e:
        print(f"  Db2 client error ({e}) — falling back to SQLite")
        engine.load_from_db()

    engine.calculate_risk_scores()
    print(f"  Graph ready: {engine.G.number_of_nodes()} nodes, "
          f"{engine.G.number_of_edges()} edges, "
          f"{len(engine.alerts)} alerts")

    # Load transaction list for simulator replay
    if JSON_PATH.exists():
        with open(JSON_PATH) as f:
            data = json.load(f)
        all_transactions = data.get("transactions", [])
        all_transactions.sort(key=lambda t: t["timestamp"])
        print(f"  Simulator ready: {len(all_transactions)} transactions loaded")
    else:
        print("  WARNING: transactions.json not found — simulator disabled")

    yield
    # Shutdown
    connected_clients.clear()


# ─────────────────────────────────────────────
# APP
# ─────────────────────────────────────────────

app = FastAPI(title="FraudNet-AI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────
# REQUEST / RESPONSE MODELS
# ─────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    account_ids: list[str]


# ─────────────────────────────────────────────
# REST ENDPOINTS
# ─────────────────────────────────────────────

@app.get("/graph")
async def get_graph():
    """Full graph: nodes with risk scores + all edges."""
    return engine.get_graph_json()


@app.get("/alerts")
async def get_alerts():
    """List of all detected fraud alerts (no embedded subgraphs)."""
    return engine.get_alerts()


@app.get("/alerts/{alert_id}")
async def get_alert(alert_id: str):
    """Single alert detail including its subgraph."""
    for alert in engine.alerts:
        if alert["id"] == alert_id:
            return alert
    raise HTTPException(status_code=404, detail="Alert not found")


@app.post("/analyze")
async def analyze(req: AnalyzeRequest):
    """
    Returns an AI fraud explanation for the given account IDs.
    Calls watsonx.ai if available, otherwise returns a cached response.
    """
    subgraph = engine.get_subgraph(req.account_ids)

    try:
        from backend.watsonx_client import get_fraud_explanation
        result = await get_fraud_explanation(subgraph)
        return result
    except Exception as e:
        print(f"  watsonx unavailable ({e}), returning cached response")
        result = _cached_explanation(subgraph)
        result["source"] = "cached"
        return result


def _cached_explanation(subgraph: dict) -> dict:
    """Return a pre-canned explanation based on fraud type detected in subgraph."""
    cache_path = Path(__file__).parent / "watsonx_cache.json"
    if cache_path.exists():
        with open(cache_path) as f:
            cache = json.load(f)

        # Pick the best match based on nodes present
        node_ids = {n["id"] for n in subgraph.get("nodes", [])}
        for entry in cache:
            return entry  # return first for now; Step 5 will refine matching

    # Absolute fallback
    return {
        "fraud_type": "Suspicious Activity",
        "confidence": "Medium",
        "evidence": [
            "Unusual transaction pattern detected",
            "Account connections match known fraud topology",
        ],
        "recommendations": [
            "Flag accounts for manual review",
            "Freeze outbound transfers pending investigation",
        ],
    }


@app.get("/stats")
async def get_stats():
    """Dashboard stats bar data."""
    fraud_alerts = engine.get_alerts()
    fraud_rings  = sum(1 for a in fraud_alerts if a["type"] == "circular_flow")
    flagged_amt  = sum(a.get("total_amount", 0) for a in fraud_alerts)
    uptime_secs  = int(time.time() - start_time)

    return {
        "total_txns":      engine.G.number_of_edges(),
        "active_accounts": engine.G.number_of_nodes(),
        "fraud_rings":     fraud_rings,
        "flagged_amount":  round(flagged_amt, 2),
        "uptime":          uptime_secs,
    }


# ─────────────────────────────────────────────
# WEBSOCKET — REAL-TIME STREAM
# ─────────────────────────────────────────────

@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    print(f"  WebSocket client connected ({len(connected_clients)} total)")

    try:
        # Send initial graph snapshot
        await websocket.send_json({
            "type": "snapshot",
            "data": engine.get_graph_json(),
        })

        # Start replay in background
        replay_task = asyncio.create_task(replay_transactions(websocket))

        # Keep connection alive — wait for client disconnect
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send a heartbeat ping
                await websocket.send_json({"type": "ping"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"  WebSocket error: {e}")
    finally:
        connected_clients.discard(websocket)
        if "replay_task" in dir() and not replay_task.done():
            replay_task.cancel()
        print(f"  WebSocket client disconnected ({len(connected_clients)} remaining)")


async def replay_transactions(websocket: WebSocket):
    """
    Replay all transactions in timestamp order, simulating real-time ingestion.
    Time compression: 7 days of data → ~10 minutes of replay
      7 days = 604,800 seconds → divide by 1000 → sleep ~0.6s per simulated 10min block
    We batch by time buckets and sleep 0.05s per tx (~20 tx/s feels live).
    """
    if not all_transactions:
        return

    # Track which alerts have been emitted already
    emitted_alert_ids: set[str] = set()
    for a in engine.alerts:
        emitted_alert_ids.add(a["id"])  # pre-existing alerts already in snapshot

    # Build a fresh engine for incremental replay
    replay_engine = FraudGraphEngine(str(DB_PATH))
    # Start with empty graph — we add transactions one by one
    import networkx as nx
    replay_engine.G = nx.DiGraph()

    try:
        for txn in all_transactions:
            if not _is_connected(websocket):
                break

            await asyncio.sleep(0.05)  # ~20 transactions/second

            # Add to replay graph
            replay_engine.add_transaction(txn)

            # Send transaction event
            await websocket.send_json({
                "type": "transaction",
                "data": txn,
            })

            # Every 50 transactions, check for new fraud alerts and send risk update
            if replay_engine.G.number_of_edges() % 50 == 0:
                new_alerts = replay_engine.check_new_alerts()
                for alert in new_alerts:
                    if alert["id"] not in emitted_alert_ids:
                        emitted_alert_ids.add(alert["id"])
                        await websocket.send_json({
                            "type": "alert",
                            "data": {k: v for k, v in alert.items() if k != "subgraph"},
                        })
                        await websocket.send_json({
                            "type": "risk_update",
                            "data": replay_engine.get_risk_scores(),
                        })

        # Final risk update after all transactions
        await websocket.send_json({
            "type": "risk_update",
            "data": engine.get_risk_scores(),
        })

        # Emit any alerts that the pre-loaded engine found but weren't sent during replay
        for alert in engine.alerts:
            if alert["id"] not in emitted_alert_ids:
                await websocket.send_json({
                    "type": "alert",
                    "data": {k: v for k, v in alert.items() if k != "subgraph"},
                })

    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception as e:
        print(f"  Replay error: {e}")


def _is_connected(websocket: WebSocket) -> bool:
    return websocket in connected_clients
