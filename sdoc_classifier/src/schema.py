"""Data contracts passed between stages.

raw JSON -> EmailRecord -> CleanedEmail -> Features -> Prediction -> submission JSON
"""
from dataclasses import dataclass, field


@dataclass
class EmailRecord:
    email_id: str
    sender: str
    subject: str            # raw
    body: str               # raw
    attachments: list[str] = field(default_factory=list)


@dataclass
class CleanedEmail:
    record: EmailRecord
    subject_clean: str      # RE_/FW_ prefixes and [EXTERNAL] tags removed
    body_clean: str         # banner, signature, quoted thread removed
    body_quoted: str        # the removed thread, kept for inspection
    is_external: bool       # a gateway security banner or tag was present
    is_reply: bool          # subject carried RE_/FW_/FWD:/AW: prefixes


@dataclass
class Features:
    email: CleanedEmail
    flags: dict[str, int | float]

    @property
    def email_id(self) -> str:
        return self.email.record.email_id


@dataclass
class Prediction:
    email_id: str
    category: str
    confidence: float
    source: str             # "rule" | "model" | "llm" | "error"
    model_category: str | None = None   # what the model said before any override
