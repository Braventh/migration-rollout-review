# PostgreSQL expert audit of the Rollout Desk rules

Mission 3 of the real-world validation mission: an independent review of the rules and recommendations in `review.mjs` (rule set `gateVersion: 1`, parser `pgsql-parser` 18.4.4) against the PostgreSQL documentation, with each important claim also checked on live PostgreSQL 12.22, 13.23, 14.25, 16.16, 17.12 and 18.7.

**Findings only.** The engine was not modified. Fixes belong to Mission 4 and should be prioritized together with the Mission 2 accuracy results.

- Evidence: [postgres/RESULTS.md](audit/postgres/RESULTS.md) (version × probe matrix, exact error texts, engine outputs).
- Reproduce: `bash docs/audit/postgres/probes.sh` (needs Docker; containers `pg12`…`pg18`), `node docs/audit/postgres/engine-probes.mjs`.
- Docs cited: PostgreSQL 17/18 `ALTER TABLE`, `CREATE INDEX`, `DROP INDEX`, `REINDEX`, `ALTER TYPE`, "Explicit Locking", "Table Partitioning", "Message Flow" (simple-query implicit transactions), `lock_timeout`, and the 11, 12, 14 and 18 release notes. Links are under each finding.

Labels: **Verified** = observed on a live server in this audit and matches the docs. **Docs** = stated in the docs, not separately probed. **Inference** = reviewer judgment.

## Verdict

The claims the engine does make are mostly correct, carefully worded and conservative: no stated fact was found to be false on any tested version. The weakness is what it does not say. The rule set has no model of **lock modes, lock queueing, lock duration or table rewrites**, so the guidance for the operations that cause most real Postgres migration outages is generic ("review blocked writes with the database owner") and a few dangerous operations get no finding at all. A reviewer reading a Rollout Desk plan learns *which* statements matter, but not *why* or *how long the table is blocked*, and in three verified cases (finding 1–3) is told nothing or the wrong thing is implied.

| # | Severity | Area | Finding |
|---|---|---|---|
| 1 | **High** (dangerous miss) | Rewrites | `ADD COLUMN … serial/bigserial` gets no finding, no manual-review item; it rewrites the table under ACCESS EXCLUSIVE. |
| 2 | **High** | Lock queue | No rule mentions lock queueing or `lock_timeout`; a migration that sets `lock_timeout` is pushed to manual review as "outside the rules". |
| 3 | **High** | Lock duration | Statements inside one `BEGIN … COMMIT` are judged one at a time; the ACCESS EXCLUSIVE lock from an early ALTER is held through a following backfill/index build. |
| 4 | Medium-High | Constraints | `SET NOT NULL` guidance omits the full-scan-under-ACCESS-EXCLUSIVE cost and the PG12+ CHECK … NOT VALID → VALIDATE → SET NOT NULL path (PG18: `NOT NULL NOT VALID`). |
| 5 | Medium-High | Index | `ADD UNIQUE` / `ADD PRIMARY KEY` get the same note as `CREATE INDEX`, but they hold ACCESS EXCLUSIVE (blocks reads) and PK may also scan for NULLs. |
| 6 | Medium | Index | `CREATE INDEX CONCURRENTLY IF NOT EXISTS` silently no-ops on a leftover INVALID index; not called out. |
| 7 | Medium | Index | Non-concurrent `DROP INDEX` takes ACCESS EXCLUSIVE on the table; engine says only "review the affected object". |
| 8 | Medium | Type | All type changes get one rewrite-oriented plan; no distinction between rewrite (int→bigint) and metadata-only (varchar widen, varchar→text). No mention of ACCESS EXCLUSIVE or index rebuild. |
| 9 | Medium | Transactions | Transaction-block restriction is detected only after an explicit `BEGIN`; multi-statement simple queries run in an implicit transaction (verified failure). |
| 10 | Medium | FK | FK note is correct but omits locks on *both* tables, the two-step NOT VALID → VALIDATE lock advantage, and that `NOT VALID` on partitioned tables fails before PG18. `VALIDATE CONSTRAINT` itself is "outside the rules". |
| 11 | Medium | Enum | No version note: pre-PG12 `ADD VALUE` cannot run in a transaction block at all; no statement that enum values cannot be dropped (rollback limitation). |
| 12 | Low-Medium | Defaults | Volatile-default detection is a fixed allowlist; `uuid_generate_v4()`, `uuidv7()` (PG18) and user functions fall to "verify volatility". Nullable volatile defaults (`DEFAULT random()`) are manual-review only. |
| 13 | Low | Noise | Every `ADD COLUMN … NOT NULL DEFAULT x` also emits "ADD COLUMN has additional constraints or defaults outside the rules"; CREATE INDEX / NOT NULL on a table created in the same migration are flagged as if live. |
| 14 | Low | Snapshot | On PG ≤13 `reltuples = 0` means "never analyzed", not "empty"; the existing-rows notice is then silently skipped. |
| 15 | Low | Partitions | `ATTACH PARTITION` manual-review text omits the partition / default-partition scan and the CHECK-constraint way to skip it; `DETACH … CONCURRENTLY` needs PG14+. |

## Findings

### 1. `serial`/`bigserial`/`identity` columns are missed — High, Verified
`ALTER TABLE t ADD COLUMN c bigserial;` produces **no finding, no manual-review item** (engine case a). On every version 12–18 it rewrote the table (`relfilenode` changed) under ACCESS EXCLUSIVE plus locks on the new sequence (probe 4). The docs: "Adding a column with a volatile DEFAULT … will require the entire table and its indexes to be rewritten" — `serial` expands to `DEFAULT nextval(...)`, and `nextval` is already in the engine's volatile list, but the parser AST carries the type name, not a default node, so the rule never runs. This is the only case found where the plan reads as *clean* for an operation that blocks reads and writes for the full rewrite.
Docs: [ALTER TABLE notes](https://www.postgresql.org/docs/17/sql-altertable.html), [serial types](https://www.postgresql.org/docs/17/datatype-numeric.html).
*Recommendation:* treat `serial`, `smallserial`, `bigserial` and `GENERATED … AS IDENTITY` on ADD COLUMN as a volatile-default rewrite (identity behavior should be probed before stating it).

### 2. Lock queueing and `lock_timeout` are absent — High, Verified
PG17 probe 17: with session A holding a plain `SELECT` transaction, B's `ALTER TABLE … ADD COLUMN` waited, and an unrelated `SELECT count(*)` in C **queued behind B and timed out** — so even a "metadata-only" ALTER blocks all reads and writes while it waits. With `SET lock_timeout = '1s'` B failed in ~1 s and C completed. The docs' conflict table (ACCESS EXCLUSIVE conflicts with every mode) implies this; `lock_timeout` exists to bound it.
The engine never mentions this, and case c (`SET lock_timeout = '5s'; ALTER …`) is reported as "Session setting other than search_path; verify it with the runner" — the standard safety measure is penalized as unknown.
Docs: [Explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html), [lock_timeout](https://www.postgresql.org/docs/17/runtime-config-client.html).
*Recommendation:* every ACCESS EXCLUSIVE / SHARE finding should say that waiting for the lock blocks later queries and recommend `lock_timeout` + retry; recognize `lock_timeout` / `statement_timeout` settings instead of sending them to manual review (still note runner scope for `SET` vs `SET LOCAL`).

### 3. Lock duration across a transaction is not modeled — High, Docs + Verified engine output
Locks are held until the transaction ends (Explicit Locking: "Once acquired, a lock is normally held until the end of the transaction"). Engine case d — `BEGIN; ALTER … ADD COLUMN … DEFAULT 0; UPDATE t SET a = 1; CREATE INDEX ON t(a); COMMIT;` — gets three independent findings; nothing says that the ALTER's ACCESS EXCLUSIVE lock is held for the whole full-table UPDATE and index build, i.e. the table is unreadable for their entire duration. Many frameworks wrap each migration file in a transaction by default, so this is the common case, not an edge case.
*Recommendation:* when a strong lock is followed by data work or an index build in the same (explicit or implicit) transaction, emit one finding naming the combined blocking window and suggesting splitting.

### 4. `SET NOT NULL` — Medium-High, Verified
The engine flags `SET NOT NULL` with the generic "Required value" plan and an empty note. Verified on 12–18: it takes ACCESS EXCLUSIVE and scans the table (`DEBUG: verifying table "t"`); after `ADD CONSTRAINT … CHECK (a IS NOT NULL) NOT VALID` + `VALIDATE CONSTRAINT` (SHARE UPDATE EXCLUSIVE, does not block reads/writes) the scan is skipped ("existing constraints on column … are sufficient to prove …"). PG18 adds `NOT NULL … NOT VALID` directly. Engine case h runs exactly this safe sequence and reports the first two steps as "outside the rules" and the third with no recognition that it is now cheap.
Docs: [ALTER TABLE SET NOT NULL](https://www.postgresql.org/docs/17/sql-altertable.html), [PG12 release notes](https://www.postgresql.org/docs/release/12.0/), [PG18 ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html).

### 5. UNIQUE / PRIMARY KEY constraints vs CREATE INDEX — Medium-High, Verified
`CREATE INDEX` holds SHARE on the table (blocks writes, allows reads). `ADD CONSTRAINT … UNIQUE` and `ADD PRIMARY KEY` held **ACCESS EXCLUSIVE + SHARE** on 12–18 (probe 11) — reads blocked for the whole build — and `ADD PRIMARY KEY` on nullable columns also runs `SET NOT NULL`'s full scan (docs). The engine gives both the same "This constraint can build an index unless it uses an existing one" note, and gives `ADD CONSTRAINT … USING INDEX` (the safe path, case n) the identical note.
*Recommendation:* say ACCESS EXCLUSIVE; recommend `CREATE UNIQUE INDEX CONCURRENTLY` then `ADD CONSTRAINT … USING INDEX`; distinguish the USING INDEX form.
Docs: [ALTER TABLE ADD table_constraint_using_index](https://www.postgresql.org/docs/17/sql-altertable.html).

### 6. CIC failure leaves an INVALID index; IF NOT EXISTS hides it — Medium, Verified
On 12–18 a failed `CREATE UNIQUE INDEX CONCURRENTLY` left the index with `indisvalid = false`, and a retry with `IF NOT EXISTS` printed `NOTICE: … already exists, skipping` and returned `CREATE INDEX` with the index still invalid (probe 10). The docs confirm the invalid leftover still "consume[s] update overhead" and that unique enforcement starts before the build finishes. The engine's "Verify … resulting usable index" pause text points in the right direction, and the capture query reports invalid indexes, but case i (`CIC IF NOT EXISTS`) gets only the generic note. Rerunnable migration tools commonly use exactly this form.
Docs: [Building indexes concurrently](https://www.postgresql.org/docs/17/sql-createindex.html).

### 7. DROP INDEX — Medium, Verified
Non-concurrent `DROP INDEX` held ACCESS EXCLUSIVE on the table on all versions; `DROP INDEX CONCURRENTLY` cannot run in a transaction block, accepts one index, no CASCADE, and cannot drop indexes on partitioned tables (docs). The engine's note for case g is "Review the affected object and dependent objects separately." It does correctly detect `DROP INDEX CONCURRENTLY` inside `BEGIN`.
Docs: [DROP INDEX](https://www.postgresql.org/docs/17/sql-dropindex.html).

### 8. Type changes — Medium, Verified
All versions: `int → bigint` and `text → varchar(10)` rewrote the table and its indexes under ACCESS EXCLUSIVE; `varchar(10) → varchar(20)`, `varchar → text` and `numeric(10,2) → numeric(12,2)` did not rewrite but still took ACCESS EXCLUSIVE (probe 13). The docs give the binary-coercible exception. The engine's single "Type change" plan (copy, reconcile, switch) is right for representation changes that break clients but **overly broad** for safe widenings (case f) and **incomplete** for rewrites (no mention of the rewrite or the lock). Application-level guidance (SDK serialization, boundary values) remains valuable and should stay.

### 9. Implicit transaction blocks — Medium, Verified
`psql -c "CREATE TABLE x(i int); CREATE INDEX CONCURRENTLY ON x(i);"` failed on every version with `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` and **rolled back the CREATE TABLE** (probe 9). The docs: statements in one simple Query message run in an implicit transaction block. The engine emits the transaction-block notice only after an explicit `BEGIN`; otherwise it relies on the note "confirm the runner does not wrap it in a transaction", which does not mention that sending the whole file as one query also counts. Also applies to `REINDEX CONCURRENTLY`, `DROP INDEX CONCURRENTLY`, `DETACH PARTITION CONCURRENTLY` (all verified to fail in a block), and to non-concurrent `REINDEX SCHEMA/DATABASE/SYSTEM` (docs), which the engine does not check.
Docs: [Multiple statements in a simple query](https://www.postgresql.org/docs/17/protocol-flow.html).

### 10. Foreign keys — Medium, Verified
Correct: "NOT VALID skips the historical scan, not enforcement on new writes" (docs). Missing:
- `ADD FOREIGN KEY` takes SHARE ROW EXCLUSIVE on **both** the child and the referenced table (verified; blocks writes to both) — the plan talks only about the child.
- `VALIDATE CONSTRAINT` takes only SHARE UPDATE EXCLUSIVE on the child and ROW SHARE on the parent (verified), which is the reason to split; the engine reports `VALIDATE CONSTRAINT` as "outside the rules".
- `ADD FOREIGN KEY … NOT VALID` on a partitioned table **errors on PG12–17** (`cannot add NOT VALID foreign key on partitioned table`) and works on PG18 (verified; PG18 release notes).
- No mention that an unindexed referencing column makes parent deletes/updates scan the child (Inference/common practice; docs note the index is "often a good idea").
Docs: [ALTER TABLE ADD CONSTRAINT](https://www.postgresql.org/docs/17/sql-altertable.html), [FK index note](https://www.postgresql.org/docs/17/ddl-constraints.html).

### 11. Enums — Medium, Verified
Correct and verified 12–18: a value added in a transaction cannot be used before commit (`unsafe use of new value`), and the engine's notice for it is accurate. Missing:
- PG11 and older: `ALTER TYPE … ADD VALUE` "cannot be executed inside a transaction block" at all (PG11 docs). The engine has no version context, so a runner that wraps migrations fails outright there. (PG11 is EOL; still worth one line.)
- Rollback limitation: there is no way to remove an enum value (PG12–16: syntax error; PG17–18: `dropping an enum value is not implemented`, verified). The plan says "turning a flag off does not remove stored values"; it should also say the type change itself is irreversible without recreating the type.
Docs: [ALTER TYPE notes](https://www.postgresql.org/docs/17/sql-altertype.html), [enum types](https://www.postgresql.org/docs/17/datatype-enum.html).

### 12. Volatile defaults — Low-Medium, Verified
The literal-default claim ("PostgreSQL 11+ can add the column without a table rewrite") is correct (PG11 release notes; probe 1 no rewrite on 12–18). It is slightly too narrow: the docs say any *non-volatile* default avoids the rewrite — `DEFAULT now()` (STABLE) did not rewrite on any version (probe 2) but is reported as "DEFAULT is an expression. Verify its volatility". The volatile list misses `uuid_generate_v4()` (uuid-ossp), `uuidv7()` (PG18), `random_normal()` (PG16) and every user function (case l). `ADD COLUMN c float8 DEFAULT random()` without NOT NULL rewrote on all versions (probe 3) but gets only a manual-review line (case b). Acceptable as conservative, but the volatile-but-nullable case should get the same rewrite finding as the NOT NULL case.

### 13. Noise — Low, Verified engine output
- Every `ADD COLUMN … NOT NULL DEFAULT <literal>` also emits "ADD COLUMN has additional constraints or defaults outside the rules" (cases d, j, l) because `CONSTR_DEFAULT` is not in the known-constraint list — contradicting the finding right above it.
- `CREATE INDEX` and `ADD COLUMN … NOT NULL` on a table created earlier in the same migration (case e) get the live-table warnings. The engine already tracks `created`; these are false positives for the most common "new table" migration shape.

### 14. Snapshot row estimate — Low, Verified
`reltuples` of a never-analyzed 1000-row table is `0` on PG12/13 and `-1` on PG14+ (probe 18). The capture query maps `-1` to unknown correctly, but on PG ≤13 the `0` passes as "0 rows" and the "Verify existing rows before adding a NOT NULL column" notice is skipped. The finding text ("fails if the table has existing rows") still stands, so impact is low. Consider capturing `server_version_num` in the snapshot; it would also enable the version-aware notes above.

### 15. Partitions — Low, Verified
Correct: CIC on a partitioned parent is not supported (verified 12–18), and partition parent sizes do not roll up. ATTACH PARTITION took SHARE UPDATE EXCLUSIVE on the parent and ACCESS EXCLUSIVE on the attached table (verified); the docs add ACCESS EXCLUSIVE on the default partition and a validation scan of both unless a matching CHECK constraint exists. `DETACH … CONCURRENTLY` exists from PG14 and cannot run in a transaction block (verified) or with a default partition (docs). The manual-review text could name these. The partitioned-CIC notice could also point to `CREATE INDEX … ON ONLY parent` + per-partition CIC + `ALTER INDEX … ATTACH PARTITION` (docs).
Docs: [Partition maintenance](https://www.postgresql.org/docs/17/ddl-partitioning.html).

## Claims confirmed correct

| Claim in engine | Status |
|---|---|
| NOT NULL column with no non-null default fails on a non-empty table | Verified 12–18 |
| Literal non-null DEFAULT avoids rewrite on PG11+ | Verified 12–18; PG11 release notes |
| Known volatile DEFAULT requires a full rewrite | Verified (`random()`, `nextval` via serial) |
| CREATE INDEX without CONCURRENTLY blocks writes (SHARE) | Verified 12–18 |
| CIC / REINDEX CONCURRENTLY / DROP INDEX CONCURRENTLY / DETACH CONCURRENTLY cannot run in a transaction block | Verified (DETACH on 14+) |
| CIC on a partitioned parent is unsupported | Verified 12–18 |
| NOT VALID FK still enforces new writes | Docs |
| New enum value unusable until commit | Verified 12–18 |
| Partition parent size/estimates do not include children | Docs (`pg_total_relation_size` of a partitioned table) |
| Standby replay age is not lag and rises when the primary is idle | Docs (`pg_last_xact_replay_timestamp`) |
| `pg_stat_activity` visibility is limited by role | Docs |
| DROP … CASCADE may remove dependent objects | Docs |

## Mixed-version and rollback guidance

The expand/contract wording for renames, drops, required values, splits and enums is sound application-level advice and matches common practice; it is not a PostgreSQL-documented behavior and should keep being presented as a checklist, not a verified claim. Two gaps: (a) RENAME and DROP COLUMN are metadata-only but still take ACCESS EXCLUSIVE (verified), so finding 2 applies to them; (b) the plans do not say which steps are irreversible after commit (DROP, TRUNCATE, enum ADD VALUE, narrowing type changes) versus undoable by a follow-up migration.

## Limits of this audit

- Probes ran on small (~1000-row) throwaway tables; they establish lock modes and rewrite/no-rewrite, not durations on real data.
- PG11 and older were not run (EOL); PG11 statements are from its docs. PG15 was not run (behavior assumed between 14 and 16).
- Identity columns, generated columns, exclusion constraints, `CLUSTER`, `VACUUM FULL`, triggers, RLS policies and extension DDL were not audited.
- Engine accuracy on real-world migrations is Mission 2's scope; this audit used hand-written statements.
