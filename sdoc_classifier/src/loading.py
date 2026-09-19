"""Inbox JSON -> EmailRecord, plus ground-truth loading."""
import json
import re
from pathlib import Path

from .config import GROUND_TRUTH_PATH, INBOX_DIR, TRAIN_MAX_INDEX
from .schema import EmailRecord

_ID_RE = re.compile(r"^email_(\d+)$")


def parse_record(raw: dict) -> EmailRecord:
    return EmailRecord(
        email_id=str(raw["email_id"]),
        sender=str(raw.get("from") or raw.get("sender") or ""),
        subject=str(raw.get("subject") or ""),
        body=str(raw.get("body") or ""),
        attachments=[str(a) for a in (raw.get("attachments") or [])],
    )


def load_email(path: Path) -> EmailRecord:
    with open(path, encoding="utf-8") as f:
        return parse_record(json.load(f))


def inbox_paths(inbox_dir: Path = INBOX_DIR) -> list[Path]:
    """All email_*.json files, in id order."""
    return sorted(Path(inbox_dir).glob("email_*.json"), key=lambda p: email_index(p.stem))


def load_inbox(inbox_dir: Path = INBOX_DIR) -> list[EmailRecord]:
    return [load_email(p) for p in inbox_paths(inbox_dir)]


def load_ground_truth(path: Path = GROUND_TRUTH_PATH) -> dict[str, str]:
    """email_id -> category."""
    with open(path, encoding="utf-8") as f:
        return {eid: rec["category"] for eid, rec in json.load(f).items()}


def load_labelled_file(path: Path) -> tuple[list[EmailRecord], list[str]]:
    """A JSON list of email records that each also carry a "category"."""
    with open(path, encoding="utf-8") as f:
        raw = json.load(f)
    return [parse_record(r) for r in raw], [r["category"] for r in raw]


def email_index(email_id: str) -> int:
    m = _ID_RE.match(email_id)
    return int(m.group(1)) if m else 10**9


def is_training_id(email_id: str) -> bool:
    return email_index(email_id) <= TRAIN_MAX_INDEX
