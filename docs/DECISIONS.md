# Decisions

- Owner-directed, demand unproven: build local MVP instead of treating completed-checklist parity as demand.
- Automate only affected-table operational evidence; explicitly solicit external actors, flags, recovery and release criteria.
- Use real PostgreSQL grammar for routing; assume no hidden compatibility, exact counts, blanket safe claims or full lint coverage.
- Keep fixed catalog SQL read-only, scoped and data-free; no connections or credentials in app.
- Use loopback Node and SQLite to keep setup local and repeatable; Markdown travels, the database does not.
- Use the owner-approved private Devin App for free browser access; no public deploy, spending, or new accounts.
- Keep one shared team library in the hosted app. Devin Apps documentation describes sign-in and organization sharing but no trusted forwarded caller identity was established. The app does not infer identity or enforce individual ownership; everyone who can open the App can read and edit reviews. Disclose that in hosted mode.
- Protect acknowledged saves with optimistic concurrency and require the opened revision for worksheet exports. Warn before discarding unsaved worksheet changes.
