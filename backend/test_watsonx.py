"""
FraudNet-AI — watsonx.ai Connection Test
Run from repo root: python3 backend/test_watsonx.py

Tests:
  1. Env vars loaded correctly
  2. IAM token exchange (real HTTP call)
  3. Granite model generation (real API call)
  4. Cache fallback (no credentials needed)
  5. Full get_fraud_explanation() — all 3 fraud types
"""

import asyncio
import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent.parent))

load_dotenv(Path(__file__).parent / ".env")

API_KEY    = os.getenv("WATSONX_API_KEY", "")
PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")
URL        = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com").rstrip("/")
MODEL      = "ibm/granite-3-8b-instruct"

SAMPLE_SUBGRAPHS = {
    "circular": {
        "nodes": [
            {"id": "acc-001", "risk_score": 92, "account_type": "personal"},
            {"id": "acc-002", "risk_score": 88, "account_type": "personal"},
            {"id": "acc-003", "risk_score": 85, "account_type": "personal"},
            {"id": "acc-004", "risk_score": 90, "account_type": "personal"},
        ],
        "edges": [
            {"source": "acc-001", "target": "acc-002", "amount": 48000, "tx_type": "fraud_circular"},
            {"source": "acc-002", "target": "acc-003", "amount": 44160, "tx_type": "fraud_circular"},
            {"source": "acc-003", "target": "acc-004", "amount": 40627, "tx_type": "fraud_circular"},
            {"source": "acc-004", "target": "acc-001", "amount": 37377, "tx_type": "fraud_circular"},
        ],
    },
    "fanout": {
        "nodes": [
            {"id": "src-001", "risk_score": 80, "account_type": "personal"},
            {"id": "mule-001", "risk_score": 75, "account_type": "mule"},
            {"id": "mule-002", "risk_score": 72, "account_type": "mule"},
            {"id": "sink-001", "risk_score": 95, "account_type": "mule"},
        ],
        "edges": [
            {"source": "src-001", "target": "mule-001", "amount": 9500, "tx_type": "fraud_fanout"},
            {"source": "src-001", "target": "mule-002", "amount": 9400, "tx_type": "fraud_fanout"},
            {"source": "mule-001", "target": "sink-001", "amount": 9100, "tx_type": "fraud_fanout"},
            {"source": "mule-002", "target": "sink-001", "amount": 9000, "tx_type": "fraud_fanout"},
        ],
    },
    "burst": {
        "nodes": [
            {"id": "feeder-001", "risk_score": 70, "account_type": "personal"},
            {"id": "mule-central", "risk_score": 98, "account_type": "mule"},
            {"id": "recv-001", "risk_score": 60, "account_type": "mule"},
            {"id": "recv-002", "risk_score": 60, "account_type": "mule"},
        ],
        "edges": [
            {"source": "feeder-001", "target": "mule-central", "amount": 55000, "tx_type": "fraud_burst"},
            {"source": "mule-central", "target": "recv-001", "amount": 1200, "tx_type": "fraud_burst"},
            {"source": "mule-central", "target": "recv-002", "amount": 980, "tx_type": "fraud_burst"},
        ],
    },
}


def sep(title: str):
    print(f"\n{'=' * 55}")
    print(f"  {title}")
    print("=" * 55)


# ─────────────────────────────────────────────
# TEST 1: Env vars
# ─────────────────────────────────────────────

def test_env_vars() -> bool:
    sep("TEST 1 — Environment Variables")
    print(f"  WATSONX_URL        : {URL}")
    print(f"  WATSONX_API_KEY    : {'✅ set (' + API_KEY[:8] + '...)' if API_KEY else '❌ NOT SET'}")
    print(f"  WATSONX_PROJECT_ID : {'✅ set (' + PROJECT_ID[:8] + '...)' if PROJECT_ID else '❌ NOT SET'}")
    print(f"  MODEL              : {MODEL}")

    if not API_KEY or not PROJECT_ID:
        print("\n  ⚠️  Credentials missing — live tests will be skipped.")
        print("     Add them to backend/.env and re-run.")
        return False

    print("\n  ✅ All credentials present")
    return True


# ─────────────────────────────────────────────
# TEST 2: IAM token
# ─────────────────────────────────────────────

async def test_iam_token() -> str:
    sep("TEST 2 — IBM Cloud IAM Token Exchange")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                "https://iam.cloud.ibm.com/identity/token",
                data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey", "apikey": API_KEY},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if r.status_code == 200:
            token = r.json()["access_token"]
            expires = r.json().get("expires_in", "?")
            print(f"  ✅ Token received: {token[:24]}...  (expires in {expires}s)")
            return token
        else:
            print(f"  ❌ HTTP {r.status_code}: {r.text[:300]}")
            return ""
    except Exception as e:
        print(f"  ❌ {type(e).__name__}: {e}")
        return ""


# ─────────────────────────────────────────────
# TEST 3: Granite — simple prompt
# ─────────────────────────────────────────────

async def test_granite_basic(token: str):
    sep("TEST 3 — Granite Model (basic prompt)")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{URL}/ml/v1/text/generation?version=2023-05-29",
                json={
                    "model_id":   MODEL,
                    "project_id": PROJECT_ID,
                    "input":      "In one sentence, what is money laundering?",
                    "parameters": {"decoding_method": "greedy", "max_new_tokens": 80},
                },
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
        if r.status_code == 200:
            text = r.json()["results"][0]["generated_text"].strip()
            print(f"  ✅ Response: \"{text}\"")
        else:
            print(f"  ❌ HTTP {r.status_code}: {r.text[:300]}")
    except Exception as e:
        print(f"  ❌ {type(e).__name__}: {e}")


# ─────────────────────────────────────────────
# TEST 4: Granite — fraud JSON prompt
# ─────────────────────────────────────────────

async def test_granite_fraud_prompt(token: str):
    sep("TEST 4 — Granite Model (fraud analysis JSON prompt)")
    prompt = """You are a financial fraud analyst AI. Analyze this transaction subgraph and respond ONLY with valid JSON.

Subgraph: 4 accounts forming a closed loop, $48,000 cycled in 3 hours with 8% laundering fee per hop.

Respond in this exact JSON format:
{
  "fraud_type": "<Circular Money Laundering | Structuring / Smurfing | Money Mule Network | Suspicious Activity>",
  "confidence": "<High | Medium | Low>",
  "evidence": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "recommendations": ["<action 1>", "<action 2>", "<action 3>"]
}

JSON only, no markdown."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                f"{URL}/ml/v1/text/generation?version=2023-05-29",
                json={
                    "model_id":   MODEL,
                    "project_id": PROJECT_ID,
                    "input":      prompt,
                    "parameters": {"decoding_method": "greedy", "max_new_tokens": 400, "temperature": 0.1},
                },
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
        if r.status_code == 200:
            raw = r.json()["results"][0]["generated_text"].strip()
            print(f"  Raw output ({len(raw)} chars):\n  {raw[:500]}")
            # Try parsing JSON
            import json
            if raw.startswith("```"):
                raw = raw.split("```")[1].lstrip("json").strip()
            parsed = json.loads(raw)
            print(f"\n  ✅ Valid JSON — fraud_type: {parsed.get('fraud_type')}, confidence: {parsed.get('confidence')}")
        else:
            print(f"  ❌ HTTP {r.status_code}: {r.text[:300]}")
    except Exception as e:
        print(f"  ❌ {type(e).__name__}: {e}")


# ─────────────────────────────────────────────
# TEST 5: Cache fallback
# ─────────────────────────────────────────────

def test_cache_fallback():
    sep("TEST 5 — Cache Fallback (no live API)")
    import json
    cache_path = Path(__file__).parent / "watsonx_cache.json"
    if not cache_path.exists():
        print("  ❌ watsonx_cache.json not found")
        return
    with open(cache_path) as f:
        cache = json.load(f)
    print(f"  ✅ Cache loaded: {len(cache)} entries")
    for entry in cache:
        keys_ok = {"fraud_type", "confidence", "evidence", "recommendations"}.issubset(entry.keys())
        status = "✅" if keys_ok else "❌"
        print(f"  {status} {entry['fraud_type']} — {entry['confidence']} confidence, "
              f"{len(entry['evidence'])} evidence points, {len(entry['recommendations'])} recommendations")


# ─────────────────────────────────────────────
# TEST 6: Full get_fraud_explanation() — all 3 fraud types
# ─────────────────────────────────────────────

async def test_full_explanation():
    sep("TEST 6 — get_fraud_explanation() — all 3 fraud types")
    from backend.watsonx_client import get_fraud_explanation

    for fraud_type, subgraph in SAMPLE_SUBGRAPHS.items():
        print(f"\n  [{fraud_type.upper()}]")
        result = await get_fraud_explanation(subgraph)
        keys_ok = {"fraud_type", "confidence", "evidence", "recommendations"}.issubset(result.keys())
        status = "✅" if keys_ok else "❌"
        print(f"  {status} fraud_type   : {result.get('fraud_type')}")
        print(f"     confidence  : {result.get('confidence')}")
        print(f"     evidence[0] : {result.get('evidence', [''])[0]}")
        print(f"     action[0]   : {result.get('recommendations', [''])[0]}")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

async def main():
    sep("FraudNet-AI — watsonx.ai Full Test Suite")

    has_creds = test_env_vars()
    test_cache_fallback()

    if has_creds:
        token = await test_iam_token()
        if token:
            await test_granite_basic(token)
            await test_granite_fraud_prompt(token)
    else:
        print("\n  Skipping live API tests (no credentials).")

    await test_full_explanation()

    sep("Test run complete")
    print()


if __name__ == "__main__":
    asyncio.run(main())
