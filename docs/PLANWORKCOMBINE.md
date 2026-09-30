# PLANWORKCOMBINE — merging three branches into one working product

## Context

Three people built three separate things, on three branches, against the same dataset:

| Branch | Owner | What it is | Language |
|---|---|---|---|
| `Benjamin` | Benjamin | WayBoxAI frontend — Next.js 16 dashboard, Google auth, Gmail reader | TypeScript |
| `YongZhun` | Yong Zhun | Email **category classifier** (`sdoc_classifier/`) | Python |
| `Sam` | Sam | **SI-vs-BL document comparison** pipeline | Python |

They need to become one product. Decisions already made:
**everything lands on a new `merge` branch** · **FastAPI service behind the existing
`BACKEND_API_URL`** · **hackathon demo very soon** · **Sam's code moves to `sdoc_comparator/`** ·
**the frontend adopts the real 5 categories** · **comparison status shown as its own badge** ·
**demo data relabelled to match**.

`merge` is branched from `Benjamin` (the frontend is the biggest, most structured tree, so it
is cheapest to keep it in place and bring the two Python projects to it). The three original
branches stay untouched as a safety net — nothing is force-pushed or rewritten, so if the
merge goes wrong you simply delete `merge` and start again.

### The good news: everything already shares one contract

`data/ground_truth.json` is **byte-identical (79,980 bytes)** on Sam's branch and Benjamin's.
Both Python pipelines were written to fill the *same* record — just different halves of it:

```json
{ "email_004": { "category", "status", "review_reason", "defect_fields", "has_defect" } }
```

- `sdoc_classifier/src/predict.py` → `submission_entry()` fills **`category`**, leaves the rest as defaults.
- Sam's `src/main.py` → `result_to_json()` fills **`status` / `review_reason` / `defect_fields` / `has_defect`**, hardcodes `category="BL_COMPARISON"`.

So the combined pipeline is literally **classify → if `BL_COMPARISON`, compare → merge one record**,
and the frontend should display that record as-is. That is the spine of this plan.

**Because the frontend adopts the same vocabulary, there is no translation layer anywhere.**
`ground_truth.json` → Python → JSON → React all speak the same words. Any mapping table we
invented would have been a bug factory; there is none.

### Three real problems to fix

**1. The frontend still carries placeholder categories.** `src/lib/types.ts` defines
`EmailCategory = "relevant" | "spam" | "human_intervention" | "unrelated"` — demo stand-ins
from before the models existed. These must be replaced with the real five. It is a contained
change: **10 files**, and the taxonomy is properly centralised in `src/lib/categories.ts`, so
components like `category-badge.tsx` follow automatically.

**2. Benjamin's `sdoc_classifier/` is a broken half-copy.** Commit `4738542` committed 542
files into it — the 520-email dataset, `models/classifier.joblib`, `out/`, and
**`__pycache__/*.pyc`** — but **none of the `.py` source**. The real source (18 files) exists
only on `YongZhun`. The merge must bring the `.py` files in and delete the `.pyc` junk.

**3. Sam's code sits at the repo root** (`src/`, `data/`, `output/`) and would tangle with the
Next.js `src/`. It also uses flat imports (`from extractor import extract_fields`), so it only
runs from inside its own directory.

### Intended outcome

One `merge` branch where `npm run dev` serves the dashboard, one FastAPI service serves real
ML predictions, and SI-vs-BL mismatches are visible in the UI. Once it is proven, `merge`
becomes the branch the team works from (and what you'd open a PR into `main` from).

---

## Answer: is there a connection between backend and frontend?

**Yes — the frontend was built for exactly this and is waiting.** Not wired up, but every seam exists:

- **`src/lib/api/routes.ts`** — `BACKEND_API_URL` env var, two routes already defined:
  `GET /emails` → `Email[]`, `GET /emails/{emailId}` → `Email`.
- **`src/lib/api/client.ts`** — `request()` sends `Authorization: Bearer <Google access token>`,
  `Accept: application/json`, `cache: "no-store"`, **15-second timeout**. `server-only`.
- **`src/lib/api/adapters.ts`** — `adaptEmail()` already tolerates backend field-name variants
  (`email_id`|`id`, `from` as string or object, `received_at`|`date`, …).
- **`src/lib/emails.ts`** — source precedence, strictly:
  `session.demo` → demo data · else `backendEnabled` → **backend** · else Gmail token → Gmail · else `MOCK_EMAILS`.

⚠️ **Setting `BACKEND_API_URL` switches the Gmail path OFF entirely.** The backend then owns
Gmail fetching — which is why the frontend forwards the user's Google Bearer token.

Also: the **demo account never reaches the backend** (`session.demo` short-circuits first), so
"Try the demo" keeps working throughout — a safe fallback if the backend dies during judging.

---

## Live demo: can a user connect their email and have the ML classify it?

**Yes for sign-in, and that is all the demo needs — deliberately.**

The chosen approach is **live Google sign-in + seeded inbox**. The happy accident is that
this needs **no Gmail permission at all**, because of the precedence in `src/lib/emails.ts`:

```
usesGmail = !session.demo && !backendEnabled && !!session.accessToken
```

With `BACKEND_API_URL` set, `backendEnabled` is true → `usesGmail` is **false** → the app
serves whatever the backend returns. So the judge performs a **real Google OAuth sign-in**
(it is a real app, really authenticated), and the dashboard then shows the 520-email dataset
where the classifier scores **520/520** and `email_004` has a genuine SI-vs-BL mismatch.

**This takes the two hardest blockers off the critical path:**

| Blocker | Status under this plan |
|---|---|
| `gmail.readonly` 403 (scope not granted) | **Not needed.** Sign-in only requests `openid email profile`. |
| Google app verification / test-user list | **Not needed.** No restricted scope is exercised. |

Worth knowing anyway, for later: `gmail.readonly` is a **restricted** scope. An unverified app
in "Testing" mode only lets *explicitly added* test users grant it (max 100); full verification
is a security review taking weeks. **A judge could not sign in with their own account and read
their own mail**, so a "connect your real inbox" demo was never realistic on this timeline.

**And it would not have looked good.** `extra_data/` is gone, so the model is trained on the
520 templated emails only. `sdoc_classifier/WORKFLOW.md` records the failure mode: a real
customer email reading *"Kindly raise the SI for booking 88123"* was classified **SPAM**,
because in the generated data every SI request came from an internal sender — so "external
sender" became a spam clue. Measured then: **16/30** on hand-written emails, **0/6** on SI
requests. A judge's personal inbox contains no `BL_COMPARISON` or `SI_REQUEST` mail at all —
just newsletters and receipts, which would pile into GENERAL/SPAM. Sam's comparator would also
sit idle, since `find_pairs()` needs `email_004_SI.txt`-style attachment pairs.

So: **sign-in is live and real; the inbox is seeded with the data the models were built for.**
Say this plainly to judges — "authentication is live, the inbox is our evaluation dataset" —
it is a normal, defensible demo choice, and far better than a dashboard of misfiled newsletters.

If real Gmail is wanted **after** the hackathon, see Phase 6 — there is a much cheaper route
than the one this plan uses for the demo.

---

## Target architecture

```
Next.js (Benjamin)                    FastAPI gateway              ML packages
──────────────────                    ───────────────              ───────────
src/lib/api/client.ts  ──HTTP──▶  GET /emails            ──▶  sdoc_classifier
  BACKEND_API_URL                   (category + summary)         classify()
  Bearer <google token>                                          ↓ BL_COMPARISON?
                                  GET /emails/{id}       ──▶  sdoc_comparator
                                    (+ comparison)              analyze_pair()
```

**One** FastAPI app (`backend/app.py`) imports **both** Python packages as libraries.
`BACKEND_API_URL` is a single origin, so one gateway — not two services.

**Split work across the two endpoints** (critical, see Gotcha 1):
- `GET /emails` — cheap. Classification + summary only. **No PDF parsing.**
- `GET /emails/{id}` — expensive. Adds `shipment_documents` + the SI-vs-BL comparison.

This mirrors how the demo already splits it: `loadDemoEmails` skips `analyzeAttachments`,
`loadDemoEmail` adds it (`src/lib/demo/load.ts`).

### Final repo layout (on the `merge` branch)

```
SleepyM4tcha-Hackathon/
├── src/                  Next.js frontend            (Benjamin)
├── sdoc_classifier/      category model              (from YongZhun)
├── sdoc_comparator/      SI-vs-BL model              (from Sam's root src/ + data/)
├── backend/              FastAPI gateway             (NEW — the glue)
│   ├── app.py
│   ├── assemble.py
│   └── requirements.txt
└── package.json
```

---

## The shared vocabulary (agree this first, in writing)

**Category** — five values, straight from `ground_truth.json`, no translation:

| Wire value (Python sends verbatim) | `EmailCategory` (TS) | URL slug | Display label |
|---|---|---|---|
| `BL_COMPARISON` | `bl_comparison` | `bl-comparison` | BL Comparison |
| `SI_REQUEST` | `si_request` | `si-request` | SI Request |
| `INVOICE_QUERY` | `invoice_query` | `invoice-query` | Invoice Query |
| `GENERAL` | `general` | `general` | General |
| `SPAM` | `spam` | `spam` | Spam |

The existing `adaptCategory()` lowercases and converts spaces/hyphens to underscores, so
Python can emit `BL_COMPARISON` **unchanged** and it normalises to `bl_comparison` for free.
Only the `CATEGORY_ALIASES` map needs its five new keys.

**Status** — a *separate* field, only meaningful for `BL_COMPARISON`:

| Wire (`status`) | Meaning | Badge |
|---|---|---|
| `OK` | SI and BL agree | green |
| `MISMATCH` | fields differ — `defect_fields` lists them | red |
| `NEEDS_REVIEW` | couldn't be checked — see `review_reason` | amber |

`review_reason` ∈ `missing_attachment · unreadable · wrong_doc_type · missing_value`
(from `sdoc_comparator/label_vocab.py`).

Keeping status out of the category axis is what makes this match `ground_truth.json` exactly,
and means an email is never *both* miscategorised and hiding a defect.

---

## Implementation plan

Ordered so a working demo exists as early as possible.

### Phase 0 — Protect the repo (do first, ~10 min)

1. `.git/info/exclude` is already hardened locally (done earlier this session).
2. Push the hardened `.gitignore` commit (`5eb4e61`) so teammates get it.
3. **Warn Sam and Benjamin** to add the same local excludes — anyone checking out a branch
   with a built frontend present is one `git add .` away from committing `.env.local`
   (which holds `AUTH_SECRET` and `AUTH_GOOGLE_SECRET`).

### Phase 1 — Create `merge` and bring all three branches together (no behaviour change yet)

```bash
git fetch origin
git switch -c merge origin/Benjamin      # everything lands here
git push -u origin merge                 # so the team can see it early
```

Commit after **each** numbered step below, not all at the end — if step 3 goes wrong you want
to land on a good commit, not unpick a 600-file mess.

1. **Clean Benjamin's broken half-copy first.**
   `git rm -r --cached sdoc_classifier/src/__pycache__ sdoc_classifier/tests/__pycache__ sdoc_classifier/out`
   Keep `sdoc_classifier/data/` and `models/classifier.joblib` — both are needed and neither
   is on `YongZhun` (its `.gitignore` excludes them).
2. **Merge YongZhun**: `git merge origin/YongZhun`. Brings the 18 `.py` files. Expect conflicts
   only in `.gitignore` and `README.md` — take the union.
3. **Bring Sam in under `sdoc_comparator/`.** Sam shares no real file paths with Benjamin (only
   `.gitignore` and `README.md`), but a plain merge would drop Sam's `src/*.py` **into the
   Next.js `src/`** — do not do that. Instead re-root his tree:
   `git read-tree --prefix=sdoc_comparator/ -u origin/Sam` (or copy the files and commit,
   crediting Sam). Gitignore `sdoc_comparator/output/`.
4. **Fix Sam's imports.** `main.py` uses `from extractor import …`, `from compare import …`,
   `from label_vocab import …`. Add `sdoc_comparator/__init__.py` and convert to relative
   imports (`from .extractor import …`) — cleaner than `sys.path` hacks, since FastAPI imports it.
5. **Merge requirements.** Union, no version conflicts found:
   `scikit-learn, joblib, numpy, scipy, pandas, openpyxl, pdfplumber, pytest` (+ `fastapi, uvicorn`).

**Checkpoint:** `npm run dev` still serves the site; `cd sdoc_classifier && python -m pytest`
(25 tests) passes; Sam's demo still writes `demo_results.json`. Nothing is wired together yet.

### Phase 2 — Frontend taxonomy swap (can start immediately, in parallel)

Replace the four placeholder categories with the real five. **10 files**, in dependency order:

1. **`src/lib/types.ts`** — `EmailCategory` union → the five snake_case values. Add to `Email`:
   ```ts
   status?: "OK" | "MISMATCH" | "NEEDS_REVIEW";
   review_reason?: string | null;
   defect_fields?: string[];
   ```
2. **`src/lib/categories.ts`** — the hub. Rewrite the `CATEGORIES` array with the five
   slug/label/`badge`/`bar` rows per the table above. Check `src/app/globals.css` for the
   available colour tokens (`good`/`bad`/`warn`/`mute` exist; a fifth is needed).
   ⚠️ `getCategoryByEmailCategory` uses `.find(...)!` — an unmapped category **crashes** the
   summary panel. Make it fall back rather than assert.
3. **`src/lib/api/adapters.ts`** — five new `CATEGORY_ALIASES` keys; adapt and **validate**
   `status` / `review_reason` / `defect_fields`.
4. **`src/lib/demo/classify.ts`** (15 hits) — rewrite the regex cascade to emit the five
   categories; `REASONS` / `HEADLINE` are `Record<EmailCategory, string>` so both need all five keys.
5. **`src/lib/mock-data.ts`** (11 hits) and the `public/dummy` inbox — relabel to the five.
6. **`src/components/summary-panel.tsx`** (7 hits) — `CATEGORY_ICON` needs five entries; add
   the status badge here.
7. `src/components/category-badge.tsx`, `src/components/inbox-pane.tsx`, `src/lib/emails.ts`,
   `src/lib/gmail/parse.ts` — follow from `categories.ts`; mostly just the default category.

**This phase has no dependency on the Python work** — Benjamin can do it now against a
hand-written fixture JSON.

**Checkpoint:** `npm run dev` with no backend shows five working tabs on demo/mock data.

### Phase 3 — The FastAPI gateway

Create `backend/`:

- **`backend/assemble.py`** — builds one frontend `Email` from a `Prediction` (+ optional
  comparison). No category translation; just shape assembly and the `EmailSummary`.
- **`backend/app.py`** — FastAPI with exactly the two routes the frontend already calls:
  - `GET /emails` → list. Per email: `classify()` from `sdoc_classifier/src/predict.py`,
    build summary. **No attachment parsing.**
  - `GET /emails/{email_id}` → single. Same, plus — when the category is `BL_COMPARISON` and
    both SI and BL attachments exist — call **`analyze_pair(si_path, bl_path)`** from
    `sdoc_comparator/main.py` and attach `status`, `review_reason`, `defect_fields`,
    `shipment_documents`, `shipment_comparison`.
  - Read the `Authorization: Bearer` header; for the demo, ignore it and serve
    `sdoc_classifier/data/inbox/*.json`. Real Gmail is Phase 5.

**Reuse, do not rewrite:**

| Use this | From |
|---|---|
| `classify(model, feats)`, `classify_inbox()` | `sdoc_classifier/src/predict.py` |
| `featurize()`, `load_email()`, `parse_record()` | `sdoc_classifier/src/features.py`, `loading.py` |
| `Prediction(email_id, category, confidence, source, model_category)` | `sdoc_classifier/src/schema.py` |
| **`analyze_pair(si_path, bl_path)`** — the one entry point needed | `sdoc_comparator/main.py` |
| `result_to_json()`, `COMPARISON_FIELDS`, `DISPLAY_NAME`, `REVIEW_REASONS` | `sdoc_comparator/main.py`, `label_vocab.py` |

`analyze_pair` returns `{status, reason, report, details, rows, mismatch_fields, unsure_fields, low_conf}`,
each row `{field, si_value, bl_value, status}` with row `status ∈ {match, mismatch, unsure}`
and pair `status ∈ {OK, MISMATCH, NEEDS_REVIEW}`.

**Checkpoint:** `curl -s localhost:8000/emails | jq '.[0]'` returns a valid `Email`.

### Phase 4 — Wire the frontend

1. Set `BACKEND_API_URL=http://localhost:8000` in `.env.local`. **No frontend code change
   needed** — `backendEnabled` flips automatically and `request()` takes over.
2. Sanity-check `adaptEmail()` against real backend output before writing anything new.

**Checkpoint:** the dashboard lists real ML-classified emails under the five correct tabs.
*This is the minimum demoable milestone — stop here if time runs out.*

### Phase 5 — Surface the field-by-field comparison

The frontend has *scaffolding* but **zero comparison semantics** — this is net-new work.

What exists (`src/lib/shipment.ts`, `src/components/shipment-checklist.tsx`): a canonical
15-key `ShipmentFieldKey` space, `ShipmentFields` per document, and a grid that **already
renders SI and BL side by side, one row per field**. Every check today is presence/completeness
(`DocCheck`, `FieldCheck`, `StructureCheck`) — never equality.

1. **New type** in `src/lib/types.ts`:
   ```ts
   export interface ShipmentFieldComparison {
     field: ShipmentFieldKey;
     si_value: string;
     bl_value: string;
     status: "match" | "mismatch" | "unsure";
   }
   ```
   plus `shipment_comparison?: ShipmentFieldComparison[]` on `Email`.
2. **Map Sam's field names to `ShipmentFieldKey`** — they differ (`container_count` vs
   `containers`). Do this in `backend/assemble.py`, **not** in the UI.
3. **Adapter** in `adapters.ts` — validate, do not pass through blind (Gotcha 3).
4. **UI** — tint the existing grid cells by row status and add a `StatusRow` ("SI matches BL").
   The grid already iterates `SHIPMENT_FIELDS × sources`, so this is the cheapest landing spot.

### Phase 6 — Real Gmail (post-hackathon; NOT on the demo path)

**Do not use the `BACKEND_API_URL` route for this.** Setting it disables the frontend's Gmail
path, which would force rewriting `src/lib/gmail/` — **452 lines of working TypeScript** across
`index.ts` (197), `api.ts` (113), `parse.ts` (142) — in Python. Wasteful and risky.

**Use the swap point the frontend author left instead.** `src/lib/gmail/enrich.ts` is labelled
`STAND-IN` in its own header comment:

> *"Gmail knows nothing about categories, summaries or SI/BL fields, so until the real
> classifier exists this reuses the demo's keyword rules. When the real backend/AI step is
> ready, replace the body of `enrich` with a call to it … nothing else needs to change."*

`enrich(email)` takes an `Email` and returns it with `category`, `shipment_info` and `summary`
filled. It is called from exactly one place — `src/lib/gmail/index.ts:48`,
`return enrich(parseMessage(msg))`.

So the work is:
1. Add `POST /classify` to the FastAPI gateway — body `{subject, body, from, attachments[]}`,
   response `{category, confidence, summary}`. It reuses `parse_record()` → `featurize()` →
   `classify()`, the same call chain as `GET /emails`.
2. Make `enrich()` `async` and call it; keep the current keyword rules as the fallback when the
   service is unreachable, so Gmail never hard-fails.
3. Leave `BACKEND_API_URL` **unset** in this mode, so the frontend keeps owning Gmail.

Prerequisites, both real:
- Fix the `gmail.readonly` grant: enable the Gmail API, add the scope to the OAuth consent
  screen, revoke the old grant at myaccount.google.com/permissions, sign in again.
- **Retrain on real email first.** Without hand-written/real training data the model will
  misfile ordinary mail (see the live-demo section above). Collect and label real messages into
  `sdoc_classifier/extra_data/train_handwritten.json` — `evaluate.py::load_training_set()`
  already picks that file up automatically and weights it ×5 (`HANDWRITTEN_WEIGHT`).

---

## Gotchas that will bite (all verified in the code)

1. **15-second timeout** (`AbortSignal.timeout`, `client.ts`). PDF extraction across a whole
   inbox on `GET /emails` *will* blow it — hence the two-endpoint split.
2. **`confidence` must be 0..1**, not 0..100. `summary-panel.tsx` renders
   `Math.round(s.confidence * 100)`, so `95` displays **"9500%"**. `Prediction.confidence` is
   already 0..1 — pass it through unscaled. (This also finally turns the confidence bar on;
   the demo never sets it.)
3. **No runtime validation** on `summary` / `shipment_info` / `shipment_documents` — cast
   straight through. Malformed ML output becomes a **React render crash**, not an API error.
4. **Unknown categories fail silently** → `"unrelated"` today, plus a `console.warn`. If the
   whole dashboard lands in one tab, the aliases are wrong. Watch the browser console.
5. **Three distinct string spaces.** URL slug `bl-comparison` (hyphen) ≠ wire value
   `bl_comparison` (underscore) ≠ label `"BL Comparison"`. `/api/inbox?category=` expects the
   **hyphen slug**.
6. **The backend path is unpaged** — `getInboxPage` fetches the whole `/emails` list and slices
   in memory. Fine for 520 emails.
7. **`email_id` is mandatory** — `adaptEmail` throws `"Backend email has no email_id"`. Keep the
   `email_NNN` format; `loading.py::email_index()` depends on it.
8. **One `BACKEND_API_URL` only.** Two services would need new env vars and `routes.ts` changes.
   Hence: one gateway.
9. **Sam's `find_pairs()` groups by filename** (`email_004_SI.txt` / `email_004_BL.pdf`). Real
   Gmail attachments aren't named that way — pair them by kind detection (the frontend already
   has `kindFromFilename` in `demo/extract.ts`).
10. **`getCategoryByEmailCategory` uses `.find(...)!`** — a non-null assertion that crashes on
    an unmapped category. Fix while editing `categories.ts`.

---

## Verification

**Per phase — each is a checkpoint, don't skip:**

1. **Phase 1:** `npm run dev` serves the site; `cd sdoc_classifier && python -m pytest`
   (25 tests) passes; Sam's demo still writes `demo_results.json`; `git status` stays fast.
2. **Phase 2:** with **no** backend, all five tabs render on demo data; "Try the demo" works;
   no console warnings about unknown categories.
3. **Phase 3:** `uvicorn backend.app:app --reload --port 8000`, then
   `curl -s localhost:8000/emails | jq '.[0]'` — check `email_id`, `category` ∈ the five,
   `summary.confidence` ≤ 1.
   `curl -s localhost:8000/emails/email_004 | jq '{status, defect_fields}'` — **`email_004` is a
   known `MISMATCH` on `consignee` + `notify_party`**, the ideal test case.
4. **Phase 4:** set `BACKEND_API_URL`, restart, open `/dashboard/bl-comparison`. Compare the
   tab counts against `sdoc_classifier/data/ground_truth.json` — they should match, since the
   classifier scores 520/520 on it.
5. **Phase 5:** open `email_004` — the grid highlights `Consignee` and `Notify Party` as
   mismatched and the status badge reads **MISMATCH**.
6. **Regression throughout:** unset `BACKEND_API_URL` → app falls back to mock data and still
   renders. "Try the demo" must work at every phase, so there is always a working demo path.

**End-to-end acceptance:** sign in → dashboard lists ML-classified emails under five tabs →
open a BL Comparison email → field-by-field SI-vs-BL with mismatches highlighted.

---

## Division of labour (parallelisable)

| Who | Task | Blocks on |
|---|---|---|
| **Yong Zhun** | Phase 0 + Phase 1 (create `merge`, bring all three together, repo hygiene) | nothing — start now |
| **Benjamin** | Phase 2 (taxonomy swap) — no Python dependency, use a fixture JSON | nothing — start now |
| **Sam** | Fix imports for `sdoc_comparator/`, confirm `analyze_pair()` is the stable entry point, map his field names to `ShipmentFieldKey` | Phase 1 |
| **Together** | Phase 3 gateway — the shared contract, agree as a group | Phases 1 + 2 |

Once `merge` is pushed, **everyone works on `merge`** (or short branches off it) — not on
`Benjamin` / `YongZhun` / `Sam`. Leaving work on the old branches after the merge is the
surest way to end up doing this twice.

**Biggest risk:** drift in the shared vocabulary. Agree the category/status tables above
*first, in writing*, before anyone writes gateway code.

---

## Note on scope

This plan does **not** fix the outstanding `gmail.readonly` scope problem, and **does not need
to**. Setting `BACKEND_API_URL` bypasses the frontend's Gmail path entirely, so the demo runs
on the bundled 520-email dataset with only `openid email profile` — scopes Google already
grants. The scope fix, Google verification and retraining on real mail are all Phase 6,
post-hackathon.

**Demo-day safety net, in order:** backend serves the 520-email dataset → if the FastAPI
service dies, unset `BACKEND_API_URL` and the app falls back to `MOCK_EMAILS` → "Try the demo"
always works regardless, since `session.demo` never touches the backend. Rehearse the fallback
before you present.
