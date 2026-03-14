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
```

If watsonx.ai is unavailable, the app falls back to pre-generated cached responses automatically.

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
