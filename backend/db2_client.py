"""
FraudNet-AI — IBM Db2 Client
Loads transaction data into Db2 and provides a read interface.
Falls back to SQLite if Db2 is unavailable.

Env vars required (backend/.env):
    DB2_HOSTNAME=xxx.databases.appdomain.cloud
    DB2_PORT=50001
    DB2_DATABASE=BLUDB
    DB2_USERNAME=xxx
    DB2_PASSWORD=xxx
    DB2_SSL=true
"""

import os
import sqlite3
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

def _build_dsn() -> str:
    host = os.getenv("DB2_HOSTNAME", "")
    port = os.getenv("DB2_PORT", "50001")
    db   = os.getenv("DB2_DATABASE", "BLUDB")
    uid  = os.getenv("DB2_USERNAME", "")
    pwd  = os.getenv("DB2_PASSWORD", "")
    ssl  = os.getenv("DB2_SSL", "true").lower() == "true"
    if not host or not uid or not pwd:
        return ""
    dsn = f"DATABASE={db};HOSTNAME={host};PORT={port};PROTOCOL=TCPIP;UID={uid};PWD={pwd}"
    if ssl:
        dsn += ";Security=SSL"
    return dsn

DB2_DSN   = _build_dsn()
REPO_ROOT = Path(__file__).parent.parent
DB_PATH   = str(REPO_ROOT / "data-gen" / "transactions.db")


# ─────────────────────────────────────────────
# DB2 SCHEMA
# ─────────────────────────────────────────────

CREATE_ACCOUNTS_SQL = """
CREATE TABLE IF NOT EXISTS fraudnet_accounts (
    account_id   VARCHAR(36)  NOT NULL PRIMARY KEY,
    account_name VARCHAR(100),
    account_type VARCHAR(20),
    created_at   TIMESTAMP
)
"""

CREATE_TRANSACTIONS_SQL = """
CREATE TABLE IF NOT EXISTS fraudnet_transactions (
    tx_id        VARCHAR(36)    NOT NULL PRIMARY KEY,
    from_account VARCHAR(36),
    to_account   VARCHAR(36),
    amount       DECIMAL(15, 2),
    tx_timestamp TIMESTAMP,
    tx_type      VARCHAR(30),
    is_fraud     SMALLINT
)
"""


# ─────────────────────────────────────────────
# CONNECTION
# ─────────────────────────────────────────────

def get_db2_connection():
    """Return an ibm_db connection or raise if unavailable."""
    import ibm_db  # type: ignore
    conn = ibm_db.connect(DB2_DSN, "", "")
    if not conn:
        raise ConnectionError(f"ibm_db.connect failed: {ibm_db.conn_errormsg()}")
    return conn


# ─────────────────────────────────────────────
# SCHEMA SETUP
# ─────────────────────────────────────────────

def setup_schema(conn) -> None:
    """Create tables if they don't exist."""
    import ibm_db
    for sql in (CREATE_ACCOUNTS_SQL, CREATE_TRANSACTIONS_SQL):
        stmt = ibm_db.exec_immediate(conn, sql)
        if not stmt:
            raise RuntimeError(f"Schema error: {ibm_db.stmt_errormsg()}")
    print("  [Db2] Schema ready (fraudnet_accounts, fraudnet_transactions)")


# ─────────────────────────────────────────────
# DATA LOAD (SQLite → Db2)
# ─────────────────────────────────────────────

def load_data_from_sqlite(conn) -> tuple[int, int]:
    """
    Read accounts + transactions from local SQLite and INSERT into Db2.
    Skips rows that already exist (INSERT OR IGNORE equivalent via error catch).
    Returns (accounts_inserted, transactions_inserted).
    """
    import ibm_db

    sqlite_conn = sqlite3.connect(DB_PATH)
    sqlite_conn.row_factory = sqlite3.Row
    cur = sqlite_conn.cursor()

    # ── Accounts ──
    cur.execute("SELECT id, name, created_at, account_type FROM accounts")
    accounts = cur.fetchall()
    acc_inserted = 0

    for row in accounts:
        sql = (
            "INSERT INTO fraudnet_accounts (account_id, account_name, account_type, created_at) "
            "VALUES (?, ?, ?, ?)"
        )
        try:
            stmt = ibm_db.prepare(conn, sql)
            ibm_db.bind_param(stmt, 1, row["id"])
            ibm_db.bind_param(stmt, 2, row["name"])
            ibm_db.bind_param(stmt, 3, row["account_type"])
            ibm_db.bind_param(stmt, 4, row["created_at"])
            ibm_db.execute(stmt)
            acc_inserted += 1
        except Exception:
            pass  # already exists

    # ── Transactions ──
    cur.execute("SELECT id, from_account, to_account, amount, timestamp, tx_type, is_fraud FROM transactions")
    txns = cur.fetchall()
    tx_inserted = 0

    for row in txns:
        sql = (
            "INSERT INTO fraudnet_transactions "
            "(tx_id, from_account, to_account, amount, tx_timestamp, tx_type, is_fraud) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        try:
            stmt = ibm_db.prepare(conn, sql)
            ibm_db.bind_param(stmt, 1, row["id"])
            ibm_db.bind_param(stmt, 2, row["from_account"])
            ibm_db.bind_param(stmt, 3, row["to_account"])
            ibm_db.bind_param(stmt, 4, row["amount"])
            ibm_db.bind_param(stmt, 5, row["timestamp"])
            ibm_db.bind_param(stmt, 6, row["tx_type"])
            ibm_db.bind_param(stmt, 7, int(row["is_fraud"]))
            ibm_db.execute(stmt)
            tx_inserted += 1
        except Exception:
            pass  # already exists

    sqlite_conn.close()
    print(f"  [Db2] Loaded {acc_inserted} accounts, {tx_inserted} transactions")
    return acc_inserted, tx_inserted


# ─────────────────────────────────────────────
# READ — fetch transactions from Db2
# ─────────────────────────────────────────────

def fetch_transactions(conn) -> list[dict]:
    """Fetch all transactions from Db2, return as list of dicts."""
    import ibm_db

    sql = (
        "SELECT tx_id, from_account, to_account, amount, tx_timestamp, tx_type, is_fraud "
        "FROM fraudnet_transactions ORDER BY tx_timestamp"
    )
    stmt = ibm_db.exec_immediate(conn, sql)
    rows = []
    row = ibm_db.fetch_assoc(stmt)
    while row:
        rows.append({
            "id":           row["TX_ID"],
            "from_account": row["FROM_ACCOUNT"],
            "to_account":   row["TO_ACCOUNT"],
            "amount":       float(row["AMOUNT"]),
            "timestamp":    str(row["TX_TIMESTAMP"]),
            "tx_type":      row["TX_TYPE"],
            "is_fraud":     int(row["IS_FRAUD"]),
        })
        row = ibm_db.fetch_assoc(stmt)
    return rows


def fetch_accounts(conn) -> list[dict]:
    """Fetch all accounts from Db2."""
    import ibm_db

    sql = "SELECT account_id, account_name, account_type, created_at FROM fraudnet_accounts"
    stmt = ibm_db.exec_immediate(conn, sql)
    rows = []
    row = ibm_db.fetch_assoc(stmt)
    while row:
        rows.append({
            "id":           row["ACCOUNT_ID"],
            "name":         row["ACCOUNT_NAME"],
            "account_type": row["ACCOUNT_TYPE"],
            "created_at":   str(row["CREATED_AT"]),
        })
        row = ibm_db.fetch_assoc(stmt)
    return rows


# ─────────────────────────────────────────────
# ROW COUNTS
# ─────────────────────────────────────────────

def get_counts(conn) -> dict:
    import ibm_db
    counts = {}
    for table, key in [
        ("fraudnet_accounts",     "accounts"),
        ("fraudnet_transactions", "transactions"),
    ]:
        stmt = ibm_db.exec_immediate(conn, f"SELECT COUNT(*) FROM {table}")
        row  = ibm_db.fetch_tuple(stmt)
        counts[key] = int(row[0]) if row else 0
    return counts


# ─────────────────────────────────────────────
# CONVENIENCE: try Db2, fall back to SQLite
# ─────────────────────────────────────────────

def load_transactions_with_fallback() -> tuple[list[dict], list[dict], str]:
    """
    Try Db2 first. If unavailable, fall back to SQLite.
    Returns (accounts, transactions, source) where source is 'db2' or 'sqlite'.
    """
    if DB2_DSN:
        try:
            conn = get_db2_connection()
            setup_schema(conn)
            load_data_from_sqlite(conn)
            accounts = fetch_accounts(conn)
            txns     = fetch_transactions(conn)
            print(f"  [Db2] Serving {len(txns)} transactions from IBM Db2")
            return accounts, txns, "db2"
        except Exception as e:
            print(f"  [Db2] Unavailable ({e}) — falling back to SQLite")

    # SQLite fallback
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("SELECT id, name, created_at, account_type FROM accounts")
    accounts = [dict(r) for r in cur.fetchall()]
    cur.execute(
        "SELECT id, from_account, to_account, amount, timestamp, tx_type, is_fraud "
        "FROM transactions ORDER BY timestamp"
    )
    txns = [dict(r) for r in cur.fetchall()]
    conn.close()
    print(f"  [SQLite] Serving {len(txns)} transactions")
    return accounts, txns, "sqlite"
