"""
FraudNet-AI — watsonx.ai Connection Test
Run from repo root:
    python3 backend/test_watsonx.py

Tests:
  1. Env vars loaded correctly
  2. IAM token exchange (real HTTP call)
  3. Granite model generation (real API call)
  4. Cache fallback (no credentials needed)
"""

import asyncio
import json
import os
import sys
from pathlib import Path

# Allow running from repo root
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

WATSONX_API_KEY    = os.getenv("WATSONX_API_KEY", "")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")
WATSONX_URL        = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com")

# ─────────────────────────────────────────────
# SAMPLE SUBGRAPH (mimics a circular ring alert)
# ─────────────────────────────────────────────

SAMPLE_SUBGRAPH = {
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
}


# ─────────────────────────────────────────────
# TEST 1: Env vars
# ─────────────────────────────────────────────

def test_env_vars():
    print("\n" + "=" * 55)
    print("  TEST 1 — Environment Variables")
    print("=" * 55)

    print(f"  WATSONX_URL        : {WATSONX_URL}")
    print(f"  WATSONX_API_KEY    : {'✅ set (' + WATSONX_API_KEY[:6] + '...)' if WATSONX_API_KEY else '❌ NOT SET'}")
    print(f"  WATSONX_PROJECT_ID : {'✅ set (' + WATSONX_PROJECT_ID[:6] + '...)' if WATSONX_PROJECT_ID else '❌ NOT SET'}")

    if not WATSONX_API_KEY or not WATSONX_PROJECT_ID:
        print("\n  ⚠️  Credentials missing — live API tests will be skipped.")
        print("     Add them to backend/.env and re-run.")
        return False

    print("\n  ✅ All credentials present")
    return True


# ─────────────────────────────────────────────
# TEST 2: IAM Token
# ─────────────────────────────────────────────

async def test_iam_token() -> str:
    import httpx
    print("\n" + "=" * 55)
    print("  TEST 2 — IBM Cloud IAM Token Exchange")
    print("=" * 55)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                "https://iam.cloud.ibm.com/identity/token",
                data={
                    "grant_type": "urn:ibm:params:oauth:grant-type:apikey",
                    "apikey": WATSONX_API_KEY,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )

        if resp.status_code == 200:
            token = resp.json()["access_token"]
            print(f"  ✅ Token received: {token[:20]}...  (expires in {resp.json().get('expires_in', '?')}s)")
            return token
        else:
            print(f"  ❌ HTTP {resp.status_code}: {resp.text[:200]}")
            return ""

    except Exception as e:
        print(f"  ❌ Exception: {type(e).__name__}: {e}")
        return ""


# ─────────────────────────────────────────────
# TEST 3: Granite Model Generation
# ─────────────────────────────────────────────

async def test_granite(token: str):
    import httpx
    print("\n" + "=" * 55)
    print("  TEST 3 — Granite Model Generation (live)")
    print("=" * 55)

    generate_url = f"{WATSONX_URL}/ml/v1/text/generation?version=2023-05-29"

    prompt = (
        "You are a fraud analyst AI. "
        "A circular money laundering ring has been detected: 4 accounts cycled $48,000 in 3 hours. "
        "In one sentence, state the most urgent action to take."
    )

    payload = {
        "model_id":   "ibm/granite-13b-chat-v2",
        "project_id": WATSONX_PROJECT_ID,
        "input":      prompt,
        "parameters": {
            "decoding_method": "greedy",
            "max_new_tokens":  100,
            "temperature":     0.1,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(
                generate_url,
                json=payload,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type":  "application/json",
                },
            )

        if resp.status_code == 200:
            text = resp.json()["results"][0]["generated_text"].strip()
            print(f"  ✅ Model response:\n     \"{text}\"")
        else:
            print(f"  ❌ HTTP {resp.status_code}: {resp.text[:300]}")

    except Exception as e:
        print(f"  ❌ Exception: {type(e).__name__}: {e}")


# ─────────────────────────────────────────────
# TEST 4: Full get_fraud_explanation (with cache fallback)
# ─────────────────────────────────────────────

async def test_full_explanation():
    print("\n" + "=" * 55)
    print("  TEST 4 — get_fraud_explanation() (end-to-end)")
    print("=" * 55)

    from backend.watsonx_client import get_fraud_explanation

    result = await get_fraud_explanation(SAMPLE_SUBGRAPH)

    print(f"  fraud_type      : {result.get('fraud_type')}")
    print(f"  confidence      : {result.get('confidence')}")
    print(f"  evidence        :")
    for e in result.get("evidence", []):
        print(f"    • {e}")
    print(f"  recommendations :")
    for r in result.get("recommendations", []):
        print(f"    • {r}")

    required_keys = {"fraud_type", "confidence", "evidence", "recommendations"}
    if required_keys.issubset(result.keys()):
        print("\n  ✅ Response structure valid")
    else:
        missing = required_keys - result.keys()
        print(f"\n  ❌ Missing keys: {missing}")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

async def main():
    print("\n" + "=" * 55)
    print("  FraudNet-AI — watsonx.ai Connection Test")
    print("=" * 55)

    has_creds = test_env_vars()

    if has_creds:
        token = await test_iam_token()
        if token:
            await test_granite(token)
    else:
        print("\n  Skipping live tests (no credentials).")

    # Always run full explanation test (uses cache if no creds)
    await test_full_explanation()

    print("\n" + "=" * 55)
    print("  Test run complete.")
    print("=" * 55 + "\n")


if __name__ == "__main__":
    asyncio.run(main())
