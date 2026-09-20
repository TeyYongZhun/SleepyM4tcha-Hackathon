"""Turn model output into the JSON shape the Next.js frontend renders.

Every field name and value here is dictated by `src/lib/types.ts` and
`src/lib/api/adapters.ts` on the frontend. Keep the two in step: the adapter
validates category/status and silently drops anything it does not recognise.

Nothing here translates category names. The classifier already emits the
labels the UI uses ("BL_COMPARISON"); `adaptCategory` lower-cases them.
"""
from __future__ import annotations

import re
from pathlib import Path

# Sam's canonical field names -> the frontend's ShipmentFieldKey (src/lib/types.ts).
# Only the names that actually differ need an entry; the rest pass through.
FIELD_KEY = {
    "container_count": "containers",
    "gross_weight_kg": "gross_weight",
    "vessel_voyage": "vessel",
    "bl_number": "bl_number",
    "booking_no": "booking_ref",
    "oc_number": "oc_no",
    "commodity": "goods_description",
}

# Human-readable label (Sam's DISPLAY_NAME) -> ShipmentFieldKey, for comparison rows.
DISPLAY_TO_KEY = {
    "Shipper": "shipper",
    "Consignee": "consignee",
    "Notify Party": "notify_party",
    "Port of Loading": "port_of_loading",
    "Port of Discharge": "port_of_discharge",
    "Container Count": "containers",
    "Gross Weight (KG)": "gross_weight",
}

# Canonical field order, so defect_fields always reads the same way
# (mirrors COMPARISON_FIELDS in sdoc_comparator/src/label_vocab.py).
COMPARISON_ORDER = [
    "shipper",
    "consignee",
    "notify_party",
    "port_of_loading",
    "port_of_discharge",
    "container_count",
    "gross_weight",
]

_MIME = {
    ".txt": "text/plain",
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

HEADLINE = {
    "BL_COMPARISON": "Draft B/L to check against the SI",
    "SI_REQUEST": "Shipping instruction requested",
    "INVOICE_QUERY": "Billing / charges query",
    "GENERAL": "General notice",
    "SPAM": "Likely spam / phishing",
}

REASON = {
    "BL_COMPARISON": "Refers to a draft bill of lading to be checked against the shipping instruction.",
    "SI_REQUEST": "Asks for a shipping instruction to be prepared, issued or submitted.",
    "INVOICE_QUERY": "About billing, charges, credit notes or payment.",
    "GENERAL": "Automated notice or general correspondence; no document action found.",
    "SPAM": "Sender or wording matches known phishing / promotional patterns.",
}


def address(raw: str) -> dict:
    """"Jane <jane@x.com>" or "jane@x.com" -> {name?, email}. The frontend
    accepts a bare string too, but sending the object keeps display names."""
    raw = (raw or "").strip()
    m = re.match(r"^\s*(.*?)\s*<([^>]+)>\s*$", raw)
    if m:
        return {"name": m.group(1).strip(), "email": m.group(2).strip()}
    return {"email": raw}


def attachment(path: str, email_id: str) -> dict:
    """`Attachment.id` doubles as the on-disk name the /attachments route serves."""
    name = Path(path).name
    return {
        "id": name,
        "filename": name,
        "mime_type": _MIME.get(Path(name).suffix.lower(), "application/octet-stream"),
        "size": 0,
        "url": f"/api/demo-attachments/{name}",
    }


def kind_of(filename: str) -> str:
    """SI / BL / OTHER from the filename, mirroring the frontend's kindFromFilename."""
    stem = Path(filename).stem
    if re.search(r"(^|[_\-. ])SI([_\-. ]|$)", stem, re.I):
        return "SI"
    if re.search(r"(^|[_\-. ])BL([_\-. ]|$)", stem, re.I):
        return "BL"
    return "OTHER"


def summary(category: str, confidence: float, attachment_count: int, body: str) -> dict:
    """EmailSummary. `confidence` must stay 0..1: the panel renders it as
    Math.round(confidence * 100), so 95 would display as "9500%"."""
    fields = [{"label": "Document type", "value": category}]
    if attachment_count:
        fields.append({"label": "Attachments", "value": str(attachment_count)})
    first = re.split(r"\n\s*\n|Best Regards|Regards|Thank you", body.strip(), maxsplit=1)[0]
    return {
        "headline": HEADLINE.get(category, category),
        "summary": " ".join(first.split())[:280] or "(no body)",
        "reason": REASON.get(category, ""),
        "confidence": round(float(confidence), 4),
        "fields": fields,
    }


def email_json(record, prediction, comparison: dict | None = None) -> dict:
    """One frontend `Email`. `comparison` is analyze_pair()'s result, or None
    when the email was not compared (not BL_COMPARISON, or no SI/BL pair)."""
    out = {
        "email_id": record.email_id,
        "from": address(record.sender),
        "to": [],
        "subject": record.subject,
        "body": record.body,
        "body_type": "text",
        "attachments": [attachment(a, record.email_id) for a in record.attachments],
        "category": prediction.category,
        "summary": summary(
            prediction.category, prediction.confidence, len(record.attachments), record.body
        ),
    }
    if comparison:
        out.update(comparison_json(comparison))
    return out


def comparison_json(comparison: dict) -> dict:
    """analyze_pair()'s result in the shape the frontend reads.

    Shared by GET /emails/{id} (seeded inbox, files already on disk) and
    POST /compare (Gmail attachments, uploaded), so the field mapping and the
    MISMATCH-only rule below live in exactly one place.
    """
    return {
        "status": comparison["status"],
        "review_reason": comparison["reason"],
        # Only a MISMATCH has defect fields. A NEEDS_REVIEW pair was never fully
        # compared, so reporting "defects" for it would be wrong -- this mirrors
        # result_to_json() in sdoc_comparator/src/main.py.
        "defect_fields": (
            [FIELD_KEY.get(f, f) for f in COMPARISON_ORDER if f in comparison["mismatch_fields"]]
            if comparison["status"] == "MISMATCH"
            else []
        ),
        "shipment_comparison": [
            {
                "field": DISPLAY_TO_KEY.get(row["field"], row["field"]),
                "si_value": row["si_value"],
                "bl_value": row["bl_value"],
                "status": row["status"],
            }
            for row in comparison["rows"]
        ],
    }
