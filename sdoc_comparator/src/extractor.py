import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

import joblib
import openpyxl
import pdfplumber

import label_vocab  # noqa: F401  (the saved model references label_vocab.normalize_label)
from label_vocab import UNREADABLE, WRONG_DOC_TYPE

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "label_classifier.joblib"
TRAINING_DATA_PATH = ROOT / "data" / "label_training_data.csv"
CONFIDENCE_THRESHOLD = 0.20

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class UnreadableFile(Exception):
    """The attachment can't be turned into text a person could read.
    The message is the human-readable reason shown in the report."""


# ---------- label classifier ----------

_model = None


def _get_model():
    global _model
    if _model is None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                "No trained model found."
            )
        _model = joblib.load(MODEL_PATH)
    return _model


def _label_variants(raw_label: str):
    """Bilingual labels like 'Gross Weight毛重(KGS)' or 'Notify (通知人)' mix
    scripts. Besides the full string, also try the Latin-script part and the
    non-Latin part on their own, so either language can carry the match."""
    latin, other = [], []
    for ch in raw_label:
        if ch.isalpha() and "LATIN" not in unicodedata.name(ch, ""):
            other.append(ch)
            latin.append(" ")
        else:
            latin.append(ch)
    variants = [raw_label]
    if other:
        latin_part = re.sub(r"\(\s*\)", " ", "".join(latin)).strip()
        if latin_part:
            variants.append(latin_part)
        variants.append("".join(other))
    return variants


def classify_label(raw_label: str):
    """Map a raw label string to a canonical field name + confidence.
    Returns (None, confidence) if below threshold -> caller should flag for review."""
    model = _get_model()
    raw_label = raw_label.strip().strip(":").strip()
    if not raw_label:
        return None, 0.0
    probs = model.predict_proba(_label_variants(raw_label))
    row, col = divmod(int(probs.argmax()), probs.shape[1])
    field = model.classes_[col]
    confidence = probs[row, col]
    if confidence < CONFIDENCE_THRESHOLD:
        return None, confidence
    return field, confidence


# ---------- step 1+2: readability check and text extraction ----------

def _flat(text) -> str:
    """Collapse a multi-line cell/value onto one line, keeping the line breaks as ' | '."""
    parts = [p.strip() for p in str(text).splitlines()]
    return " | ".join(p for p in parts if p)


def _read_txt_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig", errors="ignore")


def _read_xlsx_text(path: Path) -> str:
    lines = []
    wb = openpyxl.load_workbook(path, data_only=True)
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            if len(row) >= 2 and row[0] and row[1] is not None:
                label = _flat(row[0]).rstrip(":").strip()
                value = _flat(row[1])
                if label and value:
                    lines.append(f"{label}: {value}")
    return "\n".join(lines)


def _docx_paragraph(p) -> str:
    """Text of one <w:p>, turning soft line breaks into newlines."""
    out = []
    for el in p.iter():
        if el.tag == W + "t":
            out.append(el.text or "")
        elif el.tag in (W + "br", W + "cr"):
            out.append("\n")
        elif el.tag == W + "tab":
            out.append(" ")
    return "".join(out)


def _read_docx_text(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    lines = []
    for el in root.find(W + "body"):
        if el.tag == W + "p":
            text = _flat(_docx_paragraph(el))
            if text:
                lines.append(text)
        elif el.tag == W + "tbl":
            for tr in el.findall(W + "tr"):
                cells = [_flat("\n".join(_docx_paragraph(p) for p in tc.findall(W + "p")))
                         for tc in tr.findall(W + "tc")]
                cells = [c for c in cells if c]
                if len(cells) >= 2:
                    lines.append(f"{cells[0].rstrip(':').strip()}: {' | '.join(cells[1:])}")
                elif cells:
                    lines.append(cells[0])
    return "\n".join(lines)


def _read_pdf_text(path: Path) -> str:
    with pdfplumber.open(path) as pdf:
        # use_text_flow: read characters in the order they were written, not
        # sorted left-to-right. Bold labels can overlap regular-weight values on
        # the same line ("Consignee" + "CERIEX"), and sorting by x interleaves
        # them into "ConsCigEnReIEeX".
        # Also drop symbol-font glyphs (ZapfDingbats bullets are stored as the
        # letter "n" and would corrupt a label as "Weightnn(KGS)").
        def is_text(obj):
            return obj.get("object_type") != "char" or not any(
                s in obj.get("fontname", "") for s in ("Dingbats", "Symbol"))

        text = "\n".join(p.filter(is_text).extract_text(use_text_flow=True) or "" for p in pdf.pages)
    if not text.strip():
        raise UnreadableFile("scanned picture without a text layer (needs OCR)")
    return text


_TEXT_READERS = {
    ".txt": _read_txt_text,
    ".xlsx": _read_xlsx_text,
    ".docx": _read_docx_text,
    ".pdf": _read_pdf_text,
}


def extract_text(path) -> str:
    """Readability check + text extraction in one step.
    Returns the document as plain text, or raises UnreadableFile with the reason."""
    path = Path(path)
    if not path.is_file():
        raise UnreadableFile("file not found")
    if path.stat().st_size == 0:
        raise UnreadableFile("empty file")

    reader = _TEXT_READERS.get(path.suffix.lower())
    if reader is None:
        raise UnreadableFile(f"unsupported file type '{path.suffix}'")

    try:
        text = reader(path)
    except UnreadableFile:
        raise
    except Exception as e:
        # Catches: corrupted/truncated files, password-protected PDFs,
        # permission errors, etc. Broad except is deliberate -- ANY failure
        # to open the file should be flagged, not crash the whole batch.
        raise UnreadableFile(f"cannot be opened ({type(e).__name__}: {e})") from e

    if not text.strip():
        raise UnreadableFile("no readable text content")
    return text


# ---------- text -> raw (label, value) pairs ----------

def _delimited_pairs(text: str):
    """'Label: Value' lines. Indented lines that follow belong to the previous
    value (wrapped addresses), so they are appended rather than dropped."""
    pairs = []
    for line in text.splitlines():
        if not line.strip():
            continue
        if line[0].isspace():
            if pairs:
                pairs[-1][1] = f"{pairs[-1][1]} | {line.strip()}".strip(" |")
        elif ":" in line:
            label, _, value = line.partition(":")
            pairs.append([label.strip(), value.strip().lstrip(":").strip()])
        else:
            pairs.append(["", ""])  # heading / rule line: don't glue continuations onto the pair above
    return [(label, value) for label, value in pairs if label and value]


# Known label phrases used as anchors when a PDF has no delimiter at all.
# Sourced from data/label_training_data.csv so it stays in sync with training.
@lru_cache(maxsize=1)
def _anchor_pattern():
    import pandas as pd
    df = pd.read_csv(TRAINING_DATA_PATH)
    # Longest phrases first, so "Port of Discharge (POD)" is tried before "POD"
    anchors = sorted(df["label_text"].tolist(), key=len, reverse=True)
    # Negative lookaround on both sides prevents a short anchor like "POL"
    # from matching *inside* an unrelated word, e.g. "METROPOLITAN" literally
    # contains "POL" -- without this guard part of an address would be
    # mistaken for a POL label.
    return re.compile(
        r"(?<![A-Za-z])(" + "|".join(re.escape(a) for a in anchors) + r")(?![A-Za-z])",
        re.IGNORECASE,
    )


def _glued_pairs(text: str):
    """
    PDFs in our samples glue label and value together with no separator,
    e.g. 'Load Port BUATAN, INDONESIA'. We anchor on known label phrases and
    take the text between one anchor and the next as the value.
    """
    matches = list(_anchor_pattern().finditer(text))
    pairs = []
    for i, m in enumerate(matches):
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        value = _flat(text[m.end():end].strip(" :\n"))
        if value:
            pairs.append((m.group(0), value))
    return pairs


def _text_to_pairs(text: str, path):
    if Path(path).suffix.lower() == ".pdf":
        return _glued_pairs(text)
    return _delimited_pairs(text)


def read_document_pairs(path):
    """Extract text (raises UnreadableFile if it can't) and split it into (label, value) pairs."""
    return _text_to_pairs(extract_text(path), path)


# ---------- document type check ----------

DOC_TYPE_NAME = {"SI": "Shipping Instruction", "BL": "Bill of Lading"}

# Titles of documents that get attached by mistake. Extend as you meet new ones.
_OTHER_TITLE = re.compile(
    r"commercial invoice|proforma invoice|packing list|certificate of origin|invoice", re.IGNORECASE)


def detect_doc_type(text: str):
    """Look at the title (first few non-empty lines) and return "SI", "BL", the
    name of another kind of document (e.g. "packing list"), or None if the title
    isn't recognised. Unrecognised is NOT treated as wrong: the document is still
    processed, and any fields it lacks show up as missing_value."""
    lines = [l.strip() for l in text.splitlines() if l.strip("= \t")][:3]
    for line in lines:
        other = _OTHER_TITLE.search(line)
        if other:
            return other.group(0).lower()
        if "instruction" in line.lower():
            return "SI"
        if re.search(r"bill of lading|\bb/?l\b", line, re.IGNORECASE):
            return "BL"
    return None


# ---------- step 3: classify labels into canonical fields ----------

def extract_fields(path, expected_type=None):
    """
    Full pipeline for one document. expected_type is "SI" or "BL": if the
    title says the document is something else, it is flagged as wrong_doc_type.

    Returns:
        fields: dict canonical_field -> value
        needs_review: list of (raw_label, value, confidence) that the
                      classifier wasn't confident about
        problem: None if the document is usable, otherwise (reason, message)
                 where reason is "unreadable" or "wrong_doc_type". A bad file
                 never crashes the run; it surfaces as an item for a person.
    """
    try:
        text = extract_text(path)
    except UnreadableFile as e:
        return {}, [], (UNREADABLE, str(e))

    if expected_type:
        found = detect_doc_type(text)
        if found is not None and found != expected_type:
            found_name = DOC_TYPE_NAME.get(found, found)
            return {}, [], (WRONG_DOC_TYPE,
                            f"expected a {DOC_TYPE_NAME[expected_type]} but this looks like a {found_name}")

    pairs = _text_to_pairs(text, path)

    candidates = {}
    needs_review = []

    for raw_label, value in pairs:
        field, confidence = classify_label(raw_label)
        if field is None:
            needs_review.append((raw_label, value, confidence))
            continue
        candidates.setdefault(field, []).append(value)

    fields = {}
    for field, values in candidates.items():
        picked = _pick_value(field, values)
        if picked is not None:
            fields[field] = picked

    return fields, needs_review, None


# Values that must look like a bare number (+ unit). A table column header
# ("GROSS WEIGHT (KG)") also matches the weight label, and the text captured
# under it is a whole table -- reject that instead of comparing it, so the
# field shows up as "unsure" for a human rather than as a bogus mismatch.
_VALUE_SHAPE = {
    "gross_weight": re.compile(r"^\d[\d,]*(\.\d+)?\s*[A-Za-z]{0,5}\.?$"),
}


def _pick_value(field: str, values):
    """A label can appear more than once (header + total line, repeated
    labels). Take the first value that looks like the field; None if none do."""
    shape = _VALUE_SHAPE.get(field)
    if shape:
        values = [v for v in values if shape.match(v.strip())]
    return values[0] if values else None
