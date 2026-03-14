# FraudNet-AI — Implementation Notes (Agent Reference)

> **Last updated:** 2026-03-14 10:46 AM
> **Hackathon ends:** Sunday March 15, ~10:30 AM
> **Time remaining:** ~24 hours

---

## ⚠️ REPO STATE (as of notes creation)

```
fraudnet-ai/
├── backend/          ← EMPTY (only has a spurious `path/` dir from bad venv command — ignore/delete it)
├── data-gen/         ← EMPTY
├── frontend/
│   ├── fraudnet-ai/  ← ✅ Next.js 15 + Tailwind + TypeScript app lives HERE
│   └── node_modules/ ← d3 was installed here (wrong dir — reinstall inside frontend/fraudnet-ai/)
├── instructions.md
└── IMPLEMENTATION_NOTES.md
```

### Key path facts:
- **Frontend root:** `/Users/goraya/AJ/Github OOS/fraudnet-ai/frontend/fraudnet-ai/`
  - Next.js 15, TypeScript, Tailwind CSS, App Router
  - **d3 is NOT installed here yet** — `npm install d3 @types/d3` must be run inside `frontend/fraudnet-ai/`
- **Backend root:** `/Users/goraya/AJ/Github OOS/fraudnet-ai/backend/`
  - Python deps installed globally (fastapi, uvicorn, networkx, faker, python-dotenv, httpx, websockets)
  - No venv — run scripts directly with `python3`
- **Data gen root:** `/Users/goraya/AJ/Github OOS/fraudnet-ai/data-gen/`

---

## STEP 2 — Data Generator

**File:** `data-gen/generate.py`
**Run:** `python3 data-gen/generate.py`
**Output:** `data-gen/transactions.db` (SQLite) + `data-gen/transactions.json`

### Schema
```sql
CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at TEXT,
    account_type TEXT  -- 'personal', 'business', 'mule'
);

CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    from_account TEXT,
    to_account TEXT,
    amount REAL,
    timestamp TEXT,
    tx_type TEXT,      -- 'salary','rent','grocery','peer','subscription','fraud_circular','fraud_fanout','fraud_burst'
    is_fraud INTEGER   -- 0 or 1
);
```

### Generation parameters
- **500 accounts** (450 normal, 50 mule/fraud-ring accounts)
- **5000+ transactions** total: 80% normal, 20% fraud
- Timestamps: spread over last 7 days, fraud events clustered in last 24h

### Normal transaction types
| type | amount | frequency |
|------|--------|-----------|
| salary | $2000–$8000 | bi-weekly |
| rent | $800–$2500 | monthly |
| grocery | $30–$200 | 2–3x/week |
| peer | $10–$500 | random |
| subscription | $5–$50 | monthly |

### Fraud Pattern 1: Circular Flow (Laundering)
- Pick 4–6 accounts: A→B→C→D→A
- Each hop: amount * 0.92 (8% laundering fee)
- Total cycled: $10,000–$50,000
- All timestamps within a 2–4 hour window
- Tag all with `tx_type='fraud_circular'`, `is_fraud=1`
- **Inject 3 separate rings** with different account sets

### Fraud Pattern 2: Fan-Out / Fan-In (Structuring / Smurfing)
- Source account sends $9,500 to 5 different accounts (just under $10K)
- Those 5 accounts all send to 1 collection account within 6 hours
- Tag with `tx_type='fraud_fanout'`, `is_fraud=1`
- **Inject 2 separate fan-out events**

### Fraud Pattern 3: Burst Transfers (Mule Network)
- A new account (age < 7 days) receives large deposit ($20,000+)
- Then sends 10+ small transfers ($500–$2,000 each) to 10+ different accounts within 30 minutes
- Receiving accounts are also newly created
- Tag with `tx_type='fraud_burst'`, `is_fraud=1`
- **Inject 2 separate burst events**

### Implementation notes
- Use `faker.Faker()` for names, UUIDs for IDs
- Use `sqlite3` (stdlib) — no extra deps
- Also dump ALL transactions to `transactions.json` (list of dicts) for frontend demo fallback
- Add a `--replay` flag concept: transactions have realistic timestamps so the simulator can replay them in order

---

## STEP 3 — Graph Engine

**File:** `backend/graph_engine.py`
**Class:** `FraudGraphEngine`

### Dependencies
```python
import networkx as nx
from networkx.algorithms.community import louvain_communities
import sqlite3, json, math, statistics
from datetime import datetime, timedelta
```

### Core data structure
```python
class FraudGraphEngine:
    def __init__(self, db_path: str):
        self.G = nx.DiGraph()   # directed graph: edges = transactions
        self.risk_scores = {}   # account_id -> float (0–100)
        self.alerts = []        # list of detected fraud events
        self.db_path = db_path
```

### Method: `load_from_db()`
- Read all transactions from SQLite
- For each transaction: `G.add_edge(from_acc, to_acc, amount=x, timestamp=y, tx_type=z, is_fraud=f)`
- For each account: `G.add_node(acc_id, name=..., account_type=...)`
- Call all detection methods after loading

### Detection Method 1: `detect_cycles()`
```python
# Use nx.simple_cycles(G)
# Filter: cycle length 3–8, total edge weight > $5,000, all edges within 24h window
# For each valid cycle: create alert, mark all nodes as fraud_cycle=True
```

### Detection Method 2: `detect_communities()`
```python
# Convert to undirected for Louvain: G_undirected = G.to_undirected()
# communities = louvain_communities(G_undirected)
# Flag communities where:
#   - size >= 4 nodes
#   - internal edge density > 0.6 (many internal transactions)
#   - external connections < 2 (isolated cluster)
# Create alert for flagged communities
```

### Detection Method 3: `detect_pagerank_anomaly()`
```python
# pr = nx.pagerank(G, weight='amount')
# mean, stdev = statistics.mean(pr.values()), statistics.stdev(pr.values())
# Flag nodes where pr[node] > mean + 2*stdev
# These are accounts receiving disproportionate fund flows
```

### Detection Method 4: `detect_temporal_burst()`
```python
# For each node: get all incoming edges sorted by timestamp
# Sliding 30-minute window: count transactions
# If count in window > 10 OR count > 3x the node's average rate → flag as burst
```

### Composite Risk Score: `calculate_risk_scores()`
```python
# For each node:
risk = (
    0.30 * cycle_involvement_score +    # 0 or 100 if in a cycle
    0.25 * community_isolation_score +   # 0–100 based on community density
    0.20 * pagerank_anomaly_score +      # 0–100 normalized PR deviation
    0.15 * temporal_burst_score +        # 0 or 100 if burst detected
    0.10 * neighbor_risk_avg             # avg risk of direct neighbors (propagation)
)
self.risk_scores[node] = min(100, max(0, risk))
```
- Recalculate neighbor_risk iteratively (2–3 passes) so propagation flows through the graph

### Output methods
```python
def get_graph_json(self) -> dict:
    # Returns: {"nodes": [{id, name, risk_score, risk_level, account_type}], 
    #           "edges": [{source, target, amount, timestamp, tx_type}]}
    # risk_level: "clean"(0-20), "watch"(21-50), "suspicious"(51-75), "fraud"(76-100)

def get_alerts(self) -> list:
    # Returns list of alert dicts: {id, type, accounts, total_amount, risk_score, timestamp, subgraph}

def get_subgraph(self, account_ids: list) -> dict:
    # Returns nodes+edges for just those accounts + their neighbors
    # Used for the AI explanation panel
```

---

## STEP 4 — FastAPI Backend

**File:** `backend/main.py`
**Run:** `python3 -m uvicorn backend.main:app --reload --port 8000`
(or `cd backend && uvicorn main:app --reload --port 8000`)

### Startup
```python
# On startup: create FraudGraphEngine(), load_from_db(), calculate_risk_scores()
# Store as global `engine` instance
```

### Endpoints

```
GET  /graph                    → full graph JSON (nodes + edges + risk scores)
GET  /alerts                   → list of all detected fraud alerts
GET  /alerts/{alert_id}        → single alert detail + subgraph
POST /analyze                  → body: {account_ids: list} → calls watsonx.ai, returns explanation
GET  /stats                    → {total_txns, active_accounts, fraud_rings, flagged_amount, uptime}
WebSocket /ws/stream           → streams new transactions + alert events in real time
```

### WebSocket `/ws/stream` behavior
- On connect: send current graph snapshot
- Then replay transactions from `transactions.json` in timestamp order
- Sleep between sends to simulate real-time (compress time: 1 real hour = 3 real seconds)
- When a fraud event's transactions are sent, emit a special `{"type": "alert", "data": {...}}` message
- Message types: `"snapshot"`, `"transaction"`, `"alert"`, `"risk_update"`

### CORS
```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], allow_methods=["*"], allow_headers=["*"])
```

---

## STEP 5 — watsonx.ai Integration

**File:** `backend/watsonx_client.py`

### Env vars needed (`.env` in backend/)
```
WATSONX_API_KEY=
WATSONX_PROJECT_ID=
WATSONX_URL=https://us-south.ml.cloud.ibm.com
```

### API call
```python
import httpx, os
from dotenv import load_dotenv

GRANITE_MODEL = "ibm/granite-13b-chat-v2"
WATSONX_GENERATE_URL = f"{os.getenv('WATSONX_URL')}/ml/v1/text/generation?version=2023-05-29"

async def get_fraud_explanation(subgraph: dict) -> dict:
    prompt = f"""You are a financial fraud analyst. Analyze the following transaction subgraph and provide:
(1) the likely fraud type (circular laundering / structuring / mule network / other)
(2) confidence level (High/Medium/Low)
(3) key evidence from the transaction pattern (2-3 bullet points)
(4) recommended investigation steps (2-3 bullet points)

Transaction data: {json.dumps(subgraph, indent=2)}

Respond in JSON format with keys: fraud_type, confidence, evidence, recommendations"""
    # POST to WATSONX_GENERATE_URL with Bearer auth header
    # model_id: GRANITE_MODEL, input: prompt, parameters: {max_new_tokens: 500, temperature: 0.1}
```

### Cache fallback
```python
# Store 3 pre-generated responses in backend/watsonx_cache.json
# If API call fails/times out (>5s): return cached response matching fraud type
# Always log whether response was live or cached
```

### watsonx_cache.json structure
```json
[
  {"fraud_type": "Circular Money Laundering", "confidence": "High",
   "evidence": ["4 accounts form a closed loop with $48K cycled", "..."],
   "recommendations": ["Freeze all 4 accounts immediately", "..."]},
  {"fraud_type": "Structuring / Smurfing", ...},
  {"fraud_type": "Money Mule Network", ...}
]
```

---

## STEP 6 — Frontend Dashboard

**Directory:** `frontend/fraudnet-ai/`
**Stack:** Next.js 15, TypeScript, Tailwind CSS, D3.js
**Run:** `cd frontend/fraudnet-ai && npm run dev` → http://localhost:3000

### First: install d3 in the RIGHT directory
```bash
cd frontend/fraudnet-ai
npm install d3 @types/d3
```

### File structure to build
```
frontend/fraudnet-ai/app/
├── page.tsx                    ← main dashboard (replaces default)
├── layout.tsx                  ← keep existing, update title/meta
├── globals.css                 ← dark theme base styles
└── components/
    ├── GraphView.tsx           ← D3.js force-directed graph (HERO COMPONENT)
    ├── AlertFeed.tsx           ← real-time scrolling alert list
    ├── AIExplanation.tsx       ← watsonx.ai analysis display panel
    ├── StatsBar.tsx            ← header stats bar
    └── useWebSocket.ts         ← custom hook for WebSocket connection
```

### Color system (use these exact hex codes everywhere)
```
Clean (0-20):      #3B82F6  (blue-500)
Watch (21-50):     #EAB308  (yellow-500)
Suspicious (51-75):#F97316  (orange-500)
Fraud (76-100):    #EF4444  (red-500)
Background:        #0F0F11  (near-black)
Panel bg:          #1A1A2E  (dark navy)
Panel border:      #2D2D44
Text primary:      #E2E8F0
Text muted:        #64748B
```

### Dashboard layout (CSS Grid)
```
┌─────────────────────────────────────────────────────┐
│  StatsBar (full width header)                        │
├──────────────────────────────┬──────────────────────┤
│                              │  AlertFeed           │
│  GraphView (D3.js)           │  (scrolling list)    │
│                              ├──────────────────────┤
│  (60% width, full height)    │  AIExplanation       │
│                              │  (watsonx panel)     │
└──────────────────────────────┴──────────────────────┘
```

### GraphView.tsx — D3.js implementation notes
```typescript
// Use useEffect + useRef to attach D3 to a <svg> element
// D3 force simulation:
//   forceLink (edges, distance based on amount)
//   forceManyBody (repulsion: -300)
//   forceCenter (SVG center)
//   forceCollide (node radius + 5)
//
// Nodes: <circle> sized by transaction volume (degree), colored by risk_score
// Edges: <line> thickness = log(amount) / 8, opacity 0.4
//
// On WebSocket "risk_update" message:
//   → transition node fill color over 800ms
//   → add "pulse" animation to fraud nodes (CSS keyframe: scale 1 → 1.3 → 1)
//
// On alert click from AlertFeed:
//   → zoom D3 to centered on those node positions (d3.zoom().translateTo())
//   → highlight those nodes with white stroke border
//
// Performance: cap rendered nodes at 300 (show highest-risk ones if > 300)
// Tooltip on hover: show account ID, risk score, transaction count
```

### useWebSocket.ts hook
```typescript
// Connect to ws://localhost:8000/ws/stream
// Parse incoming messages by type:
//   "snapshot"    → set initial nodes+edges
//   "transaction" → add edge, update source/target nodes
//   "alert"       → push to alerts array
//   "risk_update" → update node risk scores (triggers color transitions)
// Reconnect with exponential backoff on disconnect
// Expose: { nodes, edges, alerts, stats, isConnected }
```

### AlertFeed.tsx
```typescript
// Scrolling div, newest alert at top
// Each alert card shows:
//   - Fraud type badge (colored by type)
//   - Accounts involved (truncated IDs)
//   - Total amount formatted as currency
//   - Risk score as a colored number
//   - Timestamp (relative: "2 minutes ago")
// onClick: call parent's onAlertSelect(alert) 
//   → GraphView zooms to those nodes
//   → AIExplanation fetches analysis for those accounts
```

### AIExplanation.tsx
```typescript
// Shows when an alert is selected
// Calls GET /analyze with {account_ids: [...]}
// Loading state: animated skeleton
// Display: 
//   - Fraud type + confidence badge
//   - Evidence bullets
//   - Recommendations bullets
//   - Small "Powered by IBM watsonx.ai" badge (bottom right)
// If no alert selected: show "Select an alert to see AI analysis"
```

### StatsBar.tsx
```typescript
// Fixed top header, dark bg
// Shows 5 stats updated in real time via WebSocket "stats" messages:
//   - Total Transactions Processed
//   - Active Accounts
//   - Fraud Rings Detected  ← this number going up is the money shot
//   - Total Flagged Amount ($)
//   - System Uptime
// FraudNet-AI logo/name on left
// Connection status indicator (green dot = live, red = reconnecting)
```

---

## STEP 7 — IBM Db2 Integration (for category requirement)

**File:** `backend/db2_client.py`

### Env vars
```
DB2_DSN=DATABASE=BLUDB;HOSTNAME=xxx.databases.appdomain.cloud;PORT=30756;PROTOCOL=TCPIP;UID=xxx;PWD=xxx;Security=SSL
```

### Implementation strategy
- Write full `db2_client.py` with real IBM `ibm_db` library calls
- **Create the transactions table** in Db2 with same schema as SQLite
- **Load the generated data into Db2** (insert all transactions)
- In `main.py`: try Db2 first, fall back to SQLite with a log message
- This way: **Db2 code is real and visible in repo** even if demo runs on SQLite

### Db2 schema
```sql
CREATE TABLE fraudnet_transactions (
    tx_id VARCHAR(36) NOT NULL PRIMARY KEY,
    from_account VARCHAR(36),
    to_account VARCHAR(36),
    amount DECIMAL(15,2),
    tx_timestamp TIMESTAMP,
    tx_type VARCHAR(30),
    is_fraud SMALLINT
);

CREATE TABLE fraudnet_accounts (
    account_id VARCHAR(36) NOT NULL PRIMARY KEY,
    account_name VARCHAR(100),
    account_type VARCHAR(20),
    created_at TIMESTAMP
);
```

### Install ibm_db (do last, takes a while)
```bash
pip3 install ibm_db
```

---

## STEP 8 — Real-Time Simulation

**File:** `backend/simulator.py`

### Concept
- The WebSocket handler runs `simulator.py` logic in an async background task
- Reads `transactions.json` sorted by timestamp
- Replays them in order, sleeping between each
- Time compression: condense 7 days of data into ~10 minutes of demo
  - 7 days = 604,800 seconds → divide by 1000 → each real second = ~10 minutes of data time
- When crossing into a fraud pattern's time window → emit alert event

### Simulator logic in `main.py`
```python
@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    
    # Send initial snapshot
    await websocket.send_json({"type": "snapshot", "data": engine.get_graph_json()})
    
    # Start replay in background
    asyncio.create_task(replay_transactions(websocket))
    
    # Keep alive, handle disconnect
    ...

async def replay_transactions(websocket):
    txns = load_sorted_transactions()  # from transactions.json
    for txn in txns:
        await asyncio.sleep(0.05)  # ~20 txns/second feels realistic
        engine.add_transaction(txn)  # dynamic graph update
        await websocket.send_json({"type": "transaction", "data": txn})
        
        # Check for new alerts after adding transaction
        new_alerts = engine.check_new_alerts()
        for alert in new_alerts:
            await websocket.send_json({"type": "alert", "data": alert})
            await websocket.send_json({"type": "risk_update", "data": engine.get_risk_scores()})
```

---

## BUILD ORDER & TIME ESTIMATES

| Step | File(s) | Est. Time | Priority |
|------|---------|-----------|----------|
| 2 | `data-gen/generate.py` | 45 min | 🔴 Critical |
| 3 | `backend/graph_engine.py` | 90 min | 🔴 Critical |
| 4 | `backend/main.py` | 45 min | 🔴 Critical |
| 6a | `frontend/.../GraphView.tsx` | 90 min | 🔴 Critical |
| 6b | `frontend/.../AlertFeed.tsx` | 30 min | 🔴 Critical |
| 6c | `frontend/.../StatsBar.tsx` | 20 min | 🟡 Important |
| 6d | `frontend/.../AIExplanation.tsx` | 30 min | 🟡 Important |
| 5 | `backend/watsonx_client.py` | 45 min | 🟡 Important |
| 8 | simulator logic in `main.py` | 45 min | 🟡 Important |
| 7 | `backend/db2_client.py` | 30 min | 🟢 Nice-to-have |

**Total estimate: ~8.5 hours of focused coding**

---

## DEMO SEQUENCE (must work end-to-end)

1. `cd data-gen && python3 generate.py` → generates `transactions.db` + `transactions.json`
2. `cd backend && uvicorn main:app --reload --port 8000` → backend starts, loads graph
3. `cd frontend/fraudnet-ai && npm run dev` → dashboard opens at localhost:3000
4. Dashboard connects via WebSocket → shows initial graph (blue nodes)
5. Transactions start streaming → graph animates
6. Fraud ring transactions arrive → nodes turn yellow → orange → red
7. Alert appears in AlertFeed
8. Click alert → GraphView zooms to fraud cluster → AIExplanation shows watsonx analysis
9. Stats bar shows "Fraud Rings Detected: 1" → "2" → "3"

---

## KNOWN ISSUES TO WATCH FOR

1. **d3 installed in wrong dir** — must run `npm install d3 @types/d3` inside `frontend/fraudnet-ai/`, not `frontend/`
2. **Backend path confusion** — run uvicorn from repo root: `uvicorn backend.main:app` OR from inside `backend/`: `uvicorn main:app`
3. **Next.js App Router** — all components using hooks/client state must have `"use client"` at top
4. **D3 + React SSR conflict** — D3 must only run client-side; wrap D3 logic in `useEffect`, never run at module level
5. **WebSocket in Next.js** — use `"use client"` components, standard browser WebSocket API works fine
6. **Louvain community detection** — requires `pip3 install python-louvain` AND `import community as community_louvain` (networkx has its own but the API differs)
7. **CORS** — FastAPI must allow `http://localhost:3000` explicitly

---

## SUBMISSION CHECKLIST

- [ ] GitHub repo is public, commits only after hackathon start (March 13)
- [ ] README.md: description, tech stack, setup instructions, architecture diagram, screenshots
- [ ] Devpost: Inspiration, Tech Stack, Product Summary, link to GitHub + demo video
- [ ] `backend/db2_client.py` visible with real Db2 schema (even if demo uses SQLite)
- [ ] `backend/watsonx_client.py` visible with real API call code
- [ ] Demo runs fully on localhost (no cloud dependency for live demo)
- [ ] watsonx_cache.json has 3 fallback responses
- [ ] Demo rehearsed 3+ times, timed to exactly 3 minutes
- [ ] Submitted to: TD Fraud Detection, IBM Technology, Top 10 Overall
