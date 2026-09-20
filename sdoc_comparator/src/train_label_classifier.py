import pandas as pd
from pathlib import Path
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

from label_vocab import normalize_label

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "label_training_data.csv"
MODEL_PATH = ROOT / "models" / "label_classifier.joblib"


def train():
    df = pd.read_csv(DATA_PATH)
    print(f"Loaded {len(df)} labeled examples across {df.canonical_field.nunique()} fields.")

    X = df["label_text"]
    y = df["canonical_field"]

    # Small dataset -> a plain train/test split is fine for a sanity check.
    # this split becomes a meaningful accuracy signal rather than just a smoke test.
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if y.value_counts().min() > 1 else None
    )

    pipeline = Pipeline([
        # preprocessor=normalize_label (NFKC + lowercase) is applied identically at
        # prediction time because it lives inside the saved pipeline.
        ("tfidf", TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 4), preprocessor=normalize_label)),
        # C=10 (weaker regularisation than the default 1.0) gave the best
        # cross-validated accuracy and sharper, more usable confidence scores.
        ("clf", LogisticRegression(C=10, max_iter=1000)),
    ])

    pipeline.fit(X_train, y_train)

    preds = pipeline.predict(X_test)
    print("\n--- Held-out evaluation ---")
    print(classification_report(y_test, preds, zero_division=0))

    pipeline.fit(X, y)

    MODEL_PATH.parent.mkdir(exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    print(f"\nSaved trained model to {MODEL_PATH}")


if __name__ == "__main__":
    train()
