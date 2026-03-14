# FraudNet-AI

Real-time financial fraud detection powered by graph analysis and IBM watsonx.ai.

Transactions stream live into a 3D force-directed graph. Fraud rings, mule networks, and structuring patterns are detected automatically and explained by IBM Granite AI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS, 3d-force-graph (WebGL) |
| Backend | Python, FastAPI, WebSocket |
| Graph Engine | NetworkX — cycle detection, PageRank, burst analysis |
| AI Analysis | IBM watsonx.ai — Granite 3 8B Instruct |
| Database | IBM Db2 (ca-tor) · SQLite fallback |
| Data | Synthetic generator — 500 accounts, 5000+ transactions, 3 fraud patterns |

---

## Fraud Patterns Detected

- **Circular Money Laundering** — closed transaction loops (A→B→C→A) with 8% layering fee
- **Structuring / Smurfing** — fan-out transfers just under $10K reporting threshold
- **Burst / Mule Network** — large deposit dispersed to 10+ new accounts in 30 minutes

---

## Setup

**1. Generate data**
```bash
python3 data-gen/generate.py
```

**2. Start backend**
```bash
python3 -m uvicorn backend.main:app --reload --port 8000
```

**3. Start frontend**
```bash
cd frontend/fraudnet-ai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

Create `backend/.env`:
```
WATSONX_API_KEY=your_ibm_cloud_api_key
WATSONX_PROJECT_ID=your_watsonx_project_id
WATSONX_URL=https://ca-tor.ml.cloud.ibm.com

DB2_HOSTNAME=your_db2_hostname
DB2_PORT=30496
DB2_DATABASE=BLUDB
DB2_USERNAME=your_db2_username
DB2_PASSWORD=your_db2_password
DB2_SSL=true
```

**watsonx.ai setup:**

1. Create a project at [dataplatform.cloud.ibm.com/wx/home](https://dataplatform.cloud.ibm.com/wx/home)
2. Associate a Watson Machine Learning service: project → Manage → Services & integrations → Associate service
3. Copy the Project ID from: project → Manage → General

If watsonx.ai is unavailable, the app falls back to pre-generated cached responses automatically.

---

## Restart Backend

```bash
# Kill existing process
pkill -f "uvicorn backend.main"

# Start fresh
python3 -m uvicorn backend.main:app --reload --port 8000
```

---

## Inject Additional Fraud Rings

Add new circular money-laundering rings to the database using existing accounts.
Rings are automatically synced to IBM Db2 and detected on the next backend restart.

```bash
python3 data-gen/inject_rings.py              # inject 3 rings (default)
python3 data-gen/inject_rings.py --rings 5    # inject 5 rings
python3 data-gen/inject_rings.py --rings 2 --min-size 3 --max-size 7
```

After injecting, restart the backend to pick up and detect the new rings.

---

## Test Connections

```bash
python3 backend/test_watsonx.py   # verify IBM watsonx.ai + Granite model
python3 backend/test_db2.py       # verify IBM Db2 connection + data
```

---

## API Endpoints

```
GET  /graph            — full graph (nodes + edges + risk scores)
GET  /alerts           — detected fraud alerts
GET  /alerts/{id}      — single alert with subgraph
POST /analyze          — AI fraud explanation via watsonx.ai
GET  /stats            — dashboard stats
WS   /ws/stream        — real-time transaction stream
```
