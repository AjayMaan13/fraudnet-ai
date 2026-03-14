"""
Quick watsonx.ai connection test.
Run from repo root: python3 backend/test_watsonx.py
"""

import asyncio
import os
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

API_KEY    = os.getenv("WATSONX_API_KEY", "")
PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")
URL        = os.getenv("WATSONX_URL", "https://us-south.ml.cloud.ibm.com").rstrip("/")


async def main():
    print(f"API key  : {'set' if API_KEY else 'MISSING'}")
    print(f"Project  : {PROJECT_ID or 'MISSING'}")
    print(f"URL      : {URL}")

    if not API_KEY or not PROJECT_ID:
        print("\nERROR: Fill in backend/.env and re-run.")
        return

    # Step 1: get IAM token
    print("\nGetting IAM token...")
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            "https://iam.cloud.ibm.com/identity/token",
            data={"grant_type": "urn:ibm:params:oauth:grant-type:apikey", "apikey": API_KEY},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    if r.status_code != 200:
        print(f"FAILED ({r.status_code}): {r.text[:300]}")
        return
    token = r.json()["access_token"]
    print(f"OK — token: {token[:20]}...")

    # Step 2: call Granite
    print("\nCalling Granite model...")
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            f"{URL}/ml/v1/text/generation?version=2023-05-29",
            json={
                "model_id":   "ibm/granite-3-8b-instruct",
                "project_id": PROJECT_ID,
                "input":      "In one sentence, what is money laundering?",
                "parameters": {"decoding_method": "greedy", "max_new_tokens": 60},
            },
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
    if r.status_code != 200:
        print(f"FAILED ({r.status_code}): {r.text[:300]}")
        return
    print(f"OK — response: {r.json()['results'][0]['generated_text'].strip()}")
    print("\nwatsonx.ai is connected and working.")


asyncio.run(main())
