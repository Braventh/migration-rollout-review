# UX · Rollout Desk

A single review worksheet, not a dashboard. The notebook sidebar is only for local reviews; the main column follows the release sequence. A dark editor establishes the SQL as the source of truth. Warm paper, ink, teal accents, amber flagging, system sans and monospace evidence, spacing in 4/8 px steps; use contrast and labels rather than color alone.

1. **Migration**: title and SQL, then a focused inspect action. New review has example input and an empty history message, never a fake saved entry.
2. **Context**: detected relations, bounded read-only query, copy action, JSON paste and preview. Mark facts unknown, stale, or estimated rather than guessing. Human inputs cover actors, order, recovery and evidence.
3. **Review**: show pattern order, required proof, pause condition, and editable team decision. Save in explicit action; export only persisted decisions. Show inline request errors and status announcements. Retain typed input on errors.
4. **Responsive**: form and sidebar stack, query scrolls inside its block, actions wrap. Visible focus, explicit labels, semantic controls, status and error live regions.

Prebuild critique against the brief: snapshot copying isn't the product by itself; it has to be scoped from pasted SQL and visibly influence the review. Don't imply missing actor information came from Postgres. Don't use color-only severity or block review if a snapshot can't be collected. This was a self-review, not an independent UX review. After implementation, independent accessibility/layout and first-time developer audits led to [changes in PR #2](https://github.com/Braventh/migration-rollout-review/pull/2). See the [release screenshots](RELEASE_REPORT.md#deliverables) for the resulting local workflow.
