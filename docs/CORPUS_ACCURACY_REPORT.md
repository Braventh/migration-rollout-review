# Rollout Desk: real migration accuracy report

**Mission 2 verdict:** Useful as a first-pass review aid, not a stand-alone rollout gate. The engine identifies many visible schema and data changes and asks useful compatibility questions. It does not reliably know what a migration runner will execute, and generic manual-review warnings can hide concrete rewrite, validation and compatibility risks. No engine changes were made.

## Method and scope

- Baseline: [`c266429`](https://github.com/Braventh/migration-rollout-review/tree/c266429096d9c4d770adf3036656021aef1813dc), Node.js 24.22.2, `pgsql-parser` 18.4.4. Verified the local SHA-256 digests of all 60 [pinned migrations](../corpus/manifest.json) and 10 licenses. This is a deliberately varied sample, not a random or production-weighted sample.
- Pasted the verbatim files programmatically into the unchanged `inspect(sql)` and `draft({title, sql})` paths with no database snapshot, release context or decisions. Compared operation, target, finding, manual-review text, notices and proposed sequence/verification. Three independent reviewers read the SQL in separate project groups before comparing output; the synthesis checked runner semantics and key findings separately. Collector tags were **not** used as labels.
- Raw SQL findings are separate from judgments about **forward execution**. Spot checks used the Goose Up section, Storage's documented no-op substitution, and explicit sample schema substitutions for Auth, pg_partman and River. No corpus SQL was run or rewritten in the repository. We did not infer row counts, lock waits, actual runner configuration, deployed client behavior or migration success.

## What the engine returned

| Raw outcome | Result |
|---|---:|
| Analyzed and drafted | 54 of 60 files (90%); 261 top-level statements |
| Parse rejection, no partial result or draft | 6 of 60 (10%); 3 Auth Go templates and 3 pg_partman extension templates |
| Files with a finding | 38 of 54 analyzed; 21 also had manual-review entries, 17 did not |
| Files with manual review but no finding | 16 of 54 analyzed |
| Finding entries | 158: 72 index, 44 removal, 12 backfill, 12 type, 8 required, 7 rename, 2 enum, 1 FK |
| Manual-review entries | 94 across 37 files; counts include multiple subcommands from the same statement |
| Inspect notices | 30; all assumed `public` for unqualified relation capture |
| Marked as a no-material-pattern control | 0 raw files |

These are **emission and coverage counts**, not precision or recall. A correct operation label can carry incorrect guidance. One operation can produce several entries, a procedural block can hide several operations behind one entry, and scoped production ground truth is unavailable. The [case ledger](CORPUS_ACCURACY_CASES.md) records the verdict and observed counts for every input.

## Accuracy findings

| Category | What the evidence shows |
|---|---|
| True positives | Matched all 72 visible `CREATE INDEX` statements, all 11 top-level `UPDATE` statements, all 3 top-level `DELETE` statements (including Umami's CTE-backed deduplication), and both visible `ALTER TYPE … ADD VALUE` statements. Those are syntax-level matches, not endorsements of the associated risks or recommendations. Existing-table index builds, direct drops and mixed-version renames were often actionable. |
| False positives for an Up deployment | The six Goose files yielded 21 raw findings vs. seven Up-only findings. The 14 Down-only findings (13 removals and one index build) are real SQL but not part of Up. The pinned Storage runner skips three files; one raw run emitted a concurrent unique index gate and the other two requested manual review of bodies the runner does not execute. |
| False negatives / underclassification | Two stored generated columns in one Temporal statement had no rewrite gate; three Storage `VALIDATE CONSTRAINT` statements had no validation gate. River's live CHECK replacements, Trigger.dev's enum recreation and five FK removals, and Storage's staged CHECK/trigger changes were recognized only in part or via generic manual review. See the evidence below; these are not silent parser failures. |
| Correctly uncovered | Opaque Auth `DO` bodies and PGMQ routines are not honestly analyzable from the outer AST alone; the output explicitly calls for manual review. PGMQ's definition-time changes must not be conflated with DDL/data movement the functions perform only if invoked. New-table dependencies can also reasonably be deferred to manual review. |
| Incorrectly or imprecisely uncovered | OpenFGA's literal required default and four Temporal literal required defaults get both a correct no-rewrite-on-11+ note and a generic “additional constraints or defaults outside the rules” message. These messages are redundant for the actual analyzed default. A specific known high-impact operation reported only as an AST name is a coverage gap, not proof of safety. |
| Parser failures | The six raw rejections report syntax near `{` or `@`; none proceeds to a partial review. All six parse after explicit sample schema substitutions. Three other Auth files parse raw because the templates are inside dollar-quoted bodies, not because the templates or bodies were analyzed. |
| Incorrect or misleading guidance | Forty index gates concern structures on tables unconditionally created earlier in the same bundle (one more follows `CREATE TABLE IF NOT EXISTS`). The live-writer warning is poorly prioritized for those 40 builds; it can still apply to the conditional one. OpenFGA `002` advises pausing if a writer can omit a new value even though PostgreSQL supplies the non-null literal default; check explicit NULL, semantics and DDL locks instead. Separate gates also miss dependencies in copy/drop/rename bundles. |
| Potentially dangerous missed operations | An existing-table rewrite, a failed cast of a removed enum value, a validation scan or a newly enforced writer restriction can matter even in a plan with other valid gates. These are conditional hazards, not reported incidents. |

### Priority evidence for the next reliability pass

1. **Make execution scope explicit before reporting gates.** `openfga/004_add_authorization_model_serialized_protobuf` is additive Up; the only raw gate is the Down drop. `openfga/001_initialize_schema` reports five table drops that are all Down. `storage/0031-objects-level-index` generates an index gate while the [pinned Storage runner substitutes `SELECT 1;`](https://github.com/supabase/storage/blob/c0d596a798f8b21a9a5808875e6bfcdc02ca54a7/src/internal/database/migrations/migrate.ts#L918-L927); that exact substitute is correctly classified as a control. River's schema marker is a comment to PostgreSQL but is [rendered by the runner](https://github.com/riverqueue/river/blob/1f19003d1b65e32206f18bd73b222d61b1773972/rivermigrate/river_migrate.go#L592-L605). For a sample custom River schema, all seven rendered inputs capture that schema instead of the raw run's warned-about `public` assumption. Request the executable direction and rendered SQL, or explicitly label the input scope unresolved. Preserve parse errors, never fall back to a clean report.
2. **Surface material table work even when other gates exist.** `temporal/visibility-v1.14-add_external_payload_size_and_count_search_attributes` statement 1 adds two stored generated columns to the visibility table. If added, PostgreSQL computes stored values on existing rows via a rewrite ([PostgreSQL 18 ALTER TABLE notes](https://www.postgresql.org/docs/18/sql-altertable.html#SQL-ALTERTABLE-NOTES), [12 implementation](https://github.com/postgres/postgres/blob/REL_12_STABLE/src/backend/commands/tablecmds.c)). The report emits two generic ADD COLUMN messages, then two actionable concurrent index gates; neither makes the preceding rewrite safe. Rehearse generated expressions against representative historical data and budget rewrite, locks and capacity; `IF NOT EXISTS` and actual data/size are unknown. The conditional invalid-index cleanup in statement 2 is correctly opaque.
3. **Separate enforcement, validation and removal of constraints.** `storage/0069-validate-bucket-lifecycle-constraints` statements 1–3 are all `AT_ValidateConstraint` manual messages, with no sequence or verification. The companion `0068` adds `NOT VALID` checks in statement 2 and installs writer restrictions via triggers in statement 5. For the rendered Auth OAuth migration, statement 2 correctly notes that the FK defers historical validation, but statement 3 immediately validates it and is only generic manual review; the individual note is true, not a guarantee that the bundle defers the scan to a later deployment. PostgreSQL [enforces new writes before validation and uses a distinct validation lock and scan](https://www.postgresql.org/docs/17/sql-altertable.html#SQL-ALTERTABLE-NOTES). River `004` also replaces live CHECKs (statements 9–10 and 14), while Trigger.dev `20250919123905…` removes five FKs with no guidance about lost enforcement/cascade or recovery writers. Validate current constraint state and history before deciding whether the actual scan or compatibility failure will occur.
4. **Connect operations into a single rollout decision.** Trigger.dev `20240517105224_remove_test_alert_type` correctly has type/drop gates but no enum-evolution gate for the create/cast/rename/drop sequence. Statement 3 casts arrays and statements 4–5 cast scalars; any remaining `TEST` values would fail conversion. Verify both scalar and array values and rehearse old writers and recovery before contract. Trigger.dev `20240319120645_convert_start_time_to_nanoseconds_since_epoch` correctly flags the full-table update, drop and rename (3–5), but the three generic gates do not say the script swaps representation, leaves the replacement nullable, and holds the earlier ALTER TABLE lock across the update in one explicit transaction ([PostgreSQL lock lifetime](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-TABLES)). Temporal `temporal-v1.16-fix_data_encoding_column` similarly identifies the drop and required re-add but does not explicitly connect them: if prior values exist, re-adding the same name with `''` does not preserve them. Treat these as bundle-level guidance gaps, not missed individual operations.
5. **Tailor index and recovery advice to scope.** On an existing target, e.g. the 17 ordinary builds in Umami `03_metric_performance_index`, the write-blocking check is worthwhile. For a freshly created target or fresh partitioned parent (Trigger.dev `20250212053026…`, `20260622120731…`), indicate that existing live-target write blocking is not the same risk; check the partition plan rather than steering the reviewer toward a concurrent parent build, which [PostgreSQL does not support](https://www.postgresql.org/docs/17/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY). For River `006_bulk_unique`, honor the conditional/out-of-band build and old-index retirement described in the source; verify uniqueness behavior and old-job drain, not just latency. Storage `0053-drop-index-lower-name` is correctly recognized as a drop but its generic gate does not explain the [concurrent drop transaction restriction](https://www.postgresql.org/docs/17/sql-dropindex.html) or replacement-plan checks. Do not infer that a transaction notice is absent because the runner is compatible.

## Usefulness and confidence

- **Keep:** Statement-local labels, scoped targets where known, explicit no-snapshot/no-approval wording, ordinary vs. concurrent build distinction, NOT VALID writer guidance and specific data-reconciliation questions. The raw engine never called any corpus file a control; it did not explicitly declare a migration safe.
- **Improve first:** Label runner scope, show coverage separately from findings, and surface high-impact unhandled operations prominently even when the plan has other valid gates. A detailed plan with no gate for a rewrite or validation step is not evidence of complete review. Conversely, don't make fresh-table indexes or a harmless metadata action read like a live-table rollout blocker.
- **Uncertain / not tested:** Performance on real data, actual lock timing or failure rate, RLS/application compatibility, whether affected datasets contain removed enum values or duplicates, the installed schema and server version in a particular deployment, exact index validity or usage, user trust in practice, and input forms not represented here. Static results and no-op comparisons do not prove a rollout safe.

## Reproduce without executing SQL

From a clean checkout of the baseline (or this findings-only commit), under Node.js 24, run:

```sh
npm ci
node corpus/fetch.mjs
node --input-type=module > corpus-accuracy.json <<'NODE'
import { readFile } from 'node:fs/promises';
import { inspect, draft } from './review.mjs';
import { parse } from 'pgsql-parser';

const manifest = JSON.parse(await readFile('corpus/manifest.json', 'utf8'));
const rows = [];
for (const { id, path, sha256, permalink } of manifest.files) {
  const sql = await readFile('corpus/' + path, 'utf8');
  const row = { id, path, sha256, permalink, characters: sql.length };
  try {
    const { query, ...analysis } = await inspect(sql);
    const { sql: _sql, ...plan } = await draft({ title: 'Corpus: ' + id.slice(0, 112), sql });
    const { stmts = [] } = await parse(sql.trim());
    Object.assign(row, {
      statementTypes: stmts.map(({ stmt }) => Object.keys(stmt)[0]), analysis, plan
    });
  } catch (error) {
    Object.assign(row, { errorType: error.constructor.name, error: error.message });
  }
  rows.push(row);
}
console.log(JSON.stringify(rows, null, 2));
NODE
```

For separate comparisons only, truncate the six Goose inputs at the `-- +goose Down` line; replace the three Storage inputs carrying the exact `-- postgres-migrations ignore` directive with `SELECT 1;`; substitute `auth` for `{{ index .Options "Namespace" }}`, `partman` for `@extschema@`, and `"example_river".` for `/* TEMPLATE: schema */` in their respective project inputs. The namespace substitutions are diagnostic examples, not a runner emulator. Do not mix transformed outcomes into the raw totals.
