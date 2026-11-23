# Test report · v0.1.0

The final handoff reran the unit/integration, Chrome and dependency checks on the product code from `b57b591` in an isolated worktree with an in-memory browser-test database. Earlier audit probes are identified below.

| Check | Observed outcome |
|---|---|
| `npm test` | 33 passed: 24 rule/unit and 9 HTTP/SQLite tests. Regressions include stale and missing revisions, revision-bound exports, legacy decisions, SQLite locks, impossible dates and invalid JSON field types. |
| `CHROMIUM_EXECUTABLE="$(command -v google-chrome)" CAPTURE_SCREENSHOTS=1 npm run test:e2e` | 7 passed (4.0s): core flow, synthetic evidence after reopen and export, scoped text and saved titles at 390px, field error focus and ARIA, distinct decision names, reload warning, total-byte budget, pagination and unchanged-SQL notes. |
| SQL audit replay | Replayed 53 complete SQL inputs through the app parser, not a live database. One original parse-rejection entry omitted its SQL. Unit assertions cover search-path scope, destructive statements, procedural review, partitioned indexes, concurrent transaction restrictions, enum reuse, CTE deletes and required-column defaults. |
| Form field contrast and visual verification | White against the field boundary: 4.35:1 (audit calculation). Inspected fresh desktop captures of the migration worksheet, capture/JSON context and saved decision/export. Mobile overflow and focus were checked in Playwright. |
| DEV-03 evidence bundle replay | All nine supplied SQL fixtures routed to their expected category; fixture 10 produced only a control. No fixture migration was executed. |
| Isolated PostgreSQL 17.12 capture | Generated query ran on a local throwaway DB containing a two-row `billing.invoices` with one index. Pasted output normalized to primary, 24576 bytes, two estimated rows, one index, zero invalid and no standby age. Not tested on a standby or production. |
| `npm audit` | Found 0 vulnerabilities according to the registry at check time. |
| Local bounded-input spot timing | 47,004 characters, 100 findings, 39.8 ms cold parser wall time on this box. Not a performance SLA or concurrent load test. |
| Independent reliability/performance audit (pre-fix) | At 48,000 characters: ~10.5 ms inspect and 13.2 ms draft median across 20 sequential loopback calls; at 1,002 stored reviews: ~1.0 ms list median, ~1.1 ms p95. The audit also probed interrupted writes, restart recovery, request limits and large-review memory. Historical spot measurements, not post-fix benchmarks or a production SLA. |

### Audits

Checked exact-host and origin restrictions, cross-site headers, request and statement limits, JSON type/shape, mismatched snapshot scope, editor and library rendering, and inert Markdown export. Checked SQL uses read-only transaction, timeouts, fixed catalog path and encoded target names; no migration path executes SQL. Probed misleading controls, mixed transaction/index evidence, and unknown/stale operational inputs; see [BUGS](BUGS.md). Visually inspected [01 migration](screenshots/01-migration.png), [02 context](screenshots/02-context.png) and [03 saved review](screenshots/03-saved-review.png).

Five independent audits covered SQL parsing, security, accessibility/layout, reliability/performance/docs and first-time developer experience. Fixes were merged in [PR #2](https://github.com/Braventh/migration-rollout-review/pull/2); see [BUGS](BUGS.md). Devin Apps documentation establishes sign-in and organization sharing, not a trustworthy forwarded caller identity. The existing private host and its database were not changed or reverified in this handoff. No screen-reader check, real-team workflow, PostgreSQL standby, alternate browser/OS or sustained load test was run. No released-market demand claim.
