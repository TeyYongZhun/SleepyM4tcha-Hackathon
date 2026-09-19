"""Remove boilerplate so classification keys off the message, not the wrapper.

Body steps, in order: gateway banner -> quoted reply thread -> signature
block -> greeting and trailing courtesy. Pure string manipulation.
"""
import re

from .schema import CleanedEmail, EmailRecord

# --- 1. gateway security banner -------------------------------------------

BANNER_MAX_LEN = 400
_BANNER_VOCAB = re.compile(
    r"originated\s+outside|exercise\s+caution|do\s+not\s+click|external\s+sender", re.I)
_EXTERNAL_TAG = re.compile(r"^\s*(?:\[EXTERNAL\]|\*+\s*EXTERNAL\s*\*+)\s*", re.I)
_BLOCK_SPLIT = re.compile(r"\n[ \t]*\n")


def strip_banner(body: str) -> tuple[str, bool]:
    """Drop a leading [EXTERNAL] tag and/or security-banner block.

    The banner block is only dropped when real content follows it, so a
    one-block email that happens to say "do not click" is never emptied.
    """
    text = body
    is_external = False

    m = _EXTERNAL_TAG.match(text)
    if m:
        text = text[m.end():]
        is_external = True

    blocks = _BLOCK_SPLIT.split(text.lstrip(), maxsplit=1)
    if (len(blocks) == 2
            and len(blocks[0]) < BANNER_MAX_LEN
            and _BANNER_VOCAB.search(blocks[0])
            and blocks[1].strip()):
        return blocks[1].lstrip("\n"), True
    return text, is_external


# --- 2. quoted reply thread ------------------------------------------------

_THREAD_MARKERS = [
    re.compile(r"^[ \t]*(?:_{5,}|-{5,})[ \t]*$", re.M),
    re.compile(r"^[ \t]*-+\s*Original\s+Message\s*-+", re.M | re.I),
    re.compile(r"^[ \t]*From:[^\n]*\n(?:[^\n]*\n){0,2}?[ \t]*Sent:", re.M | re.I),
    re.compile(r"^[ \t]*On\b[^\n]{1,200}\bwrote:[ \t]*$", re.M | re.I),
]


def split_quoted_thread(body: str) -> tuple[str, str]:
    """Split at the earliest thread marker -> (new message, quoted history)."""
    starts = [m.start() for rx in _THREAD_MARKERS if (m := rx.search(body))]
    if not starts:
        return body, ""
    cut = min(starts)
    return body[:cut].rstrip(), body[cut:]


# --- 3. signature block ----------------------------------------------------

# Markers that only ever appear in signatures.
_STRONG_FOOTER = re.compile(
    r"^\s*(?:DID\s*:|Website\s*:|Shipping\s+Documentation\s*$)", re.I)
# Markers that also appear in addresses inside SI bodies (P.O. BOX, TEL:), so
# they only count when a sign-off line sits just above them.
_WEAK_FOOTER = re.compile(
    r"^\s*(?:(?:Tel|Phone|Mob(?:ile)?|Fax)\s*:|P\.?\s*O\.?\s*Box\b)", re.I)
_SIGN_OFF = re.compile(
    r"^\s*(?:(?:best|kind|warm|warmest)\s+)?(?:regards|wishes)\s*[,.!]?\s*$"
    r"|^\s*(?:thanks|thank\s+you|many\s+thanks|cheers|best)\s*[,.!]?\s*$", re.I)
SIGN_OFF_LOOKBACK = 4


def strip_signature(body: str) -> str:
    lines = body.split("\n")
    first_strong = None
    for i, line in enumerate(lines):
        strong = bool(_STRONG_FOOTER.match(line))
        if not (strong or _WEAK_FOOTER.match(line)):
            continue
        if strong and first_strong is None:
            first_strong = i
        for j in range(i - 1, max(-1, i - 1 - SIGN_OFF_LOOKBACK), -1):
            if _SIGN_OFF.match(lines[j]):
                return "\n".join(lines[:j]).rstrip()
    if first_strong is not None:
        return "\n".join(lines[:first_strong]).rstrip()
    return body


# --- 4. greeting and trailing courtesy -------------------------------------

_GREETING = re.compile(r"^\s*(?:hi|hello|hey|dear)\b[^\n]{0,40}\n", re.I)
_TRAILING_COURTESY = re.compile(
    r"\n\s*(?:thank\s+you|thanks|many\s+thanks|thx)\s*[.!,]?\s*$", re.I)


def strip_greeting_and_courtesy(body: str) -> str:
    text = body.strip()
    m = _GREETING.match(text)
    if m and text[m.end():].strip():
        text = text[m.end():].strip()
    m = _TRAILING_COURTESY.search(text)
    if m and text[:m.start()].strip():
        text = text[:m.start()].strip()
    return text


# --- body + subject ---------------------------------------------------------

def clean_body(body: str) -> tuple[str, str, bool]:
    """-> (body_clean, body_quoted, is_external)."""
    text, is_external = strip_banner(body)
    text, quoted = split_quoted_thread(text)
    text = strip_signature(text)
    text = strip_greeting_and_courtesy(text)
    return text, quoted, is_external


_SUBJECT_PREFIX = re.compile(r"^\s*(?:RE|FWD?|AW)\s*[_:]\s*", re.I)


def has_external_tag(subject: str) -> bool:
    return bool(_EXTERNAL_TAG.match(subject))


def clean_subject(subject: str) -> tuple[str, bool]:
    """Strip repeated reply/forward prefixes and external tags -> (clean, is_reply)."""
    text = subject
    is_reply = False
    while True:
        m = _EXTERNAL_TAG.match(text) or _SUBJECT_PREFIX.match(text)
        if not m:
            break
        if _SUBJECT_PREFIX.match(text):
            is_reply = True
        text = text[m.end():]
    return text.strip(), is_reply


def clean_email(record: EmailRecord) -> CleanedEmail:
    subject_clean, is_reply = clean_subject(record.subject)
    body_clean, body_quoted, body_external = clean_body(record.body)
    return CleanedEmail(
        record=record,
        subject_clean=subject_clean,
        body_clean=body_clean,
        body_quoted=body_quoted,
        is_external=body_external or has_external_tag(record.subject),
        is_reply=is_reply,
    )
