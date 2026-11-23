# Research

**Owner-directed, demand unproven.** [DEV-03 report](https://app.devin.ai/attachments/4dba5f36-94ee-406c-bba6-575255032468/VALIDATION-DEV-03.md) and [replay bundle](https://app.devin.ai/attachments/d1d5ccbf-6625-4bbe-87c3-313fa3fd6b6a/DEV-03-evidence.tar.gz) found 9 concretizations over an empty checklist, **zero** over a completed checklist, from ten synthetic fixtures. Python stdlib CLI templated Markdown from manually declared pattern, target, actor, gate, deploy, apps, data, rollback and owner; it didn't inspect SQL or collect facts. Effort (1 low / 3 medium / 6 high) reflected multiple source owners and repositories; it was not measured time. Release flags, generated clients, external writers, stalled jobs, retry horizons and eligible recovery images often held the gating facts. Postgres metadata can remove only the database-side lookup; human facts remain explicit.

| Pattern | Case-specific decision in the validation |
|---|---|
| Required | Hold enforcement and required reads pending connector/recovery readiness and region reconciliation. |
| Rename | Gate contract on import writes, reindex reads, concurrent edits and API rollback closure. |
| Drop | Retain column through weekly billing export migration and seven-day API rollback; check generated selections. |
| Index | Hold dashboard flag for valid index and representative plan meeting latency objective. |
| Enum | Replay persisted REFUNDED through worker/webhook and recovery before first emission. |
| Type | Decide legacy representability cap; test SDK JSON boundaries until rollback retires. |
| FK | Replay nightly importer and recovery before any enforcement, not just validation. |
| Backfill | Hold cutover until resumed job racing invoice edits reconciles stale non-null data. |
| Split | Retain old storage until job retry drain/replay and eligible recovery no longer need it. |

Baseline: enumerate affected actors and owners; draw both compatibility directions including recovery; stage expand → compatible writes → reconcile → switch → retire → contract; stage values and enforcement; prove backfill source/batching/retries/parity; verify locks/runner/rewrites and define pause thresholds; attach evidence, blockers, owner signoff and check the full bundle for no-op. [Squawk](https://squawkhq.com/docs/safe_migrations) and [pgfence](https://pgfence.com/) supply free lint/recipes and lock or runner signals; fixture replay found 8/10 and policy output on 10/10 respectively, not proof of safety. [MergeBrake](https://github.com/mergebrake/mergebrake) scans Prisma/app references and destructive PR sequencing; examined in docs, not executed in DEV-03.

[Round 2](https://app.devin.ai/attachments/9422bec8-972a-47fd-80b5-8506a75d3a10/ROUND-2-OPPORTUNITY-VALIDATION.md): weak baselines overstate value; synthetic checks aren't recurring real failures; polished outputs don't fix evidence collection; adjacent payment/channels aren't repeat usage or demand. Benchmark the strong free workflow, not the blank form.
