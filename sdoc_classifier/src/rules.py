"""Deterministic overrides applied after the model predicts.

Exactly one: an SI + BL attachment pair means BL_COMPARISON. The dataset
README states only BL_COMPARISON emails carry attachments, so this is a
documented invariant rather than a heuristic. Everything else belongs in
patterns.py as a feature, where the model can weigh it against other evidence.
"""
from dataclasses import replace

from .schema import Features, Prediction

DOC_PAIR_CATEGORY = "BL_COMPARISON"


def apply_rules(features: Features, pred: Prediction) -> Prediction:
    if features.flags.get("has_doc_pair"):
        return replace(pred, category=DOC_PAIR_CATEGORY, confidence=1.0, source="rule",
                       model_category=pred.model_category or pred.category)
    return pred


def rule_disagreements(preds: list[Prediction]) -> list[Prediction]:
    """Predictions where the rule overrode a different model answer.

    Health metric: near zero means the model learned the invariant itself; a
    large count means something is wrong in the features.
    """
    return [p for p in preds if p.source == "rule" and p.model_category != p.category]
