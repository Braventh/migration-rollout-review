# Rollout Desk

Review a PostgreSQL migration before it ships. Rollout Desk helps you collect scoped database evidence, draft decisions about mixed-version rollout, and export the team's review to a pull request. **Owner-directed, demand unproven.** A saved plan is not a deploy approval.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm start
```

Open **http://127.0.0.1:3000**. No Postgres server, credentials, paid service, account, or browser add-on is needed to try the example. Reviews persist in `data/reviews.sqlite` relative to where you start the app. Set `PORT` for a different local port or `REVIEW_DB` for a different database file. Stop the app before copying or deleting the database. The server listens on loopback only; do not expose it as a multi-user service.

## Try a review

1. Select **Load example** for a synthetic invoice migration, or paste your own title and PostgreSQL SQL.
2. Choose **Inspect SQL**. Optionally open the generated read-only capture query, copy it into a fresh approved PostgreSQL session under your read-only role (use `psql -Atq` for unformatted output), and paste the single JSON result. No app rows are selected. The app never runs SQL or connects to Postgres.
3. Add affected actors/jobs, deploy and flags, recovery and owner evidence. **Generate review**, then enter team decisions at applicable gates.
4. **Save review**, reopen it from the library, and **Download Markdown** to share. The export includes pasted migration SQL and team notes; redact before sharing.

Database counts are estimates; activity visibility depends on the DB role, and standby last-replay age is not lag. Catalog data doesn't show application compatibility, future runtime, or complete partition sizes. Unqualified tables are looked up in `public`; check your migration runner's search path. Keep using a dedicated linter for coverage beyond these rollout patterns.

## Test and inspect

```sh
npm test
npx playwright install chromium
npm run test:e2e
```

Set `CHROMIUM_EXECUTABLE` to use an existing compatible Chromium/Chrome binary. Set `CAPTURE_SCREENSHOTS=1` when running Playwright to regenerate the screenshots.

- [Migration worksheet](docs/screenshots/01-migration.png)
- [Capture query and context](docs/screenshots/02-context.png)
- [Saved review and export](docs/screenshots/03-saved-review.png)
- [Product](docs/PRD.md) · [Design](docs/UX.md) · [Architecture](docs/ARCHITECTURE.md) · [Test results and limits](docs/TEST_REPORT.md)
