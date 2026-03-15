# FraudNet·AI

Real-time financial fraud detection powered by graph analysis and IBM watsonx.ai.

Configure a simulation, watch transactions stream live into a 3D force-directed graph, and see fraud rings, mule networks, and structuring patterns detected automatically and explained by IBM Granite AI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind v4, 3d-force-graph (WebGL) |
| Backend | Python, FastAPI, WebSocket |
| Graph Engine | NetworkX — cycle detection, community isolation, PageRank, sliding-window burst/fanout |
| AI Analysis | IBM watsonx.ai — Granite 3 8B Instruct |
| Database | IBM Db2 (primary) · SQLite fallback |
| Data | In-memory synthetic generator + Db2/SQLite dataset |
| Deployment | Railway (backend) · Vercel (frontend) |

---

## Fraud Patterns Detected

| Pattern | Algorithm | Description |
| --- | --- | --- |
| Circular Money Laundering | Cycle detection (3–8 hops) | Closed transaction loops (A→B→C→A) with layering fee, >$5K, within 24h |
| Structuring / Smurfing | Fan-out analysis | Transfers just under $10K to 5+ recipients in 60 min |
| Burst / Mule Network | Temporal burst detection | Large deposit dispersed to 8+ accounts within 30 min |
| Community Isolation | Louvain clustering | Isolated dense subgraphs with <2 external connections |
| PageRank Anomaly | Weighted PageRank | Accounts receiving disproportionate fund flows (>mean + 2σ) |

**Risk scoring formula:** 30% cycles + 25% community + 20% pagerank + 15% burst + 10% neighbor propagation

Risk levels: **clean** (0–20) · **watch** (21–50) · **suspicious** (51–75) · **fraud** (76–100)

---

## How It Works

1. App auto-loads data from Db2 (or SQLite fallback) on startup
2. Transactions replay over WebSocket, building the 3D graph live
3. Fraud detection runs every 30 edges and emits alerts progressively as patterns emerge
4. Click any alert to get a full AI explanation from IBM Granite 3
5. Use **Reconfigure** to launch a fresh simulation with custom fraud pattern parameters
6. Use **Load Db2 Dataset** to reload from Db2/SQLite and broadcast a reset to all connected clients

---

## Setup

**1. Start backend**
```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python3 -m uvicorn main:app --reload --port 8000
```

**2. Start frontend**
```bash
cd frontend/fraudnet-ai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

Create `backend/.env` to enable IBM cloud integrations (all optional — app runs without them):

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

Create `frontend/fraudnet-ai/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Fallback behavior:**

- If watsonx.ai credentials are missing → AI explanations fall back to pre-cached Granite responses in `watsonx_cache.json`
- If Db2 credentials are missing or instance is unreachable → falls back to SQLite (`data-gen/transactions.db`) automatically

**watsonx.ai setup:**

1. Create a project at [dataplatform.cloud.ibm.com/wx/home](https://dataplatform.cloud.ibm.com/wx/home)
2. Associate a Watson Machine Learning service: project → Manage → Services & integrations → Associate service
3. Copy the Project ID from: project → Manage → General

---

## IBM Db2 Integration

`backend/db2_client.py` connects to an IBM Cloud Db2 instance with automatic SQLite fallback.

**Schema:**

```sql
fraudnet_accounts      (account_id, account_name, account_type, created_at)
fraudnet_transactions  (tx_id, from_account, to_account, amount, tx_timestamp, tx_type, is_fraud)
```

**Load flow:**

1. On startup, attempts to connect to Db2 using credentials from `.env`
2. If connected: creates schema, migrates SQLite data on first run, fetches all accounts + transactions
3. If unavailable: falls back to SQLite silently — no errors, no code changes needed

**Runtime controls:**

- `POST /db2/load` — reload data from Db2/SQLite and broadcast a `demo_reset` to all WebSocket clients
- `GET /db2/status` — returns connection state and row counts, shown in the UI via the **IBM Db2** header button

The trial Db2 instance used during development has expired. The SQLite fallback (`data-gen/transactions.db`, included in the repo) handles everything automatically with no configuration needed. To reconnect to a live Db2 instance, add credentials to `backend/.env`.

During development, Db2 stored **5,000 transactions** and **500 accounts** on IBM Cloud (ca-tor region).

---

## Demo Mode

Click **Reconfigure** → adjust sliders → **Generate Simulation**:

| Slider | Controls |
| --- | --- |
| Accounts | Up to 100 unique personal/business accounts |
| Transactions | Total transaction volume |
| Circular rings | Money laundering cycles (4–6 accounts, $10K–$50K) |
| Structuring patterns | Sub-$10K fan-out to 6 recipients |
| Burst patterns | $20K–$80K deposit dispersed to 12 accounts |

Presets: **Light**, **Standard**, **Heavy**

Fraud transactions replay last at 50ms each so patterns emerge dramatically. Normal transactions compress into ~5s. Detection fires at pattern completion.

---

## API Endpoints

```text
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

Configured via `nixpacks.toml` (Python 3.11 provider) and `railway.toml`.

- Start command: `python -m uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Health check: `GET /stats` · Restart policy: `on_failure`
- CORS: open to all origins (`allow_origins=["*"]`) — no Railway env var needed

Set IBM credentials in the Railway dashboard if connecting to a live Db2 or watsonx.ai instance.

### Frontend → Vercel

Deploy the `frontend/fraudnet-ai` directory. Set `NEXT_PUBLIC_API_URL` to your Railway backend URL.

---

## Project Structure

```text
fraudnet-ai/
├── backend/
│   ├── main.py              # FastAPI app — REST endpoints + WebSocket stream
│   ├── graph_engine.py      # NetworkX fraud detection + composite risk scoring
│   ├── db2_client.py        # IBM Db2 client with SQLite fallback
│   ├── demo_generator.py    # In-memory synthetic fraud data generator
│   ├── watsonx_client.py    # IBM Granite 3 AI explanations client
│   ├── watsonx_cache.json   # Pre-cached AI responses (fallback)
│   └── requirements.txt
├── frontend/fraudnet-ai/
│   ├── app/
│   │   ├── page.tsx                  # Main dashboard (graph + alerts + AI panel)
│   │   └── components/
│   │       ├── GraphView.tsx          # 3D force-directed graph (WebGL)
│   │       ├── AlertFeed.tsx          # Alert list with type filtering
│   │       ├── AIExplanation.tsx      # Granite AI analysis panel
│   │       ├── StatsBar.tsx           # Header stats + Db2 status button
│   │       ├── DemoModal.tsx          # Simulation config modal with sliders
│   │       ├── Db2StatusButton.tsx    # Db2 connection indicator
│   │       └── useWebSocket.ts        # WebSocket state hook with auto-reconnect
├── data-gen/
│   ├── transactions.db      # SQLite fallback database
│   ├── transactions.json    # JSON export
│   └── generate.py          # Data generation script
├── nixpacks.toml            # Railway build config
└── railway.toml             # Railway deploy config
```
