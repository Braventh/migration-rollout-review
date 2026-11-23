# PRD · Rollout Desk

**Owner-directed, demand unproven.** Local web app for developers and small teams shipping PostgreSQL changes with overlapping API, worker, job, and recovery versions. The author gathers facts; a teammate reviews evidence and gates before shipping. Neither should mistake a parsed migration or sampled data for approval.

**Promise:** Turn the actual SQL plus one narrowly scoped metadata snapshot and a handful of author notes into an editable rollout plan. Use alongside free Squawk/pgfence or MergeBrake, not instead of them. Unlike repo-connected review, the app needs neither credentials nor repo access and includes operational facts from the target plus facts that may live outside the repo.

**Journey:** Paste SQL → generate a read-only catalog query → copy/run it yourself and paste its JSON or explicitly proceed without a snapshot → supply actors, recovery, etc. → generate a rule-based draft → edit/record decisions → save locally and reopen later → download a Markdown artifact for the PR. A clearly marked synthetic example lets a first-time user try without a database.

**MVP:** Parse PostgreSQL AST, extract affected relations and rollout patterns, surface applicability and uncovered statements, normalize/preview scoped snapshot, preserve timestamps and missing evidence, draft pattern-specific gates and allow owner notes, local SQLite list/open/save, Markdown download. No automatic approval, migration execution, auth/cloud, AI, direct PostgreSQL connection, production telemetry, or full SQL lint.

**Product acceptance:** Run without payment/account; support the nine DEV-03 patterns and no-op without inventing a rollout; analyze a bundle and show unknowns; preserve local work and export an actionable review; distinguish observed/estimated/manual/missing evidence.

**Roadmap:** First compare real redacted reviews with the team's completed checklist + lint/MergeBrake: total author and reviewer time, actionable missed gates, unsupported safety claims, second-use rate. Local sharing/export is the distribution experiment; public examples and commercialization require approval and evidence. Monetization is not planned for this MVP; only investigate governance if requested after repeat use.
