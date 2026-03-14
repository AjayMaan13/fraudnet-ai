"""
FraudNet-AI — IBM Db2 Connection Test
Run from repo root: python3 backend/test_db2.py

Tests:
  1. Env var / DSN format
  2. ibm_db package installed
  3. Live connection to Db2
  4. Schema creation (CREATE TABLE IF NOT EXISTS)
  5. Data load from SQLite → Db2
  6. Row counts in Db2
  7. Sample query (fetch 3 fraud transactions)
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

DSN = os.getenv("DB2_DSN", "")


def sep(title: str):
    print(f"\n{'=' * 55}")
    print(f"  {title}")
    print("=" * 55)


# ─────────────────────────────────────────────
# TEST 1: Env var
# ─────────────────────────────────────────────

def test_env() -> bool:
    sep("TEST 1 — DB2_DSN Environment Variable")
    if not DSN:
        print("  ❌ DB2_DSN is not set in backend/.env")
        print("     Add:  DB2_DSN=DATABASE=BLUDB;HOSTNAME=...;PORT=30756;PROTOCOL=TCPIP;UID=...;PWD=...;Security=SSL")
        return False

    # Show sanitized DSN (hide password)
    parts = dict(p.split("=", 1) for p in DSN.split(";") if "=" in p)
    sanitized = ";".join(
        f"{k}={'*****' if k.upper() in ('PWD', 'PASSWORD') else v}"
        for k, v in parts.items()
    )
    print(f"  ✅ DSN found: {sanitized}")

    required = {"DATABASE", "HOSTNAME", "PORT", "UID", "PWD"}
    missing  = required - {k.upper() for k in parts}
    if missing:
        print(f"  ⚠️  Missing DSN fields: {missing}")
        return False
    return True


# ─────────────────────────────────────────────
# TEST 2: ibm_db installed
# ─────────────────────────────────────────────

def test_package() -> bool:
    sep("TEST 2 — ibm_db Package")
    try:
        import ibm_db
        print(f"  ✅ ibm_db imported successfully")
        return True
    except ImportError:
        print("  ❌ ibm_db not installed.")
        print("     Run: pip3 install ibm_db")
        print("     (takes 3–5 minutes — it compiles a C extension)")
        return False


# ─────────────────────────────────────────────
# TEST 3: Live connection
# ─────────────────────────────────────────────

def test_connection():
    sep("TEST 3 — Live Db2 Connection")
    try:
        from backend.db2_client import get_db2_connection
        conn = get_db2_connection()
        print("  ✅ Connected to IBM Db2")
        return conn
    except Exception as e:
        print(f"  ❌ Connection failed: {type(e).__name__}: {e}")
        return None


# ─────────────────────────────────────────────
# TEST 4: Schema creation
# ─────────────────────────────────────────────

def test_schema(conn) -> bool:
    sep("TEST 4 — Schema Creation")
    try:
        from backend.db2_client import setup_schema
        setup_schema(conn)
        print("  ✅ Tables created / verified")
        return True
    except Exception as e:
        print(f"  ❌ Schema error: {e}")
        return False


# ─────────────────────────────────────────────
# TEST 5: Data load
# ─────────────────────────────────────────────

def test_load(conn) -> bool:
    sep("TEST 5 — Load Data (SQLite → Db2)")
    try:
        from backend.db2_client import load_data_from_sqlite
        acc, tx = load_data_from_sqlite(conn)
        print(f"  ✅ Inserted {acc} accounts, {tx} transactions (0 = already loaded)")
        return True
    except Exception as e:
        print(f"  ❌ Load error: {e}")
        return False


# ─────────────────────────────────────────────
# TEST 6: Row counts
# ─────────────────────────────────────────────

def test_counts(conn):
    sep("TEST 6 — Row Counts in Db2")
    try:
        from backend.db2_client import get_counts
        counts = get_counts(conn)
        print(f"  ✅ fraudnet_accounts     : {counts['accounts']:,} rows")
        print(f"  ✅ fraudnet_transactions : {counts['transactions']:,} rows")
    except Exception as e:
        print(f"  ❌ Count error: {e}")


# ─────────────────────────────────────────────
# TEST 7: Sample fraud query
# ─────────────────────────────────────────────

def test_query(conn):
    sep("TEST 7 — Sample Query (fraud transactions)")
    try:
        import ibm_db
        sql = (
            "SELECT tx_id, from_account, to_account, amount, tx_type "
            "FROM fraudnet_transactions WHERE is_fraud = 1 FETCH FIRST 3 ROWS ONLY"
        )
        stmt = ibm_db.exec_immediate(conn, sql)
        row  = ibm_db.fetch_assoc(stmt)
        count = 0
        while row:
            print(f"  ✅ {row['TX_TYPE']:20s}  ${float(row['AMOUNT']):>10,.2f}  "
                  f"{row['FROM_ACCOUNT'][:8]}→{row['TO_ACCOUNT'][:8]}")
            row = ibm_db.fetch_assoc(stmt)
            count += 1
        if count == 0:
            print("  ⚠️  No fraud rows found — run data loader first")
    except Exception as e:
        print(f"  ❌ Query error: {e}")


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    sep("FraudNet-AI — IBM Db2 Connection Test")

    ok = test_env()
    if not ok:
        sep("Done — fix DB2_DSN first")
        return

    ok = test_package()
    if not ok:
        sep("Done — install ibm_db first")
        return

    conn = test_connection()
    if not conn:
        sep("Done — fix connection credentials")
        return

    test_schema(conn)
    test_load(conn)
    test_counts(conn)
    test_query(conn)

    sep("All tests complete")
    print()


if __name__ == "__main__":
    main()
