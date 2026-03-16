# FraudNet·AI

> Real-time graph intelligence that catches fraud rings before they disappear.

Financial fraud hides in networks, not single transactions. FraudNet·AI makes those patterns visible the moment they happen — streaming live transactions into a 3D force-directed graph, running five parallel detection algorithms, and letting IBM Granite 3 AI explain every finding to investigators in plain language.

Built in 36 hours at **GenAI Genesis 2026** — Canada's largest AI hackathon.

**[Live Demo →](https://fraudnet-ai.vercel.app)** · **[DevPost →](https://devpost.com/AjayMaan13)**

> **Note on IBM integrations:** Both IBM watsonx.ai and IBM Db2 are fully implemented in the codebase (`backend/watsonx_client.py`, `backend/db2_client.py`). They are currently disabled because the IBM Cloud trial tokens were exhausted and the Db2 trial instance expired. The app runs entirely on pre-cached Granite 3 responses and SQLite — no functionality is lost for the demo.

---

## What It Does

Transactions stream over WebSocket into a live 3D WebGL graph. Every 30 edges, the fraud detection engine re-runs and emits alerts as patterns emerge. Click any alert to get a full intelligence report — classification, evidence, regulatory flags, and recommended actions — powered by pre-cached IBM Granite 3 responses (watsonx.ai link broken due to insufficient tokens on IBM Cloud trial).

---

## Fraud Patterns Detected

| Pattern | Algorithm | Criteria |
|---|---|---|
| Circular Money Laundering | Cycle detection (3–8 hops) | Closed loops with >$5K volume within 24h |
| Structuring / Smurfing | Fan-out analysis | Sub-$10K transfers to 5+ recipients in 60 min |
| Burst / Mule Network | Temporal burst detection | Large deposit dispersed to 8+ accounts in 30 min |
| Community Isolation | Louvain clustering | Dense subgraphs with <2 external connections |
| PageRank Anomaly | Weighted PageRank | Accounts receiving disproportionate fund flows (>mean + 2σ) |

**Composite risk score:** 30% cycle involvement + 25% community isolation + 20% PageRank anomaly + 15% temporal burst + 10% neighbour propagation (2 passes)

Risk levels: `clean` (0–20) · `watch` (21–50) · `suspicious` (51–75) · `fraud` (76–100)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind v4, 3d-force-graph (WebGL) |
| Backend | Python 3.11, FastAPI, WebSocket, uvicorn |
| Graph Engine | NetworkX — cycle detection, Louvain, PageRank, sliding-window burst/fanout |
| AI Analysis | IBM watsonx.ai — Granite 3 8B Instruct _(link broken — insufficient tokens on IBM Cloud trial; using pre-cached responses)_ |
| Database | SQLite _(IBM Db2 connection removed to keep the app running)_ |
| Deployment | Railway (backend) · Vercel (frontend) |

---

## Setup

**Backend**
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend/fraudnet-ai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). No data generation step needed — the simulation is configured in the browser.

---

## Environment Variables

### Backend — `backend/.env`

All optional. The app runs fully without them.

```env
# IBM Db2
DB2_HOSTNAME=xxx.databases.appdomain.cloud
DB2_PORT=50001
DB2_DATABASE=BLUDB
DB2_USERNAME=xxx
DB2_PASSWORD=xxx
DB2_SSL=true

# IBM watsonx.ai
WATSONX_API_KEY=your_ibm_cloud_api_key
WATSONX_PROJECT_ID=your_watsonx_project_id
WATSONX_URL=https://ca-tor.ml.cloud.ibm.com
```

### Frontend — `frontend/fraudnet-ai/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Fallbacks:**
- No watsonx.ai credentials → AI explanations use pre-cached Granite responses in `watsonx_cache.json`
- No Db2 credentials or expired instance → falls back to SQLite (`data-gen/transactions.db`) silently

**watsonx.ai setup:**
1. Create a project at [dataplatform.cloud.ibm.com/wx/home](https://dataplatform.cloud.ibm.com/wx/home)
2. Associate a Watson Machine Learning service: project → Manage → Services & integrations
3. Copy the Project ID from: project → Manage → General

---

## IBM Db2 Integration

`backend/db2_client.py` connects to IBM Cloud Db2 with automatic SQLite fallback — no code changes needed when switching between them.

**Schema:**
```sql
fraudnet_accounts      (account_id, account_name, account_type, created_at)
fraudnet_transactions  (tx_id, from_account, to_account, amount, tx_timestamp, tx_type, is_fraud)
```

**Load flow:**
1. On startup, attempt Db2 connection using `.env` credentials
2. If connected: create schema, migrate SQLite data on first run, serve all transactions from Db2
3. If unavailable: fall back to SQLite with a log message — no errors, no config changes

**Runtime API:**
- `POST /db2/load` — reload data and broadcast `demo_reset` to all WebSocket clients
- `GET /db2/status` — connection state and row counts (shown via the IBM Db2 button in the header)

The trial Db2 instance used during development has expired. The SQLite fallback (`data-gen/transactions.db`, included in the repo) handles everything automatically. During development, Db2 stored **5,000 transactions** and **500 accounts** on IBM Cloud (ca-tor region).

---

## Demo Mode

Click **Reconfigure** in the dashboard to open the simulation configurator:

| Control | What it generates |
|---|---|
| Accounts | Up to 300 unique personal/business accounts |
| Transactions | Total normal transaction volume |
| Circular rings | Money laundering cycles (4–6 accounts, $10K–$60K each) |
| Structuring patterns | Sub-$10K fan-out to 6 recipients |
| Burst patterns | $20K–$80K deposit dispersed to 12 accounts |

Presets: **Quick** · **Default** · **Heavy** · **Chaos**

Normal transactions compress into ~5 seconds. Fraud transactions replay at 50ms each so detection emerges dramatically at the end.

---

## API Reference

```
GET  /graph            — full graph (nodes + edges + risk scores)
GET  /alerts           — all detected fraud alerts
GET  /alerts/{id}      — single alert with embedded subgraph
POST /analyze          — AI fraud explanation via watsonx.ai
POST /demo/start       — reset engine with new in-memory simulation
POST /db2/load         — reload from Db2/SQLite, broadcast reset to all clients
GET  /db2/status       — Db2 connection status and row counts
GET  /stats            — dashboard stats (transactions, accounts, fraud rings, uptime)
WS   /ws/stream        — real-time transaction stream
```

---

## Deployment

### Backend → Railway

Configured via `nixpacks.toml` and `railway.toml`.

- **Build:** Python 3.11 via Nix, `pip install -r backend/requirements.txt`
- **Start:** `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- **Health check:** `GET /stats` · **Restart policy:** `on_failure`

Add IBM credentials in the Railway dashboard to connect to live Db2 or watsonx.ai.

### Frontend → Vercel

Deploy the `frontend/fraudnet-ai` directory with framework preset: **Next.js**.

Set one environment variable:
```
NEXT_PUBLIC_API_URL=https://your-railway-backend.up.railway.app
```

---

## Project Structure

```
fraudnet-ai/
├── backend/
│   ├── main.py              # FastAPI app — REST + WebSocket
│   ├── graph_engine.py      # NetworkX fraud detection + risk scoring
│   ├── db2_client.py        # IBM Db2 client with SQLite fallback
│   ├── demo_generator.py    # In-memory synthetic fraud data generator
│   ├── watsonx_client.py    # IBM Granite 3 AI explanations
│   ├── watsonx_cache.json   # Pre-cached AI responses (fallback)
│   └── requirements.txt
├── frontend/fraudnet-ai/
│   ├── app/
│   │   ├── page.tsx                  # Main dashboard
│   │   └── components/
│   │       ├── GraphView.tsx          # 3D WebGL force graph
│   │       ├── AlertFeed.tsx          # Real-time alert list
│   │       ├── AIExplanation.tsx      # Granite AI analysis panel
│   │       ├── StatsBar.tsx           # Header + Db2 status
│   │       ├── LaunchScreen.tsx       # Simulation configurator
│   │       ├── DemoModal.tsx          # Reconfigure modal
│   │       ├── Db2StatusButton.tsx    # Db2 connection indicator
│   │       └── useWebSocket.ts        # WebSocket state + reconnect
├── data-gen/
│   ├── transactions.db      # SQLite fallback (included)
│   ├── transactions.json    # JSON export for simulator
│   └── generate.py          # Offline data generation script
├── nixpacks.toml            # Railway build config
└── railway.toml             # Railway deploy config
```

---

## License

MIT License — Copyright (c) 2025 Ajaypartap Singh Maan

See [LICENSE](LICENSE) for the full text.
