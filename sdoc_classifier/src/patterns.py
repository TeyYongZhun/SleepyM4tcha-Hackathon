"""Regex signal tables, one block per category, compiled once at import.

These are *features*, not rules: features.py counts the hits and the model
decides how much each is worth.

Subject patterns are matched against the cleaned subject with underscores
turned into spaces, because the templates use "_" as a field delimiter and
"\\b" does not fire between "_" and a letter ("_Reminder_Paper").

Do not add patterns keyed to specific carriers, ports, customers or
reference-number formats: those change on a fresh generator draw.
"""
import re

# Inflection-tolerant stems.
CHECK = r"check(?:s|ing|ed)?"
CONFIRM = r"confirm(?:s|ed|ing|ation)?"
BL = r"(?:B/?L|bill\s+of\s+lading)"

SUBJECT_PATTERNS: dict[str, list[str]] = {
    "BL_COMPARISON": [
        r"\bTO\s+CONFIRM\s+DOCS\b",
        r"\bREQUEST\s+BL\s+DRAFT\b",
        rf"\bDRAFT\s+{BL}\b",
        rf"\bamend\s+{BL}\b",
    ],
    "SI_REQUEST": [
        r"^SI\s*-",
        r"\bCUST\s+SI\b",
        r"\bREQUEST\s+SI\b",
        r"\bSI\s+NEEDED\b",
        r"\bLATEST\s+SI\b",
        r"\bDIRECT\s*\(",
    ],
    "INVOICE_QUERY": [
        r"\bBILLING\b", r"\bMISSING\s+GR\b", r"\bCANCEL\s+INVOICE\b",
        r"\bLOCAL\s+CHARGES\b", r"\bD\s*&\s*D\b", r"\bTOTAL\s+FREIGHT\b",
        r"\bTELEX\s+RELEASE\b",
    ],
    "GENERAL": [
        r"\bUPDATE\s+SUMMARY\b", r"\bBERTHING\s+REPORT\b",
        r"\bRPA\b", r"\bSLA\b", r"\bholiday\b", r"\breminder\b",
        rf"\bOUTSTANDING\s+{BL}\b", rf"\bPENDING\s+{BL}\s+RELEASE\b",
        r"\bTIME\s+OFF\b", r"\bAPPROVAL\s+REQUIRED\b", r"\bNEW\s+YEAR\b",
    ],
    "SPAM": [
        r"\b(?:you\s+have\s+)?won\b", r"\bprize\b", r"\bclaim\b",
        r"\bgift\s+card\b", r"\bparcel\b", r"\bon\s+hold\b",
        r"\bmailbox\b", r"\bstorage\s+(?:is\s+)?full\b",
        r"\bverify\s+(?:your\s+)?account\b", r"\bundelivered\b",
        r"\bunclaimed\b", r"\bcongratulations\b", r"\bURGENT\b",
        r"\d+\s*%\s*OFF\b", r"\bexclusive\s+offer\b", r"\bbank\s+details\b",
        r"\bsuspension\b", r"\bguaranteed\b", r"\bbitcoin\b",
        r"\bweird\s+trick\b", r"\bsingles\b", r"\bvalued\s+customer\b",
    ],
}

BODY_PATTERNS: dict[str, list[str]] = {
    "BL_COMPARISON": [
        r"attached\s+(?:are|is)\s+the\s+SI\b",
        r"please\s+find\s+attached\s+the\s+shipping\s+instruction",
        rf"verify\s+the\s+{BL}\s+matches",
        rf"{CHECK}\s+the\s+details\s+and\s+{CONFIRM}",
        rf"(?:send|share)\s+the\s+draft\s+{BL}",
        rf"{CHECK}\s+the\s+draft\s+{BL}",
        rf"draft\s+{BL}\s+against\s+the\s+SI\b",
        # any "SI and/against/vs (draft) BL" pairing: the comparison itself
        rf"\b(?:SI|shipping\s+instruction)\s+(?:and|against|with|vs\.?)\s+(?:the\s+)?(?:draft\s+)?{BL}\b",
        rf"\b(?:compare|comparing|cross-?check)\b",
        r"revert\s+with\s+any\s+discrepanc",
        rf"for\s+(?:your\s+)?{CONFIRM}\b",
        rf"for\s+{CHECK}\b",
    ],
    "SI_REQUEST": [
        r"(?:raise|issue|prepare|create)\s+the\s+SI\b",
        r"\bSI\s+for\s+booking",
        r"kindly\s+(?:raise|issue)\b",
        r"please\s+find\s+shipping\s+instruction",
        r"^\s*POL\s*:",
        r"^\s*POD\s*:",
        r"^\s*Notify\s+Party\s*:",
        r"\bDescription\s+of\s+Goods\b",
        r"\bDocuments\s+Required\b",
        r"\bH\.?S\.?\s*CODE\b",
    ],
    "INVOICE_QUERY": [
        r"\binvoice\b", r"\bTHC\b", r"\bcharges?\b", r"\bbreakdown\b",
        r"\bcredit\s+note\b", r"\bbilled\b", r"\bbilling\b", r"\bfreight\s+cost\b",
        r"\bGR\b", r"\bPGI\b", r"\bdetention\b", r"\bpayment\b",
    ],
    "GENERAL": [
        r"\bberthing\b", r"\bvessel\s+schedule\b", r"\bauto-?generated\b",
        r"\bautomated\s+notification\b", r"\bdo\s+not\s+reply\b",
        r"\bno\s+action\s+required\b", r"\bupdate\s+summary\b",
        r"\boutstanding\s+(?:list|BL)\b", r"\bpending\s+shipments\b",
        r"\bnew\s+year\b", r"\boffice\s+resumes\b", r"\bRPA\s+Bot\b",
    ],
    "SPAM": [
        r"\bclick\s+here\b", r"\bclaim\s+your\b", r"\bact\s+now\b",
        r"\blimited\s+time\b", r"\bwire\s+transfer\b", r"\bgift\s+card\b",
        r"\bverify\s+your\s+account\b", r"\bbank\s+details\b",
        r"\bcongratulations\b", r"\byou\s+have\s+won\b", r"\bbuy\s+now\b",
        r"\bwithin\s+24\s+hours\b", r"https?://\S+",
    ],
}

SUBJECT_REGEX = {c: [re.compile(p, re.I) for p in ps] for c, ps in SUBJECT_PATTERNS.items()}
BODY_REGEX = {c: [re.compile(p, re.I | re.M) for p in ps] for c, ps in BODY_PATTERNS.items()}

ATTACHMENT_CLAIM = re.compile(
    r"\battached\b|\battaching\b|\battachments?\b|\benclosed\b|please\s+find\s+attached", re.I)
REPLY_PREFIX = re.compile(r"^\s*(?:RE|FWD?|AW)\s*[_:]", re.I)

# --- coded-subject discriminator -------------------------------------------
#
# Two coded formats share one shape, " - "-delimited fields:
#   SI - <bl> - DIRECT(<carrier>) - <OC> - <POD> - <BLtype> - <dept> - <date>  -> SI_REQUEST
#   <DEPT> - <POD> - <CARRIER>(<bl>) - <OC> - <INV> - <customer> - <term>     -> BL_COMPARISON
# The BL format's first field is a department code (AIE, AFPTME, AFRT, AFEMY in
# this draw), so match the *shape* of field one, not a specific code.

_CODED_SPLIT = re.compile(r"\s+-\s+")
_DEPT_CODE = re.compile(r"^[A-Z]{2,8}$")
CODED_MIN_FIELDS = 5


def coded_subject_kind(subject_clean: str) -> str | None:
    """'si' | 'dept' | None."""
    fields = [f.strip() for f in _CODED_SPLIT.split(subject_clean.strip())]
    if len(fields) < CODED_MIN_FIELDS or not _DEPT_CODE.match(fields[0]):
        return None
    return "si" if fields[0] == "SI" else "dept"


_SUBJECT_FIELD_SPLIT = re.compile(r"\s+-\s+|\s*_+\s*")


def subject_field_count(subject_clean: str) -> int:
    return len([f for f in _SUBJECT_FIELD_SPLIT.split(subject_clean) if f.strip()])


def count_hits(regexes: list[re.Pattern], text: str) -> int:
    return sum(1 for rx in regexes if rx.search(text))
