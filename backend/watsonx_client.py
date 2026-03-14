"""
FraudNet-AI — watsonx.ai Client
Calls IBM Granite model for fraud explanation, falls back to cached responses.

Env vars required (backend/.env):
    WATSONX_API_KEY=
    WATSONX_PROJECT_ID=
    WATSONX_URL=https://us-south.ml.cloud.ibm.com
"""

import json
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

# Load .env from backend/ directory
load_dotenv(Path(__file__).parent / ".env")

GRANITE_MODEL       = "ibm/granite-3-8b-instruct"
WATSONX_URL         = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")
WATSONX_API_KEY     = os.getenv("WATSONX_API_KEY", "")
WATSONX_PROJECT_ID  = os.getenv("WATSONX_PROJECT_ID", "")

GENERATE_URL = f"{WATSONX_URL}/ml/v1/text/generation?version=2023-05-29"
IAM_URL      = "https://iam.cloud.ibm.com/identity/token"

CACHE_PATH   = Path(__file__).parent / "watsonx_cache.json"

_iam_token: str = ""
_iam_token_expiry: float = 0.0


# ─────────────────────────────────────────────
# IAM TOKEN
# ─────────────────────────────────────────────

async def _get_iam_token() -> str:
    """Exchange API key for a short-lived IBM Cloud IAM bearer token.
    Automatically refreshes 5 minutes before expiry."""
    import time
    global _iam_token, _iam_token_expiry

    if _iam_token and time.time() < _iam_token_expiry:
        return _iam_token

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            IAM_URL,
            data={
                "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                "apikey": WATSONX_API_KEY,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        resp.raise_for_status()
        data = resp.json()
        _iam_token = data["access_token"]
        # expires_in is in seconds (typically 3600); refresh 5 min early
        _iam_token_expiry = time.time() + data.get("expires_in", 3600) - 300
        print(f"  [watsonx] IAM token refreshed (expires in {data.get('expires_in', 3600)//60}m)")
        return _iam_token


# ─────────────────────────────────────────────
# PROMPT BUILDER
# ─────────────────────────────────────────────

def _build_prompt(subgraph: dict) -> str:
    nodes = subgraph.get("nodes", [])
    edges = subgraph.get("edges", [])

    # Compute summary stats for richer context
    amounts = [e.get("amount", 0) for e in edges]
    total_amount = round(sum(amounts), 2)
    avg_amount   = round(total_amount / len(amounts), 2) if amounts else 0
    max_amount   = round(max(amounts), 2) if amounts else 0
    fraud_edges  = [e for e in edges if str(e.get("tx_type", "")).startswith("fraud")]
    account_types = list({n.get("account_type", "unknown") for n in nodes})
    high_risk     = [n for n in nodes if n.get("risk_score", 0) >= 70]

    node_summary = [
        {"id": n["id"][:8], "risk_score": n.get("risk_score", 0), "type": n.get("account_type", "?")}
        for n in nodes[:20]
    ]
    edge_summary = [
        {"from": e["source"][:8], "to": e["target"][:8],
         "amount": round(e.get("amount", 0), 2), "tx_type": e.get("tx_type", "?")}
        for e in edges[:30]
    ]

    return f"""You are a senior financial crimes investigator at a major bank. Analyze this suspicious transaction network and produce a detailed fraud intelligence report in JSON.

NETWORK STATISTICS:
- Total accounts involved: {len(nodes)}
- Total transactions: {len(edges)}
- Fraud-flagged transactions: {len(fraud_edges)}
- Total value at risk: ${total_amount:,.2f}
- Average transaction: ${avg_amount:,.2f}
- Largest transaction: ${max_amount:,.2f}
- High-risk accounts (score >= 70): {len(high_risk)}
- Account types present: {', '.join(account_types)}

ACCOUNT NODES (risk_score 0-100):
{json.dumps(node_summary, indent=2)}

TRANSACTION EDGES:
{json.dumps(edge_summary, indent=2)}

Respond ONLY with this exact JSON structure — no markdown, no explanation:
{{
  "fraud_type": "<one of: Circular Money Laundering | Structuring / Smurfing | Money Mule Network | Layering Scheme | Suspicious Activity>",
  "confidence": "<Critical | High | Medium | Low>",
  "severity": "<one of: Critical | High | Medium | Low>",
  "pattern_summary": "<2-3 sentence technical description of the fraud pattern observed, referencing specific amounts and account counts>",
  "evidence": [
    "<specific evidence point 1 with amounts/counts>",
    "<specific evidence point 2>",
    "<specific evidence point 3>",
    "<specific evidence point 4>",
    "<specific evidence point 5>"
  ],
  "risk_indicators": [
    "<red flag 1>",
    "<red flag 2>",
    "<red flag 3>"
  ],
  "regulatory_flags": [
    "<regulatory concern 1, e.g. BSA/AML threshold, SAR filing>",
    "<regulatory concern 2>"
  ],
  "recommendations": [
    "<immediate action 1>",
    "<immediate action 2>",
    "<investigative step 3>",
    "<preventive measure 4>"
  ],
  "investigation_priority": "<Immediate | Urgent | Standard>"
}}"""


# ─────────────────────────────────────────────
# CACHE FALLBACK
# ─────────────────────────────────────────────

def _load_cache() -> list[dict]:
    if CACHE_PATH.exists():
        with open(CACHE_PATH) as f:
            return json.load(f)
    return []


def _pick_cached(subgraph: dict) -> dict:
    """Pick the best-matching cached response based on fraud indicators in the subgraph."""
    cache = _load_cache()
    if not cache:
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

    # Heuristic: look at tx_types in the subgraph edges
    tx_types = {e.get("tx_type", "") for e in subgraph.get("edges", [])}

    if "fraud_circular" in tx_types:
        return cache[0]   # Circular Money Laundering
    if "fraud_fanout" in tx_types:
        return cache[1]   # Structuring / Smurfing
    if "fraud_burst" in tx_types:
        return cache[2]   # Money Mule Network

    return cache[0]  # default


# ─────────────────────────────────────────────
# MAIN PUBLIC FUNCTION
# ─────────────────────────────────────────────

async def get_fraud_explanation(subgraph: dict) -> dict:
    """
    Call watsonx.ai Granite model with the subgraph data.
    Falls back to cached response if:
      - Env vars are missing
      - API call takes > 15s
      - Any HTTP or parsing error occurs
    """
    if not WATSONX_API_KEY or not WATSONX_PROJECT_ID:
        print("  [watsonx] No credentials — returning cached response")
        result = _pick_cached(subgraph)
        result["source"] = "cached"
        return result

    try:
        token   = await _get_iam_token()
        prompt  = _build_prompt(subgraph)

        payload = {
            "model_id":   GRANITE_MODEL,
            "project_id": WATSONX_PROJECT_ID,
            "input":      prompt,
            "parameters": {
                "decoding_method":  "greedy",
                "max_new_tokens":   900,
                "temperature":      0.1,
                "repetition_penalty": 1.05,
            },
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                GENERATE_URL,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type":  "application/json",
                },
            )
            resp.raise_for_status()

        raw_text = resp.json()["results"][0]["generated_text"].strip()
        print(f"  [watsonx] Live response received ({len(raw_text)} chars)")

        # Strip markdown fences if model wraps in ```json ... ```
        if raw_text.startswith("```"):
            raw_text = raw_text.split("```")[1]
            if raw_text.startswith("json"):
                raw_text = raw_text[4:]

        result = json.loads(raw_text)

        # Validate required keys
        for key in ("fraud_type", "confidence", "evidence", "recommendations"):
            if key not in result:
                raise ValueError(f"Missing key in response: {key}")
        # Default optional fields if model omitted them
        result.setdefault("severity", result.get("confidence", "Medium"))
        result.setdefault("pattern_summary", "")
        result.setdefault("risk_indicators", [])
        result.setdefault("regulatory_flags", [])
        result.setdefault("investigation_priority", "Standard")

        result["source"] = "live"
        return result

    except Exception as e:
        print(f"  [watsonx] Error ({type(e).__name__}: {e}) — returning cached response")
        result = _pick_cached(subgraph)
        result["source"] = "cached"
        return result
