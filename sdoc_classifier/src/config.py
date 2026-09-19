"""Paths, label constants and thresholds shared by every stage."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Point SDOC_DATA_DIR at a fresh generator draw to evaluate on unseen data.
DATA_DIR = Path(os.environ.get("SDOC_DATA_DIR", ROOT / "data"))
INBOX_DIR = DATA_DIR / "inbox"
GROUND_TRUTH_PATH = DATA_DIR / "ground_truth.json"

# Hand-written labelled emails in styles the generator never produces.
# train_* is added to training; test_* is held out and only ever scored.
EXTRA_DIR = ROOT / "extra_data"
HANDWRITTEN_TRAIN_PATH = EXTRA_DIR / "train_handwritten.json"
HANDWRITTEN_TEST_PATH = EXTRA_DIR / "test_handwritten.json"
HANDWRITTEN_ID_PREFIX = "hw_"
# Sample weight for hand-written emails, so ~80 varied examples are not
# outvoted by 500 templated ones. Chosen by out-of-fold accuracy on the
# hand-written *training* emails (1 -> 57/80, 3 -> 67/80, 5 and 8 -> 68/80).
HANDWRITTEN_WEIGHT = 5.0

MODELS_DIR = ROOT / "models"
MODEL_PATH = MODELS_DIR / "classifier.joblib"

OUT_DIR = ROOT / "out"
SUBMISSION_PATH = OUT_DIR / "submission.json"
PREDICTIONS_PATH = OUT_DIR / "predictions.json"
ERRORS_PATH = OUT_DIR / "errors.json"
CV_REPORT_PATH = OUT_DIR / "cv_report.json"

CATEGORIES = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]
MAJORITY_CLASS = "BL_COMPARISON"

# email_001..email_500 are the main set; 501..520 are attachment edge cases
# (all BL_COMPARISON) that we predict on but never train on.
TRAIN_MAX_INDEX = 500

CV_FOLDS = 5
RANDOM_STATE = 42

# Predictions below this confidence are candidates for the optional LLM fallback.
LOW_CONFIDENCE_THRESHOLD = 0.55

# Submission defaults for fields owned by the later comparison stage.
DEFAULT_STATUS = ""
DEFAULT_REVIEW_REASON = None
