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


# ─────────────────────────────────────────────
# IAM TOKEN
# ─────────────────────────────────────────────

async def _get_iam_token() -> str:
    """Exchange API key for a short-lived IBM Cloud IAM bearer token."""
    global _iam_token
    if _iam_token:
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
        _iam_token = resp.json()["access_token"]
        return _iam_token


# ─────────────────────────────────────────────
# PROMPT BUILDER
# ─────────────────────────────────────────────

def _build_prompt(subgraph: dict) -> str:
    nodes = subgraph.get("nodes", [])
    edges = subgraph.get("edges", [])

    # Summarise to keep token count manageable
    node_summary = [
        {"id": n["id"][:8], "risk": n.get("risk_score", 0), "type": n.get("account_type", "?")}
        for n in nodes[:20]
    ]
    edge_summary = [
        {"from": e["source"][:8], "to": e["target"][:8],
         "amount": e.get("amount", 0), "type": e.get("tx_type", "?")}
        for e in edges[:30]
    ]

    return f"""You are a financial fraud analyst AI. Analyze the following transaction subgraph and respond ONLY with valid JSON.

Subgraph summary:
- Nodes (accounts): {json.dumps(node_summary)}
- Edges (transactions): {json.dumps(edge_summary)}

Provide your analysis in this exact JSON format:
{{
  "fraud_type": "<one of: Circular Money Laundering | Structuring / Smurfing | Money Mule Network | Suspicious Activity>",
  "confidence": "<High | Medium | Low>",
  "evidence": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "recommendations": ["<action 1>", "<action 2>", "<action 3>"]
}}

Respond with JSON only. No explanation, no markdown."""


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
                "max_new_tokens":   600,
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

        # Validate expected keys
        for key in ("fraud_type", "confidence", "evidence", "recommendations"):
            if key not in result:
                raise ValueError(f"Missing key in response: {key}")

        result["source"] = "live"
        return result

    except Exception as e:
        print(f"  [watsonx] Error ({type(e).__name__}: {e}) — returning cached response")
        result = _pick_cached(subgraph)
        result["source"] = "cached"
        return result
