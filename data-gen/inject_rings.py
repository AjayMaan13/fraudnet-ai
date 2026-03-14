"""
FraudNet-AI — Fraud Ring Injector
Adds new circular money-laundering rings to the database using existing accounts.
Timestamps are set to NOW so rings are immediately detected by the graph engine.

Usage:
  python3 data-gen/inject_rings.py              # inject 3 rings (default)
  python3 data-gen/inject_rings.py --rings 5    # inject 5 rings
  python3 data-gen/inject_rings.py --rings 2 --min-size 3 --max-size 7
"""

import argparse
import random
import sqlite3
import uuid
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "transactions.db"


def inject_rings(n_rings: int = 3, min_size: int = 4, max_size: int = 6, seed: int | None = None):
    if seed is not None:
        random.seed(seed)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Pull existing personal accounts to pick ring members from
    cur.execute("SELECT id FROM accounts WHERE account_type = 'personal'")
    personal_ids = [r["id"] for r in cur.fetchall()]

    if len(personal_ids) < max_size:
        print(f"  ❌ Not enough personal accounts ({len(personal_ids)}). Run generate.py first.")
        conn.close()
        return []

    injected = []
    now = datetime.utcnow()

    for ring_num in range(n_rings):
        ring_size = random.randint(min_size, max_size)
        ring_accounts = random.sample(personal_ids, ring_size)

        amount = round(random.uniform(8_000, 50_000), 2)
        fee = 0.08  # 8% laundering fee per hop
        window_hours = random.uniform(0.5, 4)
        start_ts = now - timedelta(hours=random.uniform(0.1, 2))  # always within last 2h

        ring_txns = []
        for i, sender in enumerate(ring_accounts):
            receiver = ring_accounts[(i + 1) % ring_size]
            ts = start_ts + timedelta(minutes=random.uniform(0, window_hours * 60))
            tx_id = str(uuid.uuid4())
            ring_txns.append({
                "id":           tx_id,
                "from_account": sender,
                "to_account":   receiver,
                "amount":       round(amount, 2),
                "timestamp":    ts.isoformat(),
                "tx_type":      "fraud_circular",
                "is_fraud":     1,
            })
            amount *= (1 - fee)  # each hop loses 8%

        # Insert into SQLite
        for tx in ring_txns:
            try:
                cur.execute(
                    "INSERT INTO transactions (id, from_account, to_account, amount, timestamp, tx_type, is_fraud) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (tx["id"], tx["from_account"], tx["to_account"],
                     tx["amount"], tx["timestamp"], tx["tx_type"], tx["is_fraud"])
                )
            except sqlite3.IntegrityError:
                pass  # already exists

        total = sum(t["amount"] for t in ring_txns)
        print(f"  ✅ Ring {ring_num + 1}: {ring_size} accounts, ${total:,.0f} cycled, "
              f"{window_hours:.1f}h window, starts {start_ts.strftime('%H:%M:%S')}")
        injected.append(ring_txns)

    conn.commit()
    conn.close()
    print(f"\n  SQLite: {n_rings} rings inserted ({sum(len(r) for r in injected)} transactions)")

    # Sync to Db2 if credentials available
    _sync_to_db2(injected)

    return injected


def _sync_to_db2(rings: list[list[dict]]):
    """Push injected transactions to Db2 if configured."""
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent))

    try:
        from backend.db2_client import DB2_DSN, get_db2_connection
        if not DB2_DSN:
            print("  Db2: no credentials — skipped (SQLite only)")
            return

        import ibm_db
        conn = get_db2_connection()
        inserted = 0

        for ring in rings:
            for tx in ring:
                sql = (
                    "INSERT INTO fraudnet_transactions "
                    "(tx_id, from_account, to_account, amount, tx_timestamp, tx_type, is_fraud) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)"
                )
                try:
                    stmt = ibm_db.prepare(conn, sql)
                    ibm_db.bind_param(stmt, 1, tx["id"])
                    ibm_db.bind_param(stmt, 2, tx["from_account"])
                    ibm_db.bind_param(stmt, 3, tx["to_account"])
                    ibm_db.bind_param(stmt, 4, tx["amount"])
                    ibm_db.bind_param(stmt, 5, tx["timestamp"])
                    ibm_db.bind_param(stmt, 6, tx["tx_type"])
                    ibm_db.bind_param(stmt, 7, tx["is_fraud"])
                    ibm_db.execute(stmt)
                    inserted += 1
                except Exception:
                    pass  # already exists

        print(f"  Db2: {inserted} transactions synced")

    except Exception as e:
        print(f"  Db2: skipped ({e})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inject circular fraud rings into the database")
    parser.add_argument("--rings",    type=int, default=3, help="Number of rings to inject (default: 3)")
    parser.add_argument("--min-size", type=int, default=4, help="Min accounts per ring (default: 4)")
    parser.add_argument("--max-size", type=int, default=6, help="Max accounts per ring (default: 6)")
    parser.add_argument("--seed",     type=int, default=None, help="Random seed for reproducibility")
    args = parser.parse_args()

    print(f"\n{'=' * 50}")
    print(f"  FraudNet-AI — Injecting {args.rings} Fraud Ring(s)")
    print(f"{'=' * 50}")
    inject_rings(args.rings, args.min_size, args.max_size, args.seed)
    print(f"\n  Restart the backend to detect the new rings.")
    print(f"{'=' * 50}\n")
