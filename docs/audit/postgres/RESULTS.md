# Rollout Desk PostgreSQL behavior audit

Generated from the reproducible probes under `docs/audit/postgres (originally run from ~/audit)`. No engine or tracked repo file was modified; `git status --short --branch` remained `## main...origin/main` in `the repo checkout`.

## Method and artifacts

- Probe run: `2026-11-23T07:00:01+00:00`; versions: PostgreSQL 12.22 (tag 12), 13.23 (tag 13), 14.25 (tag 14), 16.16 (tag 16), 17.12 (tag 17), 18.7 (tag 18). No requested tag was skipped.
- Direct `docker.io` pulls initially returned HTTP 429 (Too Many Requests), so the same official images were pulled through `mirror.gcr.io/library/postgres:NN` and tagged locally as `postgres:NN`. Containers `pg12`, `pg13`, `pg14`, `pg16`, `pg17`, and `pg18` were left running.
- Live probe script: `docs/audit/postgres (originally run from ~/audit)/probes.sh`; engine probe script: `<local path>`; parser/renderer helpers: `parse-logs.py` and `build-results.py`.
- Raw logs: `docs/audit/postgres (originally run from ~/audit)/logs/pgNN.log`, `logs/pg17-lockqueue/`, `logs/engine-probes.log`, `logs/setup.log`, `logs/containers.txt`, and `logs/parsed-summary.json`.
- Each live probe used `docker exec -i pgNN psql -U postgres -v ON_ERROR_STOP=0`; the implicit-transaction case was additionally sent as one string through `psql -c`, as requested. Rewrites are `pg_class.relfilenode` before/after comparisons. Locks come from the prescribed same-transaction `pg_locks` query.
- Lock abbreviations: AS=AccessShareLock, RS=RowShareLock, RE=RowExclusiveLock, S=ShareLock, SUE=ShareUpdateExclusiveLock, SRE=ShareRowExclusiveLock, AE=AccessExclusiveLock. FK=foreign key; CIC=CREATE INDEX CONCURRENTLY; NV=NOT VALID. `R` means table rewrite. `+tmp` means additional numeric-OID rows whose object names did not resolve through `relation::regclass` (typically transient rewrite/drop objects). The prescribed query also records `pg_locks=AS` whenever it runs; that self-row, catalog rows, and toast rows are omitted below except where noted, but are in the raw logs.
- stdout and stderr were captured together; psql buffering can transpose command tags and error lines in a few raw sections, but it does not alter the error text or measured state.

## Part A — live PostgreSQL probes

| Probe | PG12 | PG13 | PG14 | PG16 | PG17 | PG18 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 ADD COLUMN c int NOT NULL DEFAULT 5 | OK; R=no; t=AE | OK; R=no; t=AE | OK; R=no; t=AE | OK; R=no; t=AE | OK; R=no; t=AE | OK; R=no; t=AE |
| 2 ADD COLUMN c timestamptz NOT NULL DEFAULT now() | OK; R=no; t=AE | OK; R=no; t=AE | OK; R=no; t=AE | OK; R=no; t=AE | OK; R=no; t=AE | OK; R=no; t=AE |
| 3 ADD COLUMN c float8 DEFAULT random() (nullable) | OK; R=yes; t=AE+S; t_pkey=AE; +tmp | OK; R=yes; t=AE+S; t_pkey=AE; +tmp | OK; R=yes; t=AE+S; t_pkey=AE; +tmp | OK; R=yes; t=AE+S; t_pkey=AE; +tmp | OK; R=yes; t=AE+S; t_pkey=AE; +tmp | OK; R=yes; t=AE+S; t_pkey=AE; +tmp |
| 4 ADD COLUMN c bigserial | OK; R=yes; t=AS+AE+S; t_pkey=AE; t_c_seq=AE+RE+SRE; +tmp | OK; R=yes; t=AS+AE+S; t_pkey=AE; t_c_seq=AE+RE+SRE; +tmp | OK; R=yes; t=AS+AE+S; t_pkey=AE; t_c_seq=AE+RE+SRE; +tmp | OK; R=yes; t=AS+AE+S; t_pkey=AE; t_c_seq=AE+RE+SRE; +tmp | OK; R=yes; t=AS+AE+S; t_pkey=AE; t_c_seq=AE+RE+SRE; +tmp | OK; R=yes; t=AS+AE+S; t_pkey=AE; t_c_seq=AE+RE+SRE; +tmp |
| 5 ADD COLUMN c int NOT NULL, no default, non-empty | ERR E-NN12 | ERR E-NN | ERR E-NN | ERR E-NN | ERR E-NN | ERR E-NN |
| 6 ALTER COLUMN a SET NOT NULL; baseline / after valid CHECK | t=AE in both; baseline scans; validated CHECK skips scan (DEBUG key below) | t=AE in both; baseline scans; validated CHECK skips scan (DEBUG key below) | t=AE in both; baseline scans; validated CHECK skips scan (DEBUG key below) | t=AE in both; baseline scans; validated CHECK skips scan (DEBUG key below) | t=AE in both; baseline scans; validated CHECK skips scan (DEBUG key below) | t=AE in both; baseline scans; validated CHECK skips scan (DEBUG key below) |
| 7 ADD FK / NOT VALID / VALIDATE locks | plain: parent=AS+RS+SRE, parent_pkey=AS; child=AS+SRE, child_pkey=AS<br>NV: parent=AS+SRE; child=AS+SRE<br>VALIDATE: parent=AS+RS, parent_pkey=AS; child=AS+SUE, child_pkey=AS | plain: parent=AS+RS+SRE, parent_pkey=AS; child=AS+SRE, child_pkey=AS<br>NV: parent=AS+SRE; child=AS+SRE<br>VALIDATE: parent=AS+RS, parent_pkey=AS; child=AS+SUE, child_pkey=AS | plain: parent=AS+RS+SRE, parent_pkey=AS; child=AS+SRE, child_pkey=AS<br>NV: parent=AS+SRE, parent_pkey=AS; child=AS+SRE<br>VALIDATE: parent=AS+RS, parent_pkey=AS; child=AS+SUE, child_pkey=AS | plain: parent=AS+RS+SRE, parent_pkey=AS; child=AS+SRE, child_pkey=AS<br>NV: parent=AS+SRE, parent_pkey=AS; child=AS+SRE<br>VALIDATE: parent=AS+RS, parent_pkey=AS; child=AS+SUE, child_pkey=AS | plain: parent=AS+RS+SRE, parent_pkey=AS; child=AS+SRE, child_pkey=AS<br>NV: parent=AS+SRE, parent_pkey=AS; child=AS+SRE<br>VALIDATE: parent=AS+RS, parent_pkey=AS; child=AS+SUE, child_pkey=AS | plain: parent=AS+RS+SRE, parent_pkey=AS; child=AS+SRE, child_pkey=AS<br>NV: parent=AS+SRE, parent_pkey=AS; child=AS+SRE<br>VALIDATE: parent=AS+RS, parent_pkey=AS; child=AS+SUE, child_pkey=AS |
| 8 FK NOT VALID on partitioned child | ERR E-FK-PART | ERR E-FK-PART | ERR E-FK-PART | ERR E-FK-PART | ERR E-FK-PART | OK: ALTER TABLE |
| 9 CREATE INDEX, non-concurrent locks | t=S; idx_t_a=AE | t=S; idx_t_a=AE | t=S; idx_t_a=AE | t=S; idx_t_a=AE | t=S; idx_t_a=AE | t=S; idx_t_a=AE |
| 9 CREATE INDEX CONCURRENTLY inside BEGIN | ERR E-CIC-TX | ERR E-CIC-TX | ERR E-CIC-TX | ERR E-CIC-TX | ERR E-CIC-TX | ERR E-CIC-TX |
| 9 CREATE INDEX CONCURRENTLY on partitioned parent | ERR E-CIC-PART | ERR E-CIC-PART | ERR E-CIC-PART | ERR E-CIC-PART | ERR E-CIC-PART | ERR E-CIC-PART |
| 9 psql -c multi-statement implicit transaction | ERR E-CIC-TX; psql rc=1; table x absent | ERR E-CIC-TX; psql rc=1; table x absent | ERR E-CIC-TX; psql rc=1; table x absent | ERR E-CIC-TX; psql rc=1; table x absent | ERR E-CIC-TX; psql rc=1; table x absent | ERR E-CIC-TX; psql rc=1; table x absent |
| 10 failed unique CIC, then CREATE ... IF NOT EXISTS | first ERR E-CUIC; retry NOTICE skips; indisvalid=false and indisready=false both after failure and after retry | first ERR E-CUIC; retry NOTICE skips; indisvalid=false and indisready=false both after failure and after retry | first ERR E-CUIC; retry NOTICE skips; indisvalid=false and indisready=false both after failure and after retry | first ERR E-CUIC; retry NOTICE skips; indisvalid=false and indisready=false both after failure and after retry | first ERR E-CUIC; retry NOTICE skips; indisvalid=false and indisready=false both after failure and after retry | first ERR E-CUIC; retry NOTICE skips; indisvalid=false and indisready=false both after failure and after retry |
| 11 ADD CONSTRAINT u UNIQUE (a) locks | t=AE+S; backing index u=AE | t=AE+S; backing index u=AE | t=AE+S; backing index u=AE | t=AE+S; backing index u=AE | t=AE+S; backing index u=AE | t=AE+S; backing index u=AE |
| 11 ADD PRIMARY KEY on nullable column locks | npk=AE+S; npk_pkey=AE | npk=AE+S; npk_pkey=AE | npk=AE+S; npk_pkey=AE | npk=AE+S; npk_pkey=AE | npk=AE+S; npk_pkey=AE | npk=AE+S; npk_pkey=AE |
| 12 enum ADD VALUE in tx; DROP VALUE syntax | use in same tx: E-ENUM-USE<br>drop: E-ENUM-DROP-SYN | use in same tx: E-ENUM-USE<br>drop: E-ENUM-DROP-SYN | use in same tx: E-ENUM-USE<br>drop: E-ENUM-DROP-SYN | use in same tx: E-ENUM-USE<br>drop: E-ENUM-DROP-SYN | use in same tx: E-ENUM-USE<br>drop: E-ENUM-DROP-NOTIMPL | use in same tx: E-ENUM-USE<br>drop: E-ENUM-DROP-NOTIMPL |
| 13 TYPE int → bigint | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp |
| 13 TYPE varchar(10) → varchar(20) | R=no; t=AE | R=no; t=AE | R=no; t=AE | R=no; t=AE | R=no; t=AE | R=no; t=AE |
| 13 TYPE varchar(20) → text | R=no; t=AE (+toast locks) | R=no; t=AE (+toast locks) | R=no; t=AE (+toast locks) | R=no; t=AE (+toast locks) | R=no; t=AE (+toast locks) | R=no; t=AE (+toast locks) |
| 13 TYPE text → varchar(10) | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp | R=yes; t=AE+S; t_pkey=AE; +tmp |
| 13 TYPE numeric(10,2) → numeric(12,2) | R=no; t=AE | R=no; t=AE | R=no; t=AE | R=no; t=AE | R=no; t=AE | R=no; t=AE |
| 14 RENAME COLUMN locks | t=AE | t=AE | t=AE | t=AE | t=AE | t=AE |
| 14 DROP COLUMN locks | t=AE | t=AE | t=AE | t=AE | t=AE | t=AE |
| 14 DROP INDEX non-concurrent locks | t=AE; dropped index=AE (numeric OID in raw log) | t=AE; dropped index=AE (numeric OID in raw log) | t=AE; dropped index=AE (numeric OID in raw log) | t=AE; dropped index=AE (numeric OID in raw log) | t=AE; dropped index=AE (numeric OID in raw log) | t=AE; dropped index=AE (numeric OID in raw log) |
| 14 DROP INDEX CONCURRENTLY inside BEGIN | ERR E-DROPIDX-TX | ERR E-DROPIDX-TX | ERR E-DROPIDX-TX | ERR E-DROPIDX-TX | ERR E-DROPIDX-TX | ERR E-DROPIDX-TX |
| 15 ATTACH PARTITION locks | parent p=SUE; partition pchild=AE | parent p=SUE; partition pchild=AE | parent p=SUE; partition pchild=AE | parent p=SUE; partition pchild=AE | parent p=SUE; partition pchild=AE | parent p=SUE; partition pchild=AE |
| 15 DETACH PARTITION CONCURRENTLY inside BEGIN | n/a (pre-PG14) | n/a (pre-PG14) | ERR E-DETACH-TX | ERR E-DETACH-TX | ERR E-DETACH-TX | ERR E-DETACH-TX |
| 16 REINDEX TABLE CONCURRENTLY inside BEGIN | ERR E-REINDEX-TX | ERR E-REINDEX-TX | ERR E-REINDEX-TX | ERR E-REINDEX-TX | ERR E-REINDEX-TX | ERR E-REINDEX-TX |
| 16 REINDEX TABLE non-concurrent locks | t=S; idx_t_a=AE; t_pkey=AE | t=S; idx_t_a=AE; t_pkey=AE | t=S; idx_t_a=AE; t_pkey=AE | t=S; idx_t_a=AE; t_pkey=AE | t=S; idx_t_a=AE; t_pkey=AE | t=S; idx_t_a=AE; t_pkey=AE |
| 17 lock queue: A holds SELECT, B ALTER waits, C SELECT | n/a | n/a | n/a | n/a | plain: B waited then completed in 9012 ms; C blocked behind B and hit statement timeout in 2063 ms<br>with lock_timeout=1s: B failed fast in 1065 ms; C returned count in 999 ms | n/a |
| 18 reltuples of fresh never-analyzed 1000-row table | 0 | 0 | -1 | -1 | -1 | -1 |

### Exact error/debug text key for Part A

- **E-NN12** — `ERROR: column "c" contains null values` (PG12 wording).
- **E-NN** — `ERROR: column "c" of relation "t" contains null values` (PG13 and newer wording).
- **E-FK-PART** — `ERROR: cannot add NOT VALID foreign key on partitioned table "p" referencing relation "plain_parent"`.
- **E-CIC-TX** — `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`.
- **E-CIC-PART** — `ERROR: cannot create index on partitioned table "p" concurrently`.
- **E-CUIC** — `ERROR: could not create unique index "idx_invalid"` with `DETAIL: Key (a)=(1) is duplicated.`
- Retry notice — `NOTICE: relation "idx_invalid" already exists, skipping` (followed by a `CREATE INDEX` command tag even though no index was rebuilt).
- **E-ENUM-USE** — `ERROR: unsafe use of new value "x" of enum type e` with `HINT: New enum values must be committed before they can be used.`
- **E-ENUM-DROP-SYN** — `ERROR: syntax error at or near "VALUE"` at `ALTER TYPE e DROP VALUE 'x';`.
- **E-ENUM-DROP-NOTIMPL** — `ERROR: dropping an enum value is not implemented` at the same statement; this runtime error replaced the parse error in PG17.
- **E-DROPIDX-TX** — `ERROR: DROP INDEX CONCURRENTLY cannot run inside a transaction block`.
- **E-DETACH-TX** — `ERROR: ALTER TABLE ... DETACH CONCURRENTLY cannot run inside a transaction block`.
- **E-REINDEX-TX** — `ERROR: REINDEX CONCURRENTLY cannot run inside a transaction block`.
- SET NOT NULL baseline debug: `DEBUG: verifying table "t"`. After the validated CHECK, all versions emitted `DEBUG: existing constraints on column ... are sufficient to prove that it does not contain nulls`; PG12 formats the column as `"t"."a"`, while PG13+ format it as `"t.a"`.
- Lock-queue exact errors: B with `lock_timeout` emitted `ERROR: canceling statement due to lock timeout`; plain C emitted `ERROR: canceling statement due to statement timeout`.

## Part B — engine probes

`draft.gates` matched `inspect.findings` by kind/note/statement/target, and `draft.uncovered` exactly matched `inspect.uncovered`, for every case a–n. No case raised a parse or runtime error in either entry point. Therefore the table shows the inspect arrays. The only consistent draft-only addition is shown in the last column.

- **SP** — `Snapshot lookup uses public for unqualified relations. Verify that matches the migration runner search_path or schema-qualify the migration in this review.`
- **NS** — `No database snapshot supplied. Operational evidence is unknown.`

| Case | SQL | inspect findings (kind — note) | inspect uncovered | inspect notices | draft-only delta |
| --- | --- | --- | --- | --- | --- |
| a | `ALTER TABLE t ADD COLUMN c bigserial;` | ∅ | ∅ | SP | NS |
| b | `ALTER TABLE t ADD COLUMN c float8 DEFAULT random();` | ∅ | Statement 1: ADD COLUMN has additional constraints or defaults outside the rules. | SP | NS |
| c | `SET lock_timeout = '5s'; ALTER TABLE t ADD COLUMN z int;` | ∅ | Statement 1: Session setting other than search_path; verify it with the runner. | SP | NS |
| d | `BEGIN; ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 0; UPDATE t SET a = 1; CREATE INDEX ON t(a); COMMIT;` | s2 required — Literal non-null DEFAULT: PostgreSQL 11+ can add the column without a table rewrite for this default. Still review locking and compatibility.<br>s3 backfill — No restrictive WHERE clause in the update.<br>s4 index — CONCURRENTLY is not requested; review blocked writes with the database owner. | Statement 2: ADD COLUMN has additional constraints or defaults outside the rules. | SP | NS |
| e | `CREATE TABLE n(id int); CREATE INDEX ON n(id); ALTER TABLE n ADD COLUMN x int NOT NULL;` | s2 index — CONCURRENTLY is not requested; review blocked writes with the database owner.<br>s3 required — No non-null default is supplied. Adding this NOT NULL column fails if the table has existing rows. | Statement 1: Review new table constraints and dependencies separately. | SP | NS |
| f | `ALTER TABLE t ALTER COLUMN v TYPE varchar(200);` | s1 type — (empty note) | ∅ | SP | NS |
| g | `DROP INDEX i;` | s1 drop — Review the affected object and dependent objects separately. | ∅ | ∅ | NS |
| h | `ALTER TABLE t ADD CONSTRAINT ck CHECK (a IS NOT NULL) NOT VALID; ALTER TABLE t VALIDATE CONSTRAINT ck; ALTER TABLE t ALTER COLUMN a SET NOT NULL;` | s3 required — (empty note) | Statement 1: AT_AddConstraint is outside the rules; review manually.<br>Statement 2: AT_ValidateConstraint is outside the rules; review manually. | SP | NS |
| i | `CREATE INDEX CONCURRENTLY IF NOT EXISTS i ON t(a);` | s1 index — CONCURRENTLY is requested; confirm the runner does not wrap it in a transaction. | ∅ | SP | NS |
| j | `ALTER TABLE t ADD COLUMN c int NOT NULL DEFAULT 5;` | s1 required — Literal non-null DEFAULT: PostgreSQL 11+ can add the column without a table rewrite for this default. Still review locking and compatibility. | Statement 1: ADD COLUMN has additional constraints or defaults outside the rules. | SP | NS |
| k | `ALTER TYPE e ADD VALUE 'x';` | s1 enum — (empty note) | ∅ | ∅ | NS |
| l | `ALTER TABLE t ADD COLUMN c uuid NOT NULL DEFAULT uuid_generate_v4();` | s1 required — DEFAULT is an expression. Verify its volatility and rewrite behavior with the database owner before rollout. | Statement 1: ADD COLUMN has additional constraints or defaults outside the rules. | SP | NS |
| m | `ALTER TABLE t ADD PRIMARY KEY (a);` | s1 index — This constraint can build an index unless it uses an existing one. | ∅ | SP | NS |
| n | `ALTER TABLE t ADD CONSTRAINT u UNIQUE USING INDEX t_a_idx;` | s1 index — This constraint can build an index unless it uses an existing one. | ∅ | SP | NS |

## Notable cross-version behavior

- `DEFAULT now()` behaved like the literal-default fast path here: no relfilenode rewrite in any tested version. `random()` and `bigserial`/`nextval` did rewrite.
- PG18 accepted `NOT VALID` for a foreign key on a partitioned child referencing a plain parent; PG12–PG17 rejected it with E-FK-PART.
- PG17 changed `ALTER TYPE ... DROP VALUE` from a syntax error at `VALUE` to the explicit runtime error `dropping an enum value is not implemented`; neither form drops a value.
- `reltuples` for the fresh never-analyzed 1000-row table was `0` on PG12/13 and `-1` on PG14+.
- In the PG17 lock queue probe, the plain AccessShare SELECT did wait behind the already queued AccessExclusive ALTER and timed out; with `lock_timeout=1s` on B, B failed fast and C then returned before its own 2s statement timeout. Elapsed times are outer wall-clock measurements including docker/psql startup.
- Engine coverage visible in Part B: standalone `bigserial` produced no finding; nullable `random()` default and `lock_timeout` were manual-review-only; the validated-CHECK sequence did not inform the later SET NOT NULL finding; `CREATE INDEX CONCURRENTLY IF NOT EXISTS` received only the generic concurrent-index note despite the verified invalid-index no-op hazard.
