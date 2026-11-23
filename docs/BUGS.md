# Bugs and known limits

| Priority | Finding | State |
|---|---|---|
| High | Sequence-backed or stored generated additions could silently rewrite populated tables. | Fixed: separate rewrite gates with isolated PostgreSQL evidence and conditional wording; production cost remains unknown. |
| High | No lock queue or cross-statement lock guidance. | Fixed for selected strong-lock statements and explicit transactions followed by recognized work. Actual runner batching, savepoints, and unmodeled locks require manual confirmation. |
| Medium | Validation and removal appeared only as generic manual review. | Fixed: separate staged constraint guidance; constraint identity, target version and whether a validation will scan still depend on schema state. |
| Medium | Pasted SQL findings could look like known forward execution; new-table builds could look like existing-writer risks. | Mitigated: execution remains explicitly unknown, possible directives get a warning, and simple new-table patterns get conditional framing. No runner or template interpreter. |
| Known | PostgreSQL audit gaps outside the targeted changes. | Type rewrites vs metadata-only conversions, partitioned FK version compatibility, PG ≤13 zero row estimates and multi-statement lock coverage are not fully modeled. Six original raw corpus parse failures remain. |
| High | Treating complex SELECT as a control could miss modifying CTEs or function effects. | Fixed: only plain literal SELECT or comments qualify as a control; regression checked. |
| High | Snapshot results for other tables could mislead a reviewer. | Fixed: known version and strict scoped relation/metric validation; mark missing or stale evidence. |
| Medium | PostgreSQL greatest(0, NULL) can yield 0, making an unknown standby replay age look measured. | Fixed: explicit NULL guard; isolated primary checked, standby not exercised. |
| Low | Browser executable on this box isn't in Playwright's Chrome install path; Fetch normalized the spoofed Host used by a test. | Fixed: configurable Chromium executable and raw Node HTTP test for boundary headers. |
| Low | Fullwidth plus glyph rendered as a missing-glyph square. | Fixed: use ASCII plus. |
| Known | Rule coverage is deliberately narrow; dynamic SQL, many ALTER subcommands, CTE bodies, complex data movement and extension-specific behavior require manual verification or lint. | Documented. |
| Known | Snapshot scope is limited to 12 relations; a capture may omit objects, partition children, privilege-hidden activity, and health of other DB nodes. | Documented and flagged where detectable. |
| High | Stale tabs overwrote saved decisions and could export a different revision. | Fixed: atomic revision check and revision-bound worksheet exports. |
| High | Explicit migration search path was ignored; destructive SQL could appear ungated. | Fixed: scope unambiguous paths, exclude ambiguous names, gate TRUNCATE/DELETE/DROP and warn on CASCADE. Schema/TYPE/INDEX dependents still need manual review. |
| High | Partitioned parents and required columns received generic advice. | Fixed: snapshot-based partitioned CIC incompatibility and distinct no-default, literal and known volatile default advice. |
| Medium | Procedural bodies, concurrent operations, same-transaction enum use and CTE deletes were missed. | Fixed: mark opaque bodies, check explicit transaction order, warn on matching enum literals and capture CTE delete targets. |
| Medium | Hosted identity was not separated by user. | No trustworthy forwarded identity verified; the authenticated hosted workspace deliberately shares its library and discloses this. |
| Medium | Markdown HTML, narrow-layout overflow, disconnected field errors, and light borders. | Fixed: escape HTML, wrap long text, attach field errors with focus/ARIA and darken borders. Reopen restores focus and decision names are distinct. |
| Medium | Total request size, unsaved navigation, missing old reviews, and lost synthetic labels. | Fixed: byte budget, discard confirmation, cursor pagination and persistent synthetic evidence labels. |
| Low | Impossible dates, malformed context types, busy SQLite, and mobile library crowding. | Fixed: calendar/shape validation, retryable 503, and collapsed mobile library. |
| Known | No per-user ownership, collaborative signoff, per-review deletion, or revision history. | Outside MVP. |
