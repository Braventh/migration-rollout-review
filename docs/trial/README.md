# User trial package

Status: **Prepared, not run: no external user has tested Rollout Desk yet.** Demand is unproven. This package is a practical plan for a first small user trial; it is not validation evidence, and nothing in the outreach file has been sent or approved.

## Contents

| File | Purpose |
| --- | --- |
| [DEMO.md](DEMO.md) | Instructions an outside tester can follow locally, plus the maintainer-run fresh-clone verification evidence. |
| [PROTOCOL.md](PROTOCOL.md) | Pre-registered 30–45 minute moderated/async session design, consent wording, counterbalancing, timing, scoring rules, and decision threshold. |
| [QUESTIONNAIRE.md](QUESTIONNAIRE.md) | Exact post-task and end-of-session questions. |
| [RESULTS_TEMPLATE.csv](RESULTS_TEMPLATE.csv) | Header for one row per tester × scenario, including timing, issue detection, false alarms, actionability, trust, and preference. |
| [OUTREACH.md](OUTREACH.md) | Draft-only outreach package: tester profile, channel rules checked from sources, ranked channels, message drafts, target, and timeline. Nothing is approved or sent. |
| [scenarios/](scenarios/) | Four short synthetic PostgreSQL migrations modeled on common real patterns. They contain no production data. |
| [scenarios/ANSWER_KEY.md](scenarios/ANSWER_KEY.md) | **Facilitator only.** Hidden scoring key, PostgreSQL documentation basis, empirical PostgreSQL 17 verification, and Rollout Desk's current baseline behavior. |

## How results feed the final decision

1. Before inviting anyone, the owner decides the repository license question and approves the exact channels/message text. See [OUTREACH.md](OUTREACH.md).
2. The facilitator runs at least five valid sessions using [PROTOCOL.md](PROTOCOL.md), scores notes against the hidden answer key, and fills one row per tester × scenario in a copy of `RESULTS_TEMPLATE.csv` using only pseudonymous tester IDs.
3. Results are analyzed only by the pre-registered rules in the protocol. Missing data is reported, not filled in. Qualitative friction is grouped separately from numeric scores.
4. The decision threshold produces a **positive**, **negative**, or **mixed/inconclusive** signal for the next step only. A positive result means run a larger iteration/pilot and fix measured friction; it does not prove market demand or justify a public launch by itself. A negative result means stop recruiting and rework or abandon the current concept. Mixed/inconclusive means inspect the evidence and choose a narrower follow-up before spending more outreach effort.
5. The final product decision should combine these results with owner cost, licensing/hosting constraints, maintenance burden, and whether testers would change their real workflow—not with vanity metrics or post engagement.
