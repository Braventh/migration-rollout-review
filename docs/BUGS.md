# Bugs and known limits

| Priority | Finding | State |
|---|---|---|
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
