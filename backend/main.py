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
# Account metadata for replay — populated by demo_start so the replay engine
# can add nodes with proper name/account_type instead of bare defaults.
demo_account_meta: dict[str, dict] = {}


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


class DemoConfig(BaseModel):
    n_accounts:    int = 100
    n_transactions: int = 500
    n_circular:    int = 3
    n_structuring: int = 2
    n_burst:       int = 2
    seed:          int | None = None


# ─────────────────────────────────────────────
# REST ENDPOINTS
# ─────────────────────────────────────────────

@app.post("/db2/load")
async def db2_load():
    """
    Load data from IBM Db2 (falls back to SQLite if unavailable) and
    broadcast a demo_reset so all WS clients replay it live.
    """
    global engine, all_transactions, demo_account_meta

    from backend.db2_client import load_transactions_with_fallback

    accounts, txns, source = load_transactions_with_fallback()

    demo_account_meta = {a["id"]: a for a in accounts}
    txns_ordered = sorted(txns, key=lambda t: t["is_fraud"])
    engine = FraudGraphEngine(str(DB_PATH))
    engine.load_from_data(accounts, txns_ordered)
    engine.calculate_risk_scores()
    all_transactions = sorted(txns, key=lambda t: t["timestamp"])

    print(f"  Db2 load ({source}): {engine.G.number_of_nodes()} nodes, "
          f"{engine.G.number_of_edges()} edges, {len(engine.alerts)} alerts")

    msg = {"type": "demo_reset"}
    dead: set[WebSocket] = set()
    for ws in list(connected_clients):
        try:
            await ws.send_json(msg)
        except Exception:
            dead.add(ws)
    connected_clients.difference_update(dead)

    return {
        "status":  "ok",
        "source":  source,
        "nodes":   engine.G.number_of_nodes(),
        "edges":   engine.G.number_of_edges(),
        "alerts":  len(engine.alerts),
    }


@app.get("/db2/status")
async def db2_status():
    """Check IBM Db2 connection and return row counts."""
    try:
        from backend.db2_client import get_db2_connection, get_counts, DB2_DSN
        if not DB2_DSN:
            return {"connected": False, "reason": "no_credentials"}
        conn   = get_db2_connection()
        counts = get_counts(conn)
        return {
            "connected":    True,
            "accounts":     counts["accounts"],
            "transactions": counts["transactions"],
        }
    except Exception as e:
        return {"connected": False, "reason": str(e)}


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


@app.post("/demo/start")
async def demo_start(config: DemoConfig):
    """
    Reset the graph engine with in-memory demo data and broadcast to all WS clients.
    """
    global engine, all_transactions

    from backend.demo_generator import generate_demo_data
    import networkx as nx

    accounts, txns = generate_demo_data(
        n_accounts=config.n_accounts,
        n_transactions=config.n_transactions,
        n_circular=config.n_circular,
        n_structuring=config.n_structuring,
        n_burst=config.n_burst,
        seed=config.seed,
    )

    # Reset engine with demo data.
    # Sort so normal txns (is_fraud=0) load first; fraud txns (is_fraud=1) load last.
    # DiGraph keeps the last edge for any (src, dst) pair, so fraud edges won't be
    # silently overwritten by a normal transaction on the same node pair.
    global demo_account_meta
    demo_account_meta = {a["id"]: a for a in accounts}

    txns_ordered = sorted(txns, key=lambda t: t["is_fraud"])
    engine = FraudGraphEngine(str(DB_PATH))
    engine.load_from_data(accounts, txns_ordered)
    engine.calculate_risk_scores()

    # Use demo transactions as the replay source — sorted oldest→newest so
    # fraud edges (recent timestamps) arrive at the end, exactly when detection fires.
    all_transactions = sorted(txns, key=lambda t: t["timestamp"])

    print(f"  Demo mode: {engine.G.number_of_nodes()} nodes, "
          f"{engine.G.number_of_edges()} edges, "
          f"{len(engine.alerts)} alerts")

    # Broadcast reset to all connected WebSocket clients
    msg = {"type": "demo_reset"}
    dead: set[WebSocket] = set()
    for ws in list(connected_clients):
        try:
            await ws.send_json(msg)
        except Exception:
            dead.add(ws)
    connected_clients.difference_update(dead)

    return {
        "status": "ok",
        "nodes": engine.G.number_of_nodes(),
        "edges": engine.G.number_of_edges(),
        "alerts": len(engine.alerts),
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
        # Send an initial snapshot: nodes only (with proper metadata) but
        # all risk scores reset to 0 and NO edges.  The replay task will
        # stream transactions one-by-one so the graph and fraud alerts
        # appear to build up live — nothing is pre-detected or pre-blasted.
        graph_data = engine.get_graph_json()
        clean_nodes = [
            {**n, "risk_score": 0.0, "risk_level": "clean"}
            for n in graph_data["nodes"]
        ]
        await websocket.send_json({
            "type": "snapshot",
            "data": {"nodes": clean_nodes, "edges": []},
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
    Replay transactions in chronological order (~40 tx/s).

    Normal transactions (older timestamps) arrive first; fraud transactions
    (recent timestamps) arrive at the end — exactly when detection fires.

    Detection runs every 30 edges.  Alerts and risk_update messages are only
    sent when freshly detected, so the frontend sees them build up live.
    """
    if not all_transactions:
        return

    import networkx as nx

    # Fresh replay engine — no pre-loaded data, discovers everything from scratch
    replay_engine = FraudGraphEngine(str(DB_PATH))
    replay_engine.G = nx.DiGraph()

    emitted_alert_ids: set[str] = set()   # nothing pre-emitted

    try:
        for txn in all_transactions:
            if not _is_connected(websocket):
                break

            await asyncio.sleep(0.025)   # ~40 transactions / second

            # Add transaction, restoring proper node metadata from demo accounts
            replay_engine.add_transaction(txn)
            for acc_id in (txn["from_account"], txn["to_account"]):
                meta = demo_account_meta.get(acc_id, {})
                if meta and acc_id in replay_engine.G:
                    replay_engine.G.nodes[acc_id].update({
                        "name":         meta.get("name", ""),
                        "account_type": meta.get("account_type", "personal"),
                    })

            await websocket.send_json({"type": "transaction", "data": txn})

            # Every 30 edges: run detection, emit any new alerts + risk update
            if replay_engine.G.number_of_edges() % 30 == 0:
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

        # ── Post-replay: final pass with the fully-built engine ──────────────
        # Run detection one more time in case the last batch didn't hit the
        # modulo boundary, then send a final authoritative risk update.
        final_alerts = replay_engine.check_new_alerts()
        for alert in final_alerts:
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

    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception as e:
        print(f"  Replay error: {e}")


def _is_connected(websocket: WebSocket) -> bool:
    return websocket in connected_clients
