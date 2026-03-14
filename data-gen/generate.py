"""
FraudNet-AI — Synthetic Data Generator
Generates realistic banking transactions with 3 embedded fraud patterns.

Output:
  data-gen/transactions.db   — SQLite database
  data-gen/transactions.json — JSON array (used by simulator + frontend fallback)

Usage:
  python3 data-gen/generate.py
  python3 data-gen/generate.py --accounts 500 --transactions 5000 --fraud-rings 3
"""

import argparse
import json
import os
import random
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Optional

from faker import Faker

fake = Faker()
random.seed(42)

# ─────────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH    = os.path.join(SCRIPT_DIR, "transactions.db")
JSON_PATH  = os.path.join(SCRIPT_DIR, "transactions.json")

NOW = datetime.utcnow()
SEVEN_DAYS_AGO = NOW - timedelta(days=7)

# ─────────────────────────────────────────────
# DATABASE SETUP
# ─────────────────────────────────────────────

def init_db(conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.executescript("""
        DROP TABLE IF EXISTS transactions;
        DROP TABLE IF EXISTS accounts;

        CREATE TABLE accounts (
            id           TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            created_at   TEXT NOT NULL,
            account_type TEXT NOT NULL  -- 'personal', 'business', 'mule'
        );

        CREATE TABLE transactions (
            id           TEXT PRIMARY KEY,
            from_account TEXT NOT NULL,
            to_account   TEXT NOT NULL,
            amount       REAL NOT NULL,
            timestamp    TEXT NOT NULL,
            tx_type      TEXT NOT NULL,
            is_fraud     INTEGER NOT NULL DEFAULT 0
        );
    """)
    conn.commit()

# ─────────────────────────────────────────────
# ACCOUNT GENERATION
# ─────────────────────────────────────────────

def make_account(account_type: str = "personal", days_old: Optional[int] = None) -> dict:
    if days_old is None:
        days_old = random.randint(30, 1825)  # 1 month – 5 years old
    created_at = NOW - timedelta(days=days_old, hours=random.randint(0, 23))
    return {
        "id":           str(uuid.uuid4()),
        "name":         fake.name(),
        "created_at":   created_at.isoformat(),
        "account_type": account_type,
    }

def generate_accounts(n_normal: int = 450, n_mule: int = 50) -> list[dict]:
    accounts = []
    for _ in range(n_normal):
        accounts.append(make_account("personal"))
    for _ in range(n_mule):
        # Mule accounts are very new (< 7 days old)
        accounts.append(make_account("mule", days_old=random.randint(1, 6)))
    random.shuffle(accounts)
    return accounts

# ─────────────────────────────────────────────
# NORMAL TRANSACTION GENERATION
# ─────────────────────────────────────────────

def random_timestamp(start: datetime = SEVEN_DAYS_AGO, end: datetime = NOW) -> datetime:
    delta = end - start
    return start + timedelta(seconds=random.randint(0, int(delta.total_seconds())))

def make_tx(from_id: str, to_id: str, amount: float, ts: datetime, tx_type: str, is_fraud: bool = False) -> dict:
    return {
        "id":           str(uuid.uuid4()),
        "from_account": from_id,
        "to_account":   to_id,
        "amount":       round(float(amount), 2),
        "timestamp":    ts.isoformat(),
        "tx_type":      tx_type,
        "is_fraud":     1 if is_fraud else 0,
    }

def generate_normal_transactions(accounts: list[dict], n: int) -> list[dict]:
    personal = [a for a in accounts if a["account_type"] == "personal"]
    txns = []

    for _ in range(n):
        tx_type = random.choices(
            ["salary", "rent", "grocery", "peer", "subscription"],
            weights=[10, 5, 30, 40, 15],
        )[0]

        sender = random.choice(personal)
        receiver = random.choice([a for a in personal if a["id"] != sender["id"]])
        ts = random_timestamp()

        if tx_type == "salary":
            amount = random.uniform(2000, 8000)
        elif tx_type == "rent":
            amount = random.uniform(800, 2500)
        elif tx_type == "grocery":
            amount = random.uniform(30, 200)
        elif tx_type == "peer":
            amount = random.uniform(10, 500)
        else:  # subscription
            amount = random.uniform(5, 50)

        txns.append(make_tx(sender["id"], receiver["id"], amount, ts, tx_type))

    return txns

# ─────────────────────────────────────────────
# FRAUD PATTERN 1: CIRCULAR MONEY FLOW
# ─────────────────────────────────────────────

def inject_circular_rings(accounts: list[dict], n_rings: int = 3) -> list[dict]:
    """
    A → B → C → D → A
    Each hop loses 8% (laundering fee).
    Total cycled: $10,000–$50,000.
    All timestamps within a 2–4 hour window in the last 24 hours.
    """
    personal = [a for a in accounts if a["account_type"] == "personal"]
    txns = []

    for ring_num in range(n_rings):
        ring_size = random.randint(4, 6)
        ring_accounts = random.sample(personal, ring_size)
        total = random.uniform(10_000, 50_000)
        fee_rate = 0.08

        # Cluster timestamps: start within last 24h, span 2–4 hours
        window_hours = random.uniform(2, 4)
        start_ts = NOW - timedelta(hours=random.uniform(1, 24))

        amount = total
        for i, sender in enumerate(ring_accounts):
            receiver = ring_accounts[(i + 1) % ring_size]
            ts = start_ts + timedelta(minutes=random.uniform(0, window_hours * 60))
            txns.append(make_tx(sender["id"], receiver["id"], amount, ts, "fraud_circular", is_fraud=True))
            amount *= (1 - fee_rate)

        print(f"  [Ring {ring_num + 1}] {ring_size} accounts, ${total:,.0f} cycled, {window_hours:.1f}h window")

    return txns

# ─────────────────────────────────────────────
# FRAUD PATTERN 2: FAN-OUT / FAN-IN (Structuring)
# ─────────────────────────────────────────────

def inject_fanout_events(accounts: list[dict], n_events: int = 2) -> list[dict]:
    """
    Source sends $9,500 to 5 accounts (just under $10K reporting threshold).
    Those 5 then all converge on a single collection account within 6 hours.
    Called 'smurfing' or 'structuring'.
    """
    mules    = [a for a in accounts if a["account_type"] == "mule"]
    personal = [a for a in accounts if a["account_type"] == "personal"]
    txns = []

    for event_num in range(n_events):
        source     = random.choice(personal)
        collectors = random.sample(mules, 5)
        sink       = random.choice([a for a in mules if a not in collectors])

        # Phase 1: fan-out (source → 5 collectors), within 1 hour
        fanout_start = NOW - timedelta(hours=random.uniform(6, 20))
        for col in collectors:
            amount = random.uniform(9_000, 9_800)  # just under $10K
            ts     = fanout_start + timedelta(minutes=random.uniform(0, 60))
            txns.append(make_tx(source["id"], col["id"], amount, ts, "fraud_fanout", is_fraud=True))

        # Phase 2: fan-in (5 collectors → 1 sink), within 6 hours of fan-out
        fanin_start = fanout_start + timedelta(hours=random.uniform(1, 5))
        for col in collectors:
            amount = random.uniform(8_500, 9_500)
            ts     = fanin_start + timedelta(minutes=random.uniform(0, 60))
            txns.append(make_tx(col["id"], sink["id"], amount, ts, "fraud_fanout", is_fraud=True))

        print(f"  [Fan-Out {event_num + 1}] source→5 collectors→sink, ~$9,500 per hop")

    return txns

# ─────────────────────────────────────────────
# FRAUD PATTERN 3: BURST TRANSFERS (Mule Network)
# ─────────────────────────────────────────────

def inject_burst_events(accounts: list[dict], n_events: int = 2) -> list[dict]:
    """
    A new mule account receives a large deposit ($20,000+).
    Then immediately sends 10+ small transfers to 10+ fresh accounts within 30 minutes.
    Receiving accounts are all newly created mules.
    """
    mules    = [a for a in accounts if a["account_type"] == "mule"]
    personal = [a for a in accounts if a["account_type"] == "personal"]
    txns = []

    for event_num in range(n_events):
        # Pick a mule as the recipient of the initial large deposit
        central_mule     = random.choice(mules)
        feeder           = random.choice(personal)
        receiving_mules  = random.sample([m for m in mules if m != central_mule], 10)

        burst_start = NOW - timedelta(hours=random.uniform(1, 12))

        # Step 1: large deposit into the central mule
        deposit_amount = random.uniform(20_000, 80_000)
        ts = burst_start
        txns.append(make_tx(feeder["id"], central_mule["id"], deposit_amount, ts, "fraud_burst", is_fraud=True))

        # Step 2: rapid dispersal within 30 minutes
        for recv in receiving_mules:
            amount = random.uniform(500, 2_000)
            ts_offset = random.uniform(1, 30)  # minutes
            ts = burst_start + timedelta(minutes=ts_offset)
            txns.append(make_tx(central_mule["id"], recv["id"], amount, ts, "fraud_burst", is_fraud=True))

        print(f"  [Burst {event_num + 1}] ${deposit_amount:,.0f} deposited → dispersed to {len(receiving_mules)} mule accounts in 30min")

    return txns

# ─────────────────────────────────────────────
# PERSIST TO SQLITE
# ─────────────────────────────────────────────

def save_to_db(conn: sqlite3.Connection, accounts: list[dict], transactions: list[dict]):
    cur = conn.cursor()
    cur.executemany(
        "INSERT INTO accounts (id, name, created_at, account_type) VALUES (:id, :name, :created_at, :account_type)",
        accounts,
    )
    cur.executemany(
        "INSERT INTO transactions (id, from_account, to_account, amount, timestamp, tx_type, is_fraud) "
        "VALUES (:id, :from_account, :to_account, :amount, :timestamp, :tx_type, :is_fraud)",
        transactions,
    )
    conn.commit()

# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="FraudNet-AI synthetic data generator")
    parser.add_argument("--accounts",     type=int, default=500, help="Total accounts (default: 500)")
    parser.add_argument("--transactions", type=int, default=5000, help="Normal transactions (default: 5000)")
    parser.add_argument("--fraud-rings",  type=int, default=3,    help="Number of circular fraud rings (default: 3)")
    args = parser.parse_args()

    n_mule   = max(50, args.accounts // 10)
    n_normal = args.accounts - n_mule

    print(f"\n{'='*55}")
    print(f"  FraudNet-AI — Data Generator")
    print(f"{'='*55}")
    print(f"  Accounts   : {n_normal} personal  +  {n_mule} mule")
    print(f"  Normal txns: {args.transactions}")
    print(f"  Fraud rings: {args.fraud_rings} circular  +  2 fan-out  +  2 burst")
    print(f"{'='*55}\n")

    # --- Accounts ---
    print("Generating accounts...")
    accounts = generate_accounts(n_normal=n_normal, n_mule=n_mule)
    print(f"  ✓ {len(accounts)} accounts created\n")

    # --- Normal transactions ---
    print("Generating normal transactions...")
    txns = generate_normal_transactions(accounts, args.transactions)
    print(f"  ✓ {len(txns)} normal transactions\n")

    # --- Fraud patterns ---
    print("Injecting fraud patterns...")
    print("  Pattern 1: Circular Money Flows")
    txns += inject_circular_rings(accounts, n_rings=args.fraud_rings)

    print("  Pattern 2: Fan-Out / Fan-In (Structuring)")
    txns += inject_fanout_events(accounts, n_events=2)

    print("  Pattern 3: Burst Transfers (Mule Network)")
    txns += inject_burst_events(accounts, n_events=2)

    fraud_count  = sum(1 for t in txns if t["is_fraud"])
    normal_count = len(txns) - fraud_count
    print(f"\n  ✓ Total transactions: {len(txns)}")
    print(f"    Normal : {normal_count} ({normal_count/len(txns)*100:.1f}%)")
    print(f"    Fraud  : {fraud_count} ({fraud_count/len(txns)*100:.1f}%)\n")

    # --- Sort by timestamp (important for simulator replay) ---
    txns.sort(key=lambda t: t["timestamp"])

    # --- Save to SQLite ---
    print(f"Saving to SQLite → {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    init_db(conn)
    save_to_db(conn, accounts, txns)
    conn.close()
    print("  ✓ SQLite saved\n")

    # --- Save to JSON ---
    print(f"Saving to JSON   → {JSON_PATH}")
    with open(JSON_PATH, "w") as f:
        json.dump({"accounts": accounts, "transactions": txns}, f, indent=2)
    print("  ✓ JSON saved\n")

    print(f"{'='*55}")
    print(f"  Done! Fraud rate: {fraud_count/len(txns)*100:.1f}%")
    print(f"{'='*55}\n")

if __name__ == "__main__":
    main()
