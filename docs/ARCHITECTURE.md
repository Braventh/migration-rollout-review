# Architecture

Node 24, native HTTP and SQLite, a static browser UI, and the PostgreSQL WASM parser. Loopback only, no auth for this single-user tool. No runtime services or external calls. PostgreSQL SQL is parsed, never executed; the metadata query runs only in a user's own client. See README for file configuration.

- Server owns validation, syntax parsing, bounded catalog-query generation, risk routing, snapshot normalization and Markdown.
- JSON API: POST /api/inspect (SQL → affected relations, generated query and warnings); POST /api/draft (SQL + optional snapshot + human context → proposed plan); GET/POST /api/reviews, GET /api/reviews/:id, and GET /api/reviews/:id/markdown. Save replaces a review when passing its id.
- SQLite schema: reviews(id UUID primary key, title, updated_at, payload JSON text). Payload contains input, normalized evidence and draft decisions. Prepared statements; integrity of derived fields comes from server-side regeneration before save.
- Static assets only; no arbitrary paths. Loopback Host/exact Origin enforcement, no cross-origin JSON endpoints, body size limit, no raw HTML rendering, CSP, and Markdown inert text rendering where user content is quoted. Do not share raw SQL or sensitive scope without review. No application query logs.
- Unit tests for parser/rules, context and Markdown. HTTP integration tests use a real file and reopen the service; Playwright exercises a saved browser workflow. Local release is npm ci then npm start. No deployment authorized.
