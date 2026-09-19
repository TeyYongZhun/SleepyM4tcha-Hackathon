"""EmailRecord -> Features (cleaned text + flat flag dict for DictVectorizer)."""
import math
import re
from pathlib import PurePosixPath

from .cleaning import clean_email
from .patterns import (ATTACHMENT_CLAIM, BODY_REGEX, SUBJECT_REGEX, coded_subject_kind,
                       count_hits, subject_field_count)
from .schema import CleanedEmail, EmailRecord, Features

_SI_FILE = re.compile(r"(?:^|[_\-\s.])(?:SI|shipping[_\-\s]?instructions?)(?:$|[_\-\s.])", re.I)
_BL_FILE = re.compile(r"(?:^|[_\-\s.])(?:BL|B-L|bill[_\-\s]?of[_\-\s]?lading)(?:$|[_\-\s.])", re.I)


def _stem(path: str) -> str:
    return PurePosixPath(path.replace("\\", "/")).stem


def attachment_flags(attachments: list[str]) -> dict[str, int]:
    stems = [_stem(a) for a in attachments]
    has_si = any(_SI_FILE.search(s) for s in stems)
    has_bl = any(_BL_FILE.search(s) for s in stems)
    return {
        "n_attachments": len(attachments),
        "has_si_file": int(has_si),
        "has_bl_file": int(has_bl),
        "has_doc_pair": int(has_si and has_bl),
    }


def sender_domain(sender: str) -> str:
    return sender.rsplit("@", 1)[-1].strip().lower() if "@" in sender else ""


def compute_flags(email: CleanedEmail) -> dict[str, int | float]:
    rec = email.record
    subject_text = email.subject_clean.replace("_", " ")
    coded = coded_subject_kind(email.subject_clean)

    flags: dict[str, int | float] = {}
    for cat, regexes in SUBJECT_REGEX.items():
        flags[f"subject_hit_{cat}"] = count_hits(regexes, subject_text)
    for cat, regexes in BODY_REGEX.items():
        flags[f"body_hit_{cat}"] = count_hits(regexes, email.body_clean)

    flags.update({
        "coded_prefix_dept": int(coded == "dept"),
        "coded_prefix_si": int(coded == "si"),
        "has_rpa_marker": int("_RPA_" in rec.subject.upper()),
        **attachment_flags(rec.attachments),
        "body_claims_attachment": int(bool(ATTACHMENT_CLAIM.search(email.body_clean))),
        "is_reply": int(email.is_reply),
        "is_external": int(email.is_external),
        "has_quoted_thread": int(bool(email.body_quoted.strip())),
        "sender_is_internal": int("april" in sender_domain(rec.sender)),
        # log-scaled so a raw character count doesn't dominate the linear model
        "body_len_log": math.log1p(len(email.body_clean)),
        "subject_field_count": subject_field_count(email.subject_clean),
    })
    return flags


def featurize(record: EmailRecord) -> Features:
    email = clean_email(record)
    return Features(email=email, flags=compute_flags(email))


def featurize_all(records: list[EmailRecord]) -> list[Features]:
    return [featurize(r) for r in records]
