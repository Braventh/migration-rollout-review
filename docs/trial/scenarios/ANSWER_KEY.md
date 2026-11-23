# Facilitator answer key — do not share with testers

Status: prepared baseline. No external tester has run these scenarios. All four SQL files are synthetic, but each is modeled on common real PostgreSQL migration patterns. They contain no production schema or data.

## Documentation and version basis

Unless stated otherwise, claims below cite the PostgreSQL 17 documentation and were empirically checked only on PostgreSQL 17.12. Exact lock and rewrite behavior is version-dependent; verify the target database version before using this key in a real review.

- [PostgreSQL 17 `ALTER TABLE`](https://www.postgresql.org/docs/17/sql-altertable.html): `ACCESS EXCLUSIVE` is the default lock unless a subform says otherwise; a volatile `DEFAULT` or a type change rewrites the table and indexes unless the documented binary-coercion exception applies; adding `CHECK`/`NOT NULL` scans without rewriting; valid foreign-key/CHECK validation can lock out updates; `NOT VALID` skips the scan and `VALIDATE CONSTRAINT` uses weaker locks; adding a foreign key uses `SHARE ROW EXCLUSIVE` on both child and referenced table.
- [PostgreSQL 17 `CREATE INDEX`](https://www.postgresql.org/docs/17/sql-createindex.html): a standard build locks writes but not reads; `CONCURRENTLY` avoids locks that prevent concurrent writes but does two scans, takes longer, imposes I/O/CPU, can leave an invalid index after failure, cannot run inside a transaction block, and is not supported on a partitioned parent in PostgreSQL 17.
- [PostgreSQL 17 explicit locking](https://www.postgresql.org/docs/17/explicit-locking.html): `INSERT`/`UPDATE`/`DELETE`/`MERGE` take `ROW EXCLUSIVE`; that mode conflicts with `SHARE`, `SHARE ROW EXCLUSIVE`, `EXCLUSIVE`, and `ACCESS EXCLUSIVE`; `ACCESS EXCLUSIVE` conflicts with every lock mode.
- [PostgreSQL 11 release notes](https://www.postgresql.org/docs/11/release-11.html): avoiding a table rewrite for `ALTER TABLE ... ADD COLUMN` with a constant non-null default was introduced in PostgreSQL 11. Do not apply that optimization to PostgreSQL 10 or earlier.

Documentation pages were read on 2026-11-23.

## Empirical verification record

Environment: local Docker image `postgres:17`, digest `sha256:223efeb196329b55b3b9a13db144956411dbc18e727e59f681c3e0aede6475cf`; server `PostgreSQL 17.12 (Debian 17.12-1.pgdg13+1)`. Docker Hub initially returned HTTP 429, so the same digest was pulled through `mirror.gcr.io/library/postgres:17` and tagged locally as `postgres:17`.

Method: DDL was run inside rollback transactions. Table rewrite was inferred from `pg_relation_filenode` before/after each statement; lock modes were read from `pg_locks` in the same backend transaction. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction, so its lock was sampled from a second connection while building an index over 500,000 rows.

Key output rows (relfilenode values are run-specific; only whether the before/after value changed matters):

| Check | Observed PostgreSQL 17.12 output | Interpretation |
| --- | --- | --- |
| `gen_random_uuid()` catalog volatility | `provolatile=v` | volatile in this PostgreSQL build |
| volatile default `ADD COLUMN batch_id uuid NOT NULL DEFAULT gen_random_uuid()` | relfilenode `16389 → 16405`; locks `AccessExclusiveLock`, `ShareLock` | table storage rewritten; strongest lock blocks all access |
| constant default `ADD COLUMN fixed_status text NOT NULL DEFAULT 'legacy'` | relfilenode `16389 → 16389`; lock `AccessExclusiveLock` | PostgreSQL 17 metadata-only default optimization, but still a blocking lock while held |
| nullable no-default `ADD COLUMN delivery_metadata jsonb` | relfilenode `16389 → 16389`; lock `AccessExclusiveLock` | no rewrite; brief metadata lock is still important |
| type `integer → numeric(12,4)` | relfilenode `16394 → 16414`; locks `AccessExclusiveLock`, `ShareLock` | rewrite confirmed for the scenario conversion |
| exploratory type `integer → bigint` | relfilenode `16394 → 16418` | also rewrote in PostgreSQL 17.12; do not assume widening integer is rewrite-free |
| column rename | relfilenode unchanged; lock `AccessExclusiveLock` | metadata-only, but blocks reads/writes while waiting/held |
| column drop | relfilenode unchanged; lock `AccessExclusiveLock` | no immediate rewrite/reclamation, but blocks reads/writes while waiting/held |
| plain `CREATE INDEX` | lock `ShareLock` on table | consistent with documented write blocking but read allowance |
| valid foreign-key add | child `AccessShareLock` + `ShareRowExclusiveLock`; parent `AccessShareLock` + `RowShareLock` + `ShareRowExclusiveLock` | scan happens while write-incompatible locks are held |
| valid CHECK add | child `AccessExclusiveLock` | CHECK validation uses stronger table lock in PostgreSQL 17 |
| `FOREIGN KEY ... NOT VALID` add | child `AccessShareLock` + `ShareRowExclusiveLock`; parent `AccessShareLock` + `ShareRowExclusiveLock`; unlike the validated FK, no parent `RowShareLock` was observed | `NOT VALID` skips the scan; it does not remove all locking |
| `CHECK ... NOT VALID` add | child `AccessExclusiveLock` | skip scan, but PostgreSQL 17 still takes the strong lock briefly |
| `VALIDATE CONSTRAINT` foreign key | child `AccessShareLock` + `ShareUpdateExclusiveLock`; parent `AccessShareLock` + `RowShareLock` | matches documented lower-impact validation |
| `VALIDATE CONSTRAINT` CHECK | child `ShareUpdateExclusiveLock` | matches documented lower-impact validation |
| `CREATE INDEX CONCURRENTLY` on 500k-row table | `ShareUpdateExclusiveLock` observed in two samples; builder exit 0 | matches documented non-write-blocking behavior |

These outputs support the hidden key; they are not a benchmark and do not measure duration on a production-sized table.

## Scoring conventions

Each `K` item is worth 1 point. “Critical” means the item is central to the scenario’s hazard/calibration for the `critical_items_*` columns. Secondary observations can be recorded as novel findings but do not change the denominator. Award partial credit only as defined in [`PROTOCOL.md`](../PROTOCOL.md).

In the scoring tables, bracketed citations identify the PostgreSQL documentation supporting the database facts. Application rollout consequences that PostgreSQL cannot know are labeled as inferences from the scenario's stipulated context.

## S1 — `01-volatile-default-index.sql`

| ID | Expected answer-key catch | Severity |
| --- | --- | --- |
| S1-K1 | `gen_random_uuid()` is volatile, so adding this `NOT NULL` column rewrites the existing large table and indexes in PostgreSQL 17. It requires an `ACCESS EXCLUSIVE` lock and can need substantial time/disk. Prefer splitting the change: add nullable/metadata-only column, backfill in bounded batches, then enforce/default after writers are ready. ([PG17 ALTER][pg17-alter]; [PG17 locks][pg17-locking]; constant-default contrast introduced in [PG11 release notes][pg11-release]) | critical |
| S1-K2 | The plain `CREATE INDEX` blocks writes (though not reads) until the build completes. On a large high-traffic table use `CREATE INDEX CONCURRENTLY` outside any transaction, monitor load, and verify the index finishes valid. ([PG17 CREATE INDEX][pg17-index]; [PG17 locks][pg17-locking]) | critical |
| S1-K3 | The rollout needs operational evidence and controls: representative table size/activity, lock/statement timeout or retry policy, deploy ordering, disk headroom, and a pause/rollback owner. “Run it and hope” is not acceptable merely because each statement is short. The lock/rewrite premises are documented in [PG17 ALTER][pg17-alter] and [PG17 CREATE INDEX][pg17-index]; owner/pause controls are trial inference rather than a PostgreSQL guarantee. | critical |

Valid extra observations: random UUID index locality/write amplification; `gen_random_uuid` availability depends on PostgreSQL version/extension context; index necessity/selectivity should be justified. Do not penalize testers for omitting these extras.

Rollout Desk baseline:

- **Flags:** `required` on statement 1 with the volatile-default/full-rewrite note; `index` on statement 2 with “CONCURRENTLY is not requested; review blocked writes with the database owner.”
- **Marks uncovered:** `Statement 1: ADD COLUMN has additional constraints or defaults outside the rules.`
- **Does not cover or does not establish:** exact lock modes, table size/activity without a snapshot, disk headroom, lock timeout/retry policy, random UUID index locality, or a complete staged rollout plan.
- Draft also reports `No database snapshot supplied. Operational evidence is unknown.` and all four context fields unanswered; that is expected in this no-snapshot trial, not a product failure by itself.

## S2 — `02-rename-drop-mixed-versions.sql`

| ID | Expected answer-key catch | Severity |
| --- | --- | --- |
| S2-K1 | Documentation-backed database fact: renaming `email` to `primary_email` changes the relation's column name when the DDL commits and uses `ACCESS EXCLUSIVE` ([PG17 ALTER][pg17-alter]; [PG17 locks][pg17-locking]). Inference from the stipulated mixed-version context: API v1 reads/writes that still reference `email` break immediately. Use expand/contract before contracting the old name. | critical |
| S2-K2 | Documentation-backed database fact: dropping `legacy_status` removes the column and dependent indexes/constraints from the visible table definition and uses `ACCESS EXCLUSIVE` ([PG17 ALTER][pg17-alter]; [PG17 locks][pg17-locking]). Inference from the stipulated mixed-version context: v1/jobs that still need it fail and rollback with the old contract is jeopardized. Drop only in a later release after retirement and the recovery window. | critical |
| S2-K3 | Rename/drop are metadata operations rather than immediate table rewrites in PostgreSQL 17, but both require `ACCESS EXCLUSIVE`; even a short operation can block all reads/writes behind lock wait. ([PG17 ALTER][pg17-alter]; [PG17 locks][pg17-locking]; empirical rows above) | important |

Valid extra observations: dependent views/foreign keys/application caches; need to inspect background jobs, ORM schema cache, replication consumers, and rollback versions. The SQL does not include `CASCADE`, so dependent objects will not silently cascade away.

Rollout Desk baseline:

- **Flags:** `rename` on statement 1; `drop` on statement 2.
- **Marks uncovered:** nothing.
- **Does not cover or does not establish:** actual app-version compatibility from SQL comments, ORM cache behavior, recovery window facts, exact lock modes, or the metadata-only/no-immediate-rewrite nuance. Its gates do give generic expand-first/keep-both-names and separate-destructive-step guidance.

## S3 — `03-constraints-type-rewrite.sql`

| ID | Expected answer-key catch | Severity |
| --- | --- | --- |
| S3-K1 | The foreign key without `NOT VALID` scans existing child rows immediately and blocks concurrent updates while the scan/alter commits. Add it `NOT VALID`, then `VALIDATE CONSTRAINT` separately; new writes are still enforced before validation. ([PG17 ALTER][pg17-alter]; [PG17 locks][pg17-locking]) | critical |
| S3-K2 | The CHECK without `NOT VALID` likewise scans the large table. In PostgreSQL 17 adding even a `NOT VALID` CHECK takes `ACCESS EXCLUSIVE` briefly, but skipping the scan and validating later at `SHARE UPDATE EXCLUSIVE` materially reduces write impact. ([PG17 ALTER][pg17-alter]; [PG17 locks][pg17-locking]; empirical rows above) | critical |
| S3-K3 | Changing `integer` to `numeric(12,4)` is not a safe metadata-only widening assumption: PostgreSQL 17.12 rewrote the table. Expect `ACCESS EXCLUSIVE`, time/disk cost, index rebuild concerns, removed statistics/need for `ANALYZE`, and a staged compatibility plan. ([PG17 ALTER][pg17-alter]; [PG17 locks][pg17-locking]; empirical rows above) | critical |

Valid extra observations: multiple subcommands in one `ALTER TABLE` use the strictest required lock; splitting statements/migrations improves control; validation can fail on legacy orphans/nonpositive quantities; the referenced parent also receives locks for the foreign key.

Rollout Desk baseline:

- **Flags:** `fk` on statement 1; `type` on statement 2.
- **Marks uncovered:** `Statement 1: AT_AddConstraint is outside the rules; review manually.` This corresponds to the CHECK constraint path. There is no distinct CHECK gate.
- **Does not cover or does not establish:** the absent `NOT VALID` scan/write-lockout sequence, exact validation lock modes, parent-table locking, empirical rewrite behavior, double disk use, or the need to split validation/type work. The generic type gate does not itself warn that this conversion rewrites.

## S4 — `04-low-risk-control.sql`

| ID | Expected answer-key catch | Severity |
| --- | --- | --- |
| S4-K1 | Adding nullable `delivery_metadata` with no default is metadata-only in PostgreSQL 17 (no table rewrite), though it still takes a brief `ACCESS EXCLUSIVE` lock. This should not be treated as a data migration by itself. ([PG17 ALTER][pg17-alter]; [PG17 locks][pg17-locking]; empirical rows above) | critical |
| S4-K2 | `CREATE INDEX CONCURRENTLY` is the appropriate lower-impact shape and the file contains no explicit transaction block. The key remaining action is to verify the real migration runner does not wrap it in a transaction. ([PG17 CREATE INDEX][pg17-index]) | critical |
| S4-K3 | Low risk is not zero risk: concurrent build takes longer/two scans, adds CPU/I/O load, waits for old transactions, and can leave an invalid index if interrupted. Monitor completion/validity rather than treating either “blocking DDL” or “safe forever” as automatic. ([PG17 CREATE INDEX][pg17-index]) | important |

A good tester should not invent a severe application-compatibility problem here. The appropriate output is bounded verification, not alarm.

Rollout Desk baseline:

- **Flags:** only `index` on statement 2, with “CONCURRENTLY is requested; confirm the runner does not wrap it in a transaction.”
- **Marks uncovered:** nothing.
- **Does not cover or does not establish:** it does not affirmatively explain that the nullable no-default column is metadata-only, nor does it mention two-scan cost, load, waiting on old transactions, or invalid-index cleanup. Because one gate exists, `control` is false; this is a calibration cue, not automatically a false alarm.

## Engine summary table

| Scenario | Engine flags | Engine marks uncovered | Material baseline misses/limits |
| --- | --- | --- | --- |
| S1 | volatile `required`; nonconcurrent `index` | `Statement 1: ADD COLUMN has additional constraints or defaults outside the rules.` | lock modes, table evidence, disk/timeout/retry, staged rollout detail |
| S2 | `rename`; `drop` | none | version facts, rollback/recovery evidence, exact lock/rewrite nuance |
| S3 | `fk`; `type` | `Statement 1: AT_AddConstraint is outside the rules; review manually.` | no distinct CHECK gate; no explicit NOT VALID/scan/lock or rewrite warning |
| S4 | concurrent `index` only | none | nullable-add reassurance, two-scan/load/invalid-index details |

[pg17-alter]: https://www.postgresql.org/docs/17/sql-altertable.html
[pg17-index]: https://www.postgresql.org/docs/17/sql-createindex.html
[pg17-locking]: https://www.postgresql.org/docs/17/explicit-locking.html
[pg11-release]: https://www.postgresql.org/docs/11/release-11.html
