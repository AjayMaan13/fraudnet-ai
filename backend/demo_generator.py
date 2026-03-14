"""
FraudNet-AI — In-Memory Demo Data Generator
Generates synthetic accounts + transactions without touching the database.
Used by the /demo/start endpoint to power Demo Mode.
"""

import random
import uuid
from datetime import datetime, timedelta


def generate_demo_data(
    n_accounts:    int = 100,
    n_transactions: int = 500,
    n_circular:    int = 3,
    n_structuring: int = 2,
    n_burst:       int = 2,
    seed:          int | None = None,
) -> tuple[list[dict], list[dict]]:
    """
    Generate accounts and transactions entirely in memory.
    Returns (accounts, transactions) as lists of dicts matching
    the same schema used by graph_engine.load_from_data().
    """
    if seed is not None:
        random.seed(seed)

    now = datetime.utcnow()

    # ── Accounts ───────────────────────────────────────────────
    type_pool = (["personal"] * 7) + (["business"] * 2) + (["savings"] * 1)
    accounts: list[dict] = []
    for _ in range(n_accounts):
        accounts.append({
            "id":           str(uuid.uuid4()),
            "name":         f"Acct-{random.randint(1000, 9999)}",
            "account_type": random.choice(type_pool),
            "created_at":   (now - timedelta(days=random.randint(1, 730))).isoformat(),
        })

    txns: list[dict] = []

    # ── Normal transactions ────────────────────────────────────
    for _ in range(n_transactions):
        src, dst = random.sample(accounts, 2)
        ts = now - timedelta(hours=random.uniform(0, 168))
        txns.append({
            "id":           str(uuid.uuid4()),
            "from_account": src["id"],
            "to_account":   dst["id"],
            "amount":       round(random.uniform(50, 12_000), 2),
            "timestamp":    ts.isoformat(),
            "tx_type":      random.choice(["transfer", "payment", "deposit"]),
            "is_fraud":     0,
        })

    personal = [a for a in accounts if a["account_type"] == "personal"]
    if len(personal) < 4:
        personal = accounts  # fallback if too few

    # ── Circular Money Laundering ──────────────────────────────
    for ring_idx in range(n_circular):
        ring_size = random.randint(4, 6)
        ring = random.sample(personal, min(ring_size, len(personal)))
        amount = random.uniform(10_000, 60_000)
        start  = now - timedelta(hours=random.uniform(0.3, 2))
        window = random.uniform(0.5, 3.0)  # hours
        for i, src in enumerate(ring):
            dst = ring[(i + 1) % len(ring)]
            ts  = start + timedelta(minutes=random.uniform(0, window * 60))
            txns.append({
                "id":           str(uuid.uuid4()),
                "from_account": src["id"],
                "to_account":   dst["id"],
                "amount":       round(amount * (0.92 ** i), 2),
                "timestamp":    ts.isoformat(),
                "tx_type":      "fraud_circular",
                "is_fraud":     1,
            })

    # ── Structuring / Smurfing ─────────────────────────────────
    for _ in range(n_structuring):
        src      = random.choice(accounts)
        others   = [a for a in accounts if a["id"] != src["id"]]
        targets  = random.sample(others, min(6, len(others)))
        start    = now - timedelta(hours=random.uniform(1, 8))
        for dst in targets:
            ts = start + timedelta(minutes=random.uniform(0, 60))
            txns.append({
                "id":           str(uuid.uuid4()),
                "from_account": src["id"],
                "to_account":   dst["id"],
                "amount":       round(random.uniform(8_500, 9_900), 2),
                "timestamp":    ts.isoformat(),
                "tx_type":      "fraud_fanout",
                "is_fraud":     1,
            })

    # ── Burst / Mule Network ───────────────────────────────────
    for _ in range(n_burst):
        src      = random.choice(accounts)
        others   = [a for a in accounts if a["id"] != src["id"]]
        targets  = random.sample(others, min(12, len(others)))
        deposit  = random.uniform(20_000, 80_000)
        start    = now - timedelta(hours=random.uniform(0.2, 4))
        per_tx   = deposit / len(targets)
        for dst in targets:
            ts = start + timedelta(minutes=random.uniform(0, 30))
            txns.append({
                "id":           str(uuid.uuid4()),
                "from_account": src["id"],
                "to_account":   dst["id"],
                "amount":       round(per_tx * random.uniform(0.85, 1.15), 2),
                "timestamp":    ts.isoformat(),
                "tx_type":      "fraud_burst",
                "is_fraud":     1,
            })

    return accounts, txns
