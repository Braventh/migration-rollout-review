# Rollout Desk · final decision

**Recommendation: C — keep Rollout Desk as a small open-source utility, subject to the owner's license choice; do not pursue commercialization.** Until a license is adopted, describe it as a local review utility with public source, not as an open-source release. Confidence is moderate that more product investment is not justified today, and low about demand for the remaining niche.

1. **It does something worth keeping.** A reviewer can combine scoped, optional read-only PostgreSQL metadata with prompts about old application and worker versions, flags, owners, recovery and pause conditions. The result is one Markdown review that can travel with the PR. The app never executes the migration, connects to PostgreSQL or needs its credentials. This makes it a plausible companion to a linter, not a substitute for one.
2. **Free tools and existing process already cover much of the job.** A free linter or framework guardrail plus a completed PR checklist and staging rehearsal is the strongest baseline. Earlier [synthetic product research](RELEASE_REPORT.md#opportunity-discovery) found nine decisions beyond lint and a blank checklist, but zero beyond a completed checklist given the same facts. That measures neither realized time savings nor real-world adoption.
3. **The engine is better at surfacing risks, not at establishing safety.** The re-run found the same six template rejections and the same forward-execution false positives despite better disclosure. Rewrites, validation, and some locks are now surfaced, but SQL text alone cannot establish production work, application compatibility or recovery.
4. **Nobody has validated the workflow externally.** Mission 5 was desk research, Mission 6 did not recruit or run a trial, and local tests establish product behavior rather than user value. There is no measured review-time advantage, repeat usage or willingness to pay.

That rules out **A** (more general development) and makes **B** (a deliberate repositioning) premature. **D** would discard a working, low-overhead worksheet before testing whether it makes consequential reviews easier; keep maintenance bounded rather than funding another product cycle.

## Evidence and re-run

| Mission | Source | Result that matters |
|---|---|---|
| 1 · Corpus | [Provenance and inputs](../corpus/README.md), [PR #5](https://github.com/Braventh/migration-rollout-review/pull/5) | 60 pinned real migrations from 10 public projects, chosen for variety rather than as a production-weighted sample. |
| 2 · Accuracy | [Accuracy report](CORPUS_ACCURACY_REPORT.md), [case ledger](CORPUS_ACCURACY_CASES.md), [PR #6](https://github.com/Braventh/migration-rollout-review/pull/6) | Useful first-pass routing; runner scope, missing high-impact operations and misleading guidance were material limitations. |
| 3 · Expert audit | [PostgreSQL audit](POSTGRES_AUDIT.md), [probe results](audit/postgres/RESULTS.md), [PR #7](https://github.com/Braventh/migration-rollout-review/pull/7) | Probes on PostgreSQL 12, 13, 14, 16, 17 and 18 demonstrated rewrites, lock modes and queueing, and failures under implicit batching. These were throwaway tables, not duration or production tests. |
| 4 · Targeted fixes | [Test report](TEST_REPORT.md#mission-4--risk-engine), [known gaps](BUGS.md), [PR #9](https://github.com/Braventh/migration-rollout-review/pull/9) | Added rewrite and constraint gates, selected lock/timeout guidance and explicit uncertainty labels. Earlier isolated probes passed 11 checks each on PostgreSQL 12, 14, 16 and 17 and 12 on PostgreSQL 18; not rerun here. |
| 5 · Alternatives | [Product validation](MISSION-5-PRODUCT-VALIDATION.md) | Free tools and an ordinary PR workflow set a high bar; no evidence that the remaining gap is a market. |
| 6 · Trial | [Trial package](trial/README.md), [PR #8](https://github.com/Braventh/migration-rollout-review/pull/8) | Local demo, protocol, synthetic cases and draft outreach are ready; **zero external testers**, no outreach approved or sent. |

Re-run on [`f88bf2d`](https://github.com/Braventh/migration-rollout-review/tree/f88bf2d7c429150835f099981f784c1789ea06e1), Node.js 24.22.2 and `pgsql-parser` 18.4.4. The pre-fix engine and lockfile at `9533522` match the Mission 2 baseline. After `npm ci`:

| Command | Observed |
|---|---|
| `npm test` | 40 passed, 0 failed |
| `CHROMIUM_EXECUTABLE="$(command -v google-chrome)" npm run test:e2e` | 8 passed (4.2s), local Chrome with an in-memory database |
| `npm audit` | 0 known vulnerabilities reported |
| `node corpus/evaluate.mjs 9533522` | Reproduced the Mission 4 raw-input counts below |

The [private Devin App](https://rollout-desk--bbcnjtf0.preview.devinapps.com) was redeployed after PR #9, but has not been checked in a signed-in browser since, and PR #9 had no CI checks. The local tests do not verify the hosted deployment. The hosted library is shared among authorized organization members; use the local demo for outside testers if outreach is approved.

| Raw SQL measure | Before #9 | After #9 |
|---|---:|---:|
| Parsed / total inputs | 54 / 60 | 54 / 60 |
| Parser rejections (no partial draft; 3 Auth and 3 pg_partman templates) | 6 | 6, same files |
| Files with findings / finding entries | 38 / 158 | 42 / 172 |
| Files with manual review / manual review only / manual entries | 37 / 16 / 94 | 30 / 12 / 75 |
| Original inspect notices / added lock notices | 30 / 0 | 30 / 85 |
| Parsed files explicitly marked execution scope unknown | 0 | 54 |

All 60 SQL hashes matched the [manifest](../corpus/manifest.json). The 14 new findings are 12 constraint and two rewrite entries, not 14 independently confirmed risks. Fewer generic manual items do not mean more migrations are safe.

### Accuracy counts with defined scope

The raw runner counts output, not correctness. For the checks below, a true positive (TP) requires a matching statement and operation/gate; a false negative (FN) is an expected specific gate or bundle classification missing even if the draft contains a generic manual item. A forward-scope false positive (FP) is a gate on SQL known not to execute in the pinned forward path. These units differ: **do not combine them into a confusion matrix or infer corpus-wide precision or recall**. The [historical ledger](CORPUS_ACCURACY_CASES.md) supplies the cases and statement numbers; the re-check drafted the same inputs against both engines. Transformed checks are reported separately from raw inputs.

| Checked cohort | Before #9 | After #9 |
|---|---:|---:|
| Visible operation routing across 261 parsed top-level statements: 72 CREATE INDEX, 11 UPDATE, 3 DELETE and 2 ALTER TYPE ADD VALUE. Matched by statement and kind; not a judgment about guidance or whether the runner executes it. | 88 TP, 0 FN | 88 TP, 0 FN |
| Five potentially dangerous omissions: two stored generated column rewrites in Temporal visibility v1.14 (one statement), and three historical CHECK validations in Storage `0069`. Counts are by operation, not by incident; checks could already be valid and columns could already exist. | 0 TP, 5 FN | 5 TP, 0 FN |
| Six explicit constraint removals: five in Trigger.dev `20250919123905…` and one in Storage `0017`. | 0 TP, 6 FN | 6 TP, 0 FN |
| Four other known misses: two River `004` immediate CHECK additions (statements 10 and 14, not the now-flagged removals), and two Trigger.dev enum replacement bundles (`20230213154802…`, `20240517105224…`). Existing type/drop gates do not identify the removed-label cast hazard. | 0 TP, 4 FN | 0 TP, 4 FN |
| Forward-scope FP gates: six Goose files give 21 raw vs. 7 Up-only gates; Storage's pinned runner skips three files and substitutes a literal control. Raw Storage gives one index gate and two manual items; the substitute gives neither. | 15 FP gates (14 Goose + 1 Storage); 2 additional manual items | Same; unknown-scope disclosure is not a runner fix |

**Earlier gaps that no longer reproduce:** the Temporal rewrite and Storage validation misses above; missing rendered Auth OAuth FK validation (now a separate gate); redundant generic ADD COLUMN noise for the Temporal v1.5 event literal default; and missing lock-span guidance on the Trigger.dev nanosecond backfill (now warns that the statement 2 lock can persist through statement 3). Replaying audit examples for `bigserial` and nullable `DEFAULT random()` also now produces rewrite gates. Some new-table index advice is now conditional, but the newly created partitioned parent in Trigger.dev `20250212053026…` still gets generic blocked-writes advice.

**Still open:** the six template files parse after example namespace substitution, not through a supported runner integration. Rendering, direction, batching and execution order outside the pasted text remain unknown. Storage `0068`'s procedural checks and trigger behavior still need manual inspection; opaque SQL has no operation-level guarantee. Other unresolved audit cases include distinguishing rewrites from metadata-only type changes, `NOT VALID` foreign keys on partitioned tables (rejected on the tested pre-18 versions), and heuristic zero row estimates on un-analyzed PG12/13 tables. Neither these spot checks nor the audit determine lock waits, workload effects, production row values, old-client compatibility or rollback success. No corpus SQL was executed and this sample is too small and selected to estimate a general dangerous-miss rate.

## What the product is up against

- **Detection and guidance:** [Squawk](https://github.com/sbdchd/squawk) covers more PostgreSQL DDL with free local/CI lint; [strong_migrations](https://github.com/ankane/strong_migrations) gives Rails teams free, framework-native guardrails. [Eugene](https://github.com/kaaveland/eugene) adds free lock tracing with disposable PostgreSQL rehearsal. [MergeBrake](https://github.com/mergebrake/mergebrake) overlaps the compatibility story with free static app-reference checks and PR comments.
- **Execution and governance:** free [pgroll](https://github.com/xataio/pgroll) implements parallel schema versions for supported changes rather than only proposing steps. [Atlas](https://atlasgo.io/pricing) offers limited free planning/execution; its migration lint is Pro-only from v0.38. [Bytebase](https://www.bytebase.com/pricing/) offers SQL review within its free Community limits. Commercial governance products do not establish demand for a standalone worksheet.
- **The differentiator is the combined review, not any one feature.** Optional DB evidence plus mixed-version and recovery questions plus an exportable human decision record could help occasional cross-service migrations. It cannot discover which clients or rollback binaries are live. A linter and a well-run PR template can reproduce much of the workflow; installation and copy/paste can erase any benefit. Local-first avoids a new DB connection or required upload but is not unique. The [competitor report](MISSION-5-PRODUCT-VALIDATION.md) reflects dated documentation and pricing, not side-by-side performance testing.

## What would change the decision

1. **Owner decisions pending:** select or confirm the distribution license and approve exact outreach channels and copy before any external trial. Do not add a license, contact people, spend money, create accounts or publish outreach without approval.
2. **If approved, run the [preregistered trial](trial/PROTOCOL.md) before feature work.** Pin the tested revision and refresh the facilitator's notes on engine output (the [trial package](trial/scenarios/ANSWER_KEY.md) records a pre-#9 baseline); do not change the scoring rules. Use at least five valid external sessions, comparing the worksheet with each developer's usual workflow on counterbalanced synthetic cases. Measure review time, consequential issues found and missed, actionable plans, false alarms, overtrust and willingness to use it again. Apply the full threshold, including ≥20 percentage points median coverage improvement, ≤1.25 median time ratio and limits on false alarms and overtrust. A positive signal warrants a second pilot comparing the strongest free workflow with and without the worksheet; look for voluntary repeat use on another migration before considering **B**, positioned as a companion.
3. **Keep the maintenance boundary.** While evidence is missing or mixed, preserve the local workflow and documented caveats; do not add broader lint, a runner or hosted commercial features. If the template baseline wins, repeat use fails to materialize or maintenance outweighs utility, consider **D**. Reconsider **A** only with sustained demonstrated value and a concrete reason users need more development; commercialization would require separate buyer evidence.
