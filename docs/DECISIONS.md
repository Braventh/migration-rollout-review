# Decisions

- Owner-directed, demand unproven: build local MVP instead of treating completed-checklist parity as demand.
- Automate only affected-table operational evidence; explicitly solicit external actors, flags, recovery and release criteria.
- Use real PostgreSQL grammar for routing; assume no hidden compatibility, exact counts, blanket safe claims or full lint coverage.
- Keep fixed catalog SQL read-only, scoped and data-free; no connections or credentials in app.
- Use loopback Node and SQLite to keep setup local and repeatable; Markdown travels, the database does not.
- Use the owner-approved private Devin App for free browser access; no public deploy, spending, or new accounts.
- Keep one shared team library in the hosted app. Devin Apps documentation describes sign-in and organization sharing but no trusted forwarded caller identity was established. The app does not infer identity or enforce individual ownership; everyone who can open the App can read and edit reviews. Disclose that in hosted mode.
- Protect acknowledged saves with optimistic concurrency and require the opened revision for worksheet exports. Warn before discarding unsaved worksheet changes.
- Treat all gates as static inference about pasted SQL. Mark tested PostgreSQL mechanics as verified behavior, not the outcome of this rollout. Label estimated row counts heuristic, missing runtime facts unknown, and opaque or unsupported features manual review. The app still never executes submitted SQL.
- Leave Goose and other runner directives uninterpreted; highlight possible markers without removing SQL or assuming runner execution. Ask for rendered forward SQL and runner transaction boundaries. Explicit BEGIN/COMMIT can inform lock-window warnings, but neither a pasted timeout setting nor the absence of an explicit BEGIN proves runner behavior.
- Separate rewrites from nullability and indexes: serial/identity, stored generated columns and candidate volatile defaults can add material work. Use a lock acquisition budget and retry rehearsal, not a duration guess or safety guarantee.
- Separate constraint enforcement, historical validation, and removal. Standalone validation lock guidance is not a promise for multi-action ALTERs or runner-batched DDL. Only infer new-table index framing conservatively and leave conditional creates on the existing-target path.
- Keep the incumbent gate ID sequence for saved decisions. Add rewrite and constraint IDs in a separate ordinal space.
