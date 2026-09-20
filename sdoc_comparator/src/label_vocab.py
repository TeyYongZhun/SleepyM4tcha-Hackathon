import re
import unicodedata

# The seven fields that must be checked.
COMPARISON_FIELDS = [
    "shipper",
    "consignee",
    "notify_party",
    "port_of_loading",
    "port_of_discharge",
    "container_count",
    "gross_weight",
]

# Every canonical field the label-classifier can predict. Superset of
# COMPARISON_FIELDS because a document has extra fields (HS code, vessel,
# etc.) that aren't compared but are still useful to extract/display.
ALL_FIELDS = COMPARISON_FIELDS + [
    "vessel_voyage",
    "commodity",
    "hs_code",
    "bl_number",
    "booking_no",
    "freight",
    "oc_number",
]

# Why a pair needs a human. Same names as `review_reason` in data/ground_truth.json.
# When several apply, the first in this order is reported as the main reason.
MISSING_ATTACHMENT = "missing_attachment"  # only one of the SI / BL was received
UNREADABLE = "unreadable"                  # can't be opened, empty, or a scan with no text layer
WRONG_DOC_TYPE = "wrong_doc_type"          # opened fine but isn't an SI / BL (invoice, packing list, ...)
MISSING_VALUE = "missing_value"            # a compared field is blank / a placeholder on either side
REVIEW_REASONS = [MISSING_ATTACHMENT, UNREADABLE, WRONG_DOC_TYPE, MISSING_VALUE]

# Human-readable labels for the report.
DISPLAY_NAME = {
    "shipper": "Shipper",
    "consignee": "Consignee",
    "notify_party": "Notify Party",
    "port_of_loading": "Port of Loading",
    "port_of_discharge": "Port of Discharge",
    "container_count": "Container Count",
    "gross_weight": "Gross Weight (KG)",
}


def normalize_label(text: str) -> str:
    """Shared by training and prediction (it is baked into the saved model's
    vectorizer) so both always see labels the same way. NFKC folds
    full-width / compatibility characters (e.g. Chinese full-width colon
    or brackets) into their standard forms."""
    text = unicodedata.normalize("NFKC", str(text))
    text = re.sub(r"\s+", " ", text).strip().strip(":").strip()
    return text.lower()
