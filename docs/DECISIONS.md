# Decisions

- Owner-directed, demand unproven: build local MVP instead of treating completed-checklist parity as demand.
- Automate only affected-table operational evidence; explicitly solicit external actors, flags, recovery and release criteria.
- Use real PostgreSQL grammar for routing; assume no hidden compatibility, exact counts, blanket safe claims or full lint coverage.
- Keep fixed catalog SQL read-only, scoped and data-free; no connections or credentials in app.
- Use loopback Node and SQLite to keep setup local and repeatable; Markdown travels, the database does not.
- Respect no public deploy, spending, or new accounts.
