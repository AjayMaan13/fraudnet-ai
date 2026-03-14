# FraudNet-AI

Real-time financial fraud detection powered by graph analysis and IBM watsonx.ai.

Configure a simulation, watch transactions stream live into a 3D force-directed graph, and see fraud rings, mule networks, and structuring patterns detected automatically and explained by IBM Granite AI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, 3d-force-graph (WebGL) |
| Backend | Python, FastAPI, WebSocket |
| Graph Engine | NetworkX — cycle detection, sliding-window burst/fanout analysis |
| AI Analysis | IBM watsonx.ai — Granite 3 8B Instruct |
| Database | IBM Db2 · SQLite fallback |
| Data | In-memory synthetic generator — configurable accounts, transactions, fraud patterns |

---

## Fraud Patterns Detected

- **Circular Money Laundering** — closed transaction loops (A→B→C→A) with layering fee
- **Structuring / Smurfing** — fan-out transfers just under $10K reporting threshold to 5+ recipients
- **Burst / Mule Network** — large deposit dispersed to 8+ accounts within 30 minutes

---

## How It Works

1. Open the app — a launch screen lets you configure the simulation parameters
2. Hit **Generate Simulation** — the backend creates synthetic accounts and transactions in memory
3. Transactions replay at ~40/s over WebSocket, building the graph live
4. The fraud detection engine runs every 30 edges and emits alerts progressively as patterns emerge
5. Click any alert to get a full AI explanation from IBM Granite

---

## Setup

**1. Start backend**
```bash
python3 -m uvicorn backend.main:app --reload --port 8000
```

**2. Start frontend**
```bash
cd frontend/fraudnet-ai
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — no data generation step needed, the simulation is configured in the browser.

---

## Environment Variables (optional)

Create `backend/.env` to enable IBM cloud integrations:

```
# IBM watsonx.ai — for live AI explanations
WATSONX_API_KEY=your_ibm_cloud_api_key
WATSONX_PROJECT_ID=your_watsonx_project_id
WATSONX_URL=https://ca-tor.ml.cloud.ibm.com

# IBM Db2 — see note below
DB2_HOSTNAME=your_db2_hostname
DB2_PORT=30496
DB2_DATABASE=BLUDB
DB2_USERNAME=your_db2_username
DB2_PASSWORD=your_db2_password
DB2_SSL=true
```

Both integrations are **optional** — the app runs fully without them:

- If watsonx.ai credentials are missing, AI explanations fall back to pre-cached Granite responses
- If Db2 credentials are missing, the app uses SQLite automatically

**watsonx.ai setup:**

1. Create a project at [dataplatform.cloud.ibm.com/wx/home](https://dataplatform.cloud.ibm.com/wx/home)
2. Associate a Watson Machine Learning service: project → Manage → Services & integrations → Associate service
3. Copy the Project ID from: project → Manage → General

---

## IBM Db2 Integration

The backend includes a full IBM Db2 client (`backend/db2_client.py`) that connects to an IBM Cloud Db2 instance, auto-creates the schema, migrates data from SQLite on first run, and serves transactions from the cloud database.

This integration was built and tested during development using an IBM Cloud trial instance. **The trial instance has since expired**, so the app currently runs on the SQLite fallback — handled automatically at startup with no code changes needed. To reconnect to a live Db2 instance, add the credentials to `backend/.env` as shown above.

---

## API Endpoints

```text
GET  /graph            — full graph (nodes + edges + risk scores)
GET  /alerts           — detected fraud alerts
GET  /alerts/{id}      — single alert with subgraph
POST /analyze          — AI fraud explanation via watsonx.ai
POST /demo/start       — reset engine with new in-memory simulation
GET  /stats            — dashboard stats
WS   /ws/stream        — real-time transaction stream
```
