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
| Known | Local history displays latest 100 reviews; no collaborative signoff, per-review deletion, or revision history. | Outside MVP. |
