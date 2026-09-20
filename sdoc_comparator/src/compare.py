import re
import unicodedata
from decimal import Decimal, InvalidOperation

from label_vocab import COMPARISON_FIELDS, DISPLAY_NAME, MISSING_VALUE

MATCH, MISMATCH, UNSURE = "match", "mismatch", "unsure"   # one field
PAIR_OK, PAIR_MISMATCH, PAIR_REVIEW = "OK", "MISMATCH", "NEEDS_REVIEW"   # a whole SI/BL pair
EMPTY = "{empty}"

PORT_FIELDS = {"port_of_loading", "port_of_discharge"}

# Blank-form placeholders that mean "no value was given": "____MT", "TBA", "N/A", ...
PLACEHOLDER = re.compile(
    r"[\W_]*(?:_{2,}\s*[A-Za-z]{0,4}|TBA|TBC|TBD|N/?A|NIL|NONE|TO BE (?:ADVISED|CONFIRMED|DETERMINED))[\W_]*",
    re.IGNORECASE,
)


# ---------- step: clean and format the values ----------

def clean_value(field: str, value) -> str:
    """Make values comparable despite formatting noise (case, punctuation,
    line-break separators, units, port codes). Returns "" if nothing usable
    is left. Extend this as you find more real-world variants."""
    if value is None:
        return ""
    value = unicodedata.normalize("NFKC", str(value)).strip()
    if PLACEHOLDER.fullmatch(value):
        return ""

    if field == "gross_weight":
        # "131,058 KG" / "131058" / "131,058.000" -> "131058"
        match = re.search(r"\d[\d,]*(?:\.\d+)?", value)
        if not match:
            return ""
        try:
            number = Decimal(match.group(0).replace(",", "")).normalize()
        except InvalidOperation:
            return ""
        return format(number, "f")

    if field == "container_count":
        # "6 x 40'HC" -> pull out the count number for comparison
        match = re.search(r"\d+", value)
        return match.group(0) if match else re.sub(r"\s+", " ", value).lower()

    if field in PORT_FIELDS:
        # "NANTONG, CHINA (CNNTG)" -> drop the trailing 5-letter UN/LOCODE
        value = re.sub(r"\(\s*[A-Za-z]{5}\s*\)", " ", value)

    # Default (names, addresses, ports): ignore case, punctuation and
    # line-break separators, so "CO., LTD" == "CO LTD" and
    # "NAME | ADDRESS" (xlsx/docx) == "NAME\n  ADDRESS" (txt).
    value = re.sub(r"[.'`]", "", value)
    value = re.sub(r"[^\w]+", " ", value)
    return value.strip().casefold()


# ---------- step: field-by-field comparison ----------

def compare_documents(si_fields: dict, bl_fields: dict):
    """
    Compares the required COMPARISON_FIELDS between an SI and a BL.
    Returns a list of row dicts, one per field, each with a `status` of
    match / mismatch / unsure. si_value / bl_value keep the ORIGINAL text
    (or "{empty}") so the report shows what the documents actually say.
    """
    rows = []
    for field in COMPARISON_FIELDS:
        si_val = si_fields.get(field, "")
        bl_val = bl_fields.get(field, "")

        si_clean = clean_value(field, si_val)
        bl_clean = clean_value(field, bl_val)

        if not si_clean or not bl_clean:
            status = UNSURE
        elif si_clean == bl_clean:
            status = MATCH
        else:
            status = MISMATCH

        rows.append({
            "field": DISPLAY_NAME.get(field, field),
            "si_value": si_val if si_clean else EMPTY,
            "bl_value": bl_val if bl_clean else EMPTY,
            "status": status,
        })
    return rows


def pair_status(rows):
    """Overall result for a pair, as (status, reason). Same vocabulary as
    data/ground_truth.json. Any unsure field needs a human even when other
    fields also mismatch (the report still lists those mismatches)."""
    if any(r["status"] == UNSURE for r in rows):
        return PAIR_REVIEW, MISSING_VALUE
    if any(r["status"] == MISMATCH for r in rows):
        return PAIR_MISMATCH, None
    return PAIR_OK, None


# ---------- summary report ----------

def _short(text: str, width: int = 45) -> str:
    return text if len(text) <= width else text[:width - 3] + "..."


def format_report(rows, si_needs_review=None, bl_needs_review=None) -> str:
    mismatches = [r for r in rows if r["status"] == MISMATCH]
    unsure = [r for r in rows if r["status"] == UNSURE]
    lines = []

    if not mismatches and not unsure:
        lines.append(f"No mismatch. All {len(rows)} fields match.")

    if mismatches:
        lines.append("Mismatch detected.")
        for r in mismatches:
            lines.append(f"  [{r['field']}] SI: {r['si_value']} | BL: {r['bl_value']}")

    if unsure:
        if mismatches:
            lines.append("")
        lines.append(f"Require Human Intervention. Reason: {MISSING_VALUE}")
        for r in unsure:
            lines.append(f"  [{r['field']}] SI: {r['si_value']} | BL: {r['bl_value']}")

    lines.append("\n--- Full field-by-field comparison ---")
    for r in rows:
        tag = {MATCH: "OK", MISMATCH: "XX", UNSURE: "??"}[r["status"]]
        lines.append(f"  [{tag}] {r['field']:<20} SI: {_short(r['si_value']):<45} BL: {_short(r['bl_value'])}")

    review = (si_needs_review or []) + (bl_needs_review or [])
    if review:
        lines.append("\n--- Labels the classifier wasn't confident about (needs human review) ---")
        for raw_label, value, confidence in review:
            lines.append(f"  '{raw_label}' -> '{_short(value)}'  (confidence {confidence:.2f})")

    return "\n".join(lines)


def format_escalation(reason: str, problems) -> str:
    """Report for a pair that can't be compared at all. `problems` is a list of
    (reason, text) so each line says which reason it is; `reason` is the main one."""
    lines = [f"Require Human Intervention. Reason: {reason}. Comparison could not be completed."]
    lines += [f"  [{r}] {text}" for r, text in problems]
    return "\n".join(lines)
