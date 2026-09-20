"""sklearn Pipeline assembly over lists of Features objects."""
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction import DictVectorizer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.preprocessing import MaxAbsScaler
from sklearn.svm import LinearSVC

from .config import RANDOM_STATE


class ColumnPicker(BaseEstimator, TransformerMixin):
    """Pick one text attribute of CleanedEmail from each Features object."""

    def __init__(self, attr: str):
        self.attr = attr

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        return [getattr(f.email, self.attr) for f in X]


class FlagPicker(BaseEstimator, TransformerMixin):
    """Pick the engineered flag dict from each Features object."""

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        return [f.flags for f in X]


def build_features() -> FeatureUnion:
    return FeatureUnion([
        ("subject_tfidf", Pipeline([
            ("pick", ColumnPicker("subject_clean")),
            ("tfidf", TfidfVectorizer(ngram_range=(1, 3), sublinear_tf=True,
                                      min_df=2, lowercase=True)),
        ])),
        ("body_tfidf", Pipeline([
            ("pick", ColumnPicker("body_clean")),
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True,
                                      min_df=2, lowercase=True)),
        ])),
        ("flags", Pipeline([
            ("pick", FlagPicker()),
            ("vec", DictVectorizer(sparse=True)),
            # keep flag counts on the same [0, 1] scale as the tf-idf columns
            ("scale", MaxAbsScaler()),
        ])),
    ])


def build_pipeline(model: str = "logreg") -> Pipeline:
    if model == "logreg":
        clf = LogisticRegression(class_weight="balanced", max_iter=2000, C=1.0,
                                 random_state=RANDOM_STATE)
    elif model == "svc":
        # LinearSVC has no predict_proba; calibration provides it.
        clf = CalibratedClassifierCV(
            LinearSVC(class_weight="balanced", C=1.0, random_state=RANDOM_STATE),
            cv=3, method="sigmoid")
    else:
        raise ValueError(f"unknown model {model!r}")
    return Pipeline([("features", build_features()), ("clf", clf)])
