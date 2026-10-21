"""Consistent SQLite backup, including committed WAL data. Never mutates source.
Usage: python scripts/backup-sqlite.py /absolute/source.db /absolute/new-backup.db
Stop writes before migration; keep the backup until the upgrade is verified.
"""
import os
import sqlite3
import sys
from pathlib import Path

source, destination = (Path(value).resolve() for value in sys.argv[1:])
if not source.is_file() or source == destination:
    raise SystemExit("Use an existing database and a different backup path.")
fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
os.close(fd)
try:
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as src:
        with sqlite3.connect(destination) as dst:
            src.backup(dst)
            if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity check failed")
    print("Backup created and integrity checked.")
except Exception:
    destination.unlink(missing_ok=True)
    raise
