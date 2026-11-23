# Real-world PostgreSQL migration corpus

This corpus contains **60 verbatim SQL migration files from 10 public GitHub projects**. It is a set of inputs for future Rollout Desk evaluation, not a runnable migration chain or a report on the engine. **Do not execute the corpus against a database.** Files may require prior migrations, upstream runner processing, extension placeholders, or extensions. Goose files retain both directions; some Storage files retain directives that mark them as ignored by the pinned runner.

## Provenance and selection

We sampled shipped application, internal catalog, and extension upgrades across six migration approaches: project-specific migrators, Goose, Prisma Migrate, postgres-migrations, Temporal's SQL tool, and PostgreSQL extension upgrades. We chose examples to cover the requested operations in both small and multi-operation files, not to estimate how frequently those operations occur. No synthetic SQL, schema dump excerpts, application data exports, or ORM-to-SQL translations are included. Some upstream files contain Go namespace templates, migration-runner markers, or PL/pgSQL that constructs SQL; none were expanded or edited.

[manifest.json](manifest.json) records a stable corpus ID, local path, full source commit and GitHub permalink, upstream path, direct raw URL, license SPDX identifier, tool, SHA-256, descriptive tags, and a note for each file. Project entries link evidence for the PostgreSQL version context and the corresponding licenses. Version labels describe a schema track, project support or CI at the pin, or an upstream development environment; they do not establish the compatible range of an individual historical migration. Where no suitable version was recorded, the field is null.

| Project | Migration tool or format | PostgreSQL version context | Files |
| --- | --- | --- | ---: |
| Supabase Auth | Go Auth migration runner | 15 (development image) | 6 |
| Hasura GraphQL Engine | Source-catalog migrator | Not specified | 5 |
| OpenFGA | Goose | 14+ (pinned project support) | 6 |
| pg_partman | PostgreSQL extension upgrade | 14+ (pinned project prerequisite) | 3 |
| PGMQ | PostgreSQL extension upgrade | 15–18 (pinned project support) | 2 |
| River | River Go migrator / pgx v5 | 14–18 (pinned CI matrix) | 7 |
| Supabase Storage | postgres-migrations with Storage runner | 15 (development default) | 11 |
| Temporal | temporal-sql-tool | 12 (upstream v12 schema track) | 7 |
| Trigger.dev | Prisma Migrate | 17 (upstream Dockerfile) | 7 |
| Umami | Prisma Migrate | 15 (upstream Compose image) | 6 |

We screened the selected SQL for email addresses, credential-shaped assignments, embedded credentials, private keys, token-shaped strings, and inserted or imported row data. We reviewed the data-writing matches for their inputs. For example, `INSERT … SELECT` derives data from tables that would exist at runtime; those production rows are not present in the corpus. SQL identifiers such as `encrypted_password` name columns, not secrets. The copied licenses may contain public attribution contact information.

## Coverage

Tags are collector-assigned descriptions, not exhaustive operation inventories, expected analyzer findings, rollout safety judgments, or ground truth for Mission 2. Counts are per file, with overlap between tags. “Required columns” covers adding a required column or making an existing one required. “Type conversions” includes changing representation via a replacement column. “Transaction boundaries” covers explicit transactions, runner directives, and batch commits.

| Category | Tag | Files | Projects |
| --- | --- | ---: | ---: |
| ALTER TABLE | `alter-table` | 37 | 10 |
| Adding or enforcing required columns | `required-columns` | 7 | 4 |
| Defaults | `defaults` | 17 | 8 |
| Type conversions | `type-conversions` | 9 | 6 |
| Renames | `renames` | 7 | 5 |
| DROP operations | `drops` | 25 | 8 |
| Index creation | `index-creation` | 24 | 9 |
| CREATE INDEX CONCURRENTLY | `create-index-concurrently` | 3 | 3 |
| Foreign keys | `foreign-keys` | 10 | 7 |
| Constraints | `constraints` | 19 | 8 |
| NOT VALID | `not-valid` | 2 | 2 |
| VALIDATE CONSTRAINT | `validate-constraint` | 2 | 2 |
| Enum changes | `enum-changes` | 8 | 4 |
| Backfills | `backfills` | 9 | 6 |
| Partitioned tables | `partitioned-tables` | 6 | 3 |
| Data movement | `data-movement` | 8 | 7 |
| CTEs | `ctes` | 4 | 3 |
| Transaction boundaries | `transaction-boundaries` | 8 | 3 |
| Complex or unusual migrations | `complex` | 34 | 10 |

Staged constraint validation has the narrowest coverage: one Auth foreign-key migration and a pair of Storage check-constraint migrations. Concurrent index creation has one file per project across three projects; one of those files has a runner ignore directive. Two partition examples contain top-level range-partitioned table DDL; the rest operate through extension helpers. For explicit top-level `BEGIN`/`COMMIT`, all examples come from Trigger.dev; the other transaction-boundary examples use runner directives or procedural commits.

## Verify or restore

From the repository root with Node.js 24+, without installing dependencies:

```sh
node corpus/fetch.mjs              # offline: verify checked-in SQL and licenses
node corpus/fetch.mjs --upstream   # also fetch and verify the pinned upstream bytes
node corpus/fetch.mjs --restore    # also recreate any missing SQL and license files
```

The online modes require access to `raw.githubusercontent.com`. Restore writes only missing files, only after the downloaded digest matches, and never replaces a local file. To rebuild separately, copy `fetch.mjs` and `manifest.json` into an empty directory and run the copied script with `--restore`. Paths are relative to the script, not the shell's working directory. SHA-256 covers the original bytes (including whitespace and line endings); Git is configured not to normalize the vendored files. The script does not execute SQL.

Original licenses and attributions are in [THIRD_PARTY](THIRD_PARTY/README.md).
