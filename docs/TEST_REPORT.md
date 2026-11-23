# Test report · v0.1.0

| Check | Observed outcome |
|---|---|
| `npm test` | 17 passed; 15 rule/unit and 2 HTTP tests, including a SQLite close/reopen. |
| `CHROMIUM_EXECUTABLE="$(command -v google-chrome)" CAPTURE_SCREENSHOTS=1 npm run test:e2e` | 2 passed: inspect, import, save/reopen/edit evidence and download; error recovery, unknown evidence, inert text and mobile width. |
| DEV-03 evidence bundle replay | All nine supplied SQL fixtures routed to their expected category; fixture 10 produced only a control. No fixture migration was executed. |
| Isolated PostgreSQL 17.12 capture | Generated query ran on a local throwaway DB containing a two-row `billing.invoices` with one index. Pasted output normalized to primary, 24576 bytes, two estimated rows, one index, zero invalid and no standby age. Not tested on a standby or production. |
| `npm audit` | Found 0 vulnerabilities according to the registry at check time. |
| Local bounded-input spot timing | 47,004 characters, 100 findings, 39.8 ms cold parser wall time on this box. Not a performance SLA or concurrent load test. |

### Self-audit (no independent external reviewer)

Checked exact-host and origin restrictions, cross-site headers, request and statement limits, JSON type/shape, mismatched snapshot scope, editor and library rendering, and inert Markdown export. Checked SQL uses read-only transaction, timeouts, fixed catalog path and encoded target names; no migration path executes SQL. Probed misleading controls, mixed transaction/index evidence, and unknown/stale operational inputs; see [BUGS](BUGS.md). Visually inspected [01 migration](screenshots/01-migration.png), [02 context](screenshots/02-context.png) and [03 saved review](screenshots/03-saved-review.png).

Not tested: real team workflow, accessibility with a screen reader, replica/partition topology beyond the documented caveats, alternate OS/browser compatibility, external security review or sustained concurrent load. No released-market demand claim.
