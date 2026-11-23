# Trial protocol

Status: **pre-registered plan, not run and not proven.** Do not edit the scoring rules silently after the first tester. Any necessary change must be recorded as an amendment with date and reason before continuing recruitment.

## Purpose

Test whether Rollout Desk helps a PostgreSQL migration reviewer find operationally important rollout problems faster or more reliably than their existing workflow, whether its output is actionable without causing overtrust, and whether anyone would use it again. This is a small within-subject usability/validation study, not a statistically powered market test.

## Participants and screener

Target at least **five valid completed sessions**. Recruit people who currently review, write, approve, or operate production PostgreSQL migrations. Aim for a mix of backend/application developers, platform/SRE/DBA-like reviewers, and ORM users (Rails/Django or similar). Owner, close collaborators, and anyone who helped design Rollout Desk are not valid testers; record conflicts of interest for personal contacts.

A valid completed session includes consent, both scored core tasks, the S4 control, and the end-of-session questionnaire. Partial sessions still provide qualitative feedback but do not count toward the five-session decision threshold.

Ask before scheduling:

1. In the last six months, have you written, reviewed, approved, or operated a PostgreSQL migration before production release? (Required: yes)
2. What best describes your role: backend/application, platform/SRE/DBA, data, other?
3. What do you normally use to review migration risk: careful reading, peer checklist, strong_migrations-style checklist/tool, Squawk or another linter, database documentation, production experience, something else?
4. Which PostgreSQL major versions do you mainly work with?
5. Can you run a local Node.js 24 web app, or do you prefer an async/screen-shared session using provided files?
6. Do you have any relationship to the project owner or this tool that could bias your feedback?

Do not collect names, employer, demographic data, production schema, customer data, or secrets. Use IDs such as `T01`.

## Consent and redaction

Read or send this before the session:

> Participation is voluntary and unpaid, and you may stop or withdraw at any time. The session takes about 30–45 minutes. You will review only synthetic SQL supplied for the study. Do not paste or disclose production SQL, secrets, credentials, customer data, incident details, or confidential schema. We collect task timing, your listed findings, answers to the questionnaire, and facilitator notes. We do not record audio/video or screen unless you separately agree in advance. Results use a pseudonymous tester ID and quotes will be redacted before sharing.

The facilitator must confirm `consent_confirmed=yes` and `no_production_sql_confirmed=yes` in every results row. If production or secret material appears, stop using that artifact, delete/redact it before analysis, and record only that a redaction occurred.

## Materials

- Local demo from [DEMO.md](DEMO.md), already running before a moderated session.
- Scenario files in [scenarios/](scenarios/); do not show `scenarios/ANSWER_KEY.md`.
- Questionnaire in [QUESTIONNAIRE.md](QUESTIONNAIRE.md).
- A copy of `RESULTS_TEMPLATE.csv` stored outside the repository or in a private results location.

Scenario aliases: S1=`01-volatile-default-index.sql`, S2=`02-rename-drop-mixed-versions.sql`, S3=`03-constraints-type-rewrite.sql`, S4=`04-low-risk-control.sql`.

## Design and counterbalancing

Core comparison: each tester reviews **one high-risk scenario with their usual workflow** and **another high-risk scenario with Rollout Desk**. The usual workflow can be anything they really use: careful reading, documentation, peer checklist, strong_migrations-style rules, Squawk, or another linter. Record it; do not force a tool.

Use this A/B assignment table. Assign testers round-robin (`T01` slot 1, `T02` slot 2, `T03` slot 3, `T04` slot 4, `T05` slot 1 again, and so on).

| Slot | First scored task | Second scored task | Control after core |
| --- | --- | --- | --- |
| 1 | S1 with usual workflow | S3 with Rollout Desk | S4 with Rollout Desk |
| 2 | S3 with Rollout Desk | S1 with usual workflow | S4 with Rollout Desk |
| 3 | S3 with usual workflow | S1 with Rollout Desk | S4 with Rollout Desk |
| 4 | S1 with Rollout Desk | S3 with usual workflow | S4 with Rollout Desk |

S4 is always run with Rollout Desk because it is a calibration control: it shows whether the tester treats every generated gate as a severe blocker or verifies the low-risk context. It is not part of the time comparison.

S2 is a backup/alternate scenario. Use it only if a tester was accidentally exposed to S1 or S3 before scoring, if a core scenario cannot be used, or as an optional extra after the required interview. Mark substitution in `control_or_substitution`; analyze substituted rows qualitatively and do not pool them into the primary paired comparison without saying so.

## Session script (30–45 minutes)

1. **Consent and screener — 5 min.** Read the consent/redaction note and ask the screener.
2. **First scored review — up to 8 min.** Show only the assigned SQL file. Start timing when the SQL is visible. Stop when the tester explicitly says they are done, or at the cap.
3. **After-scenario questions — 2 min.** Ask only the applicable exact questions.
4. **Orientation immediately before first Rollout Desk task — up to 3 min.** Show the running local app and say: paste title and SQL, choose Inspect SQL, optionally inspect the capture query, then Generate review. Use the built-in invoice example only if orientation is needed; do not discuss hidden scenario issues. Orientation time is never counted as task time.
5. **Second scored review — up to 8 min**, followed by 2 min of after-scenario questions.
6. **Control review — up to 4 min.** Start/stop by the same declaration rule. Ask applicable questions for 1–2 min. The control is required for a valid completed session; the full worst-case schedule remains within 45 minutes.
7. **End-of-session questions — 7–9 min.** Use the exact end questions. Do not defend the design or correct the tester until scoring is complete.

Hard caps: 8 minutes for S1/S2/S3 and 4 minutes for S4. A timeout is valid data; mark `timed_out=yes` and continue.

## Timing and task rules

- Start the clock when the scenario SQL is first shown, not during consent or setup.
- Stop the clock only when the tester declares the review is done (for example, “I’d be ready to approve/comment”), or when the cap is reached.
- Do not count orientation, database startup, copy/paste problems caused by the facilitator, or post-task questions.
- The tester may think aloud but does not have to. If they ask the facilitator whether something is correct, say: “Use your judgment as you would in a real review.”
- In the usual-workflow condition they may use their normal references/tools, subject to the cap. Record them.
- In the Rollout Desk condition they use Rollout Desk for the review, but may still inspect the SQL and use judgment. Do not provide the answer key or coach them toward hidden issues.
- There is no database snapshot for these synthetic scenarios. Missing operational evidence is part of the review, not a setup failure.

## Measurements

For every tester × scenario row record: timing; valid issues discovered; answer-key issues missed; false alarms; critical items found; whether review completed; generated-plan actionability (1–5 plus “which step would you actually do”); trust in output (1–5 plus “what would you double-check”); requested changes; and applicable free-text evidence. At session end record: would use again (yes/maybe/no plus why) and comparison with existing workflow (much worse/worse/about the same/better/much better plus why).

Use pipe-separated answer-key IDs in CSV fields that contain multiple values. Do not put names or employer names in the CSV.

## Scoring and analysis rules

1. Score within 24 hours using only the hidden answer key and the tester artifact/notes.
2. Give one point for an answer-key item only when the tester identifies both the risk and the correct operational direction. Give 0.5 for naming the risk family without a useful direction, or the right direction without showing why. Give no credit for generic advice such as “test it” or “be careful.” Fractional totals are allowed.
3. Count each unique valid issue once. A valid novel observation not in the key may be recorded as `N1`, `N2`, and so on, but it does not change the fixed answer-key denominator.
4. A false alarm is a definite claim that a non-issue is severe/action-blocking, or a materially wrong operational claim. A question, caveat, or request to verify is not a false alarm.
5. Analyze S1/S3 core rows separately from S4 control rows. Do not pool control timing into the comparison.
6. For each completed paired session compute key-coverage difference: Rollout Desk credit ÷ possible credit minus usual-workflow credit ÷ possible credit. Also compute time ratio only when both reviews completed without timeout. Report medians and ranges; with five testers do not claim statistical significance.
7. Missing values stay missing. Report denominators. Do not discard a session merely because the tester is fast, slow, skeptical, or negative.
8. Overtrust in S4 means treating the migration as a release blocker solely because Rollout Desk produced a gate, without checking the runner transaction boundary or recognizing the additive nullable column/concurrent-index context.
9. Keep facilitator scoring limitations explicit: the facilitator usually knows condition and cannot be truly blinded. If a second scorer is available, have them score redacted artifacts independently and report disagreements.

## Pre-registered decision threshold

This threshold is a decision aid for the owner, not proof of demand.

**Positive signal** across the first five valid sessions requires all of the following:

- at least 4 of 5 testers answer **better** or **much better** than their existing workflow;
- median key-coverage difference is at least **+20 percentage points** for Rollout Desk, and no more than 1 tester finds fewer critical items with Rollout Desk than usual;
- median Rollout Desk/usual time ratio is at most **1.25** among complete pairs;
- median actionability is at least **4/5**; at least 3 testers answer **yes** to using it again and no more than 1 answers **no**;
- median false alarms in Rollout Desk reviews are at most 1 per review, and no more than 2 testers show uncritical overtrust on S4.

**Negative signal** occurs if any of the following holds:

- at least 3 of 5 testers answer **worse/much worse**, or at least 3 answer **no** to using it again;
- median actionability is at most **2/5**;
- Rollout Desk gives no median coverage improvement and is more than 25% slower;
- at least 3 testers miss the same critical issue in both conditions, showing the tool does not address the target failure mode;
- at least 3 testers overtrust the control output or median false alarms are at least 2 per Rollout Desk review.

Anything else is **mixed/inconclusive**. Positive means run a focused iteration and a second small pilot, not launch. Negative means stop recruitment and rethink the concept. Mixed/inconclusive means inspect dominant failure modes before deciding whether up to five more sessions are justified; document that continuation as an amendment.

## Async self-run adaptation

Use the same slot table. Send only the assigned SQL files and questionnaire link/text; never send the answer key. Ask the tester to time themselves with a visible stopwatch, paste their findings before opening the post-task questions, and report start/stop times in UTC or local time with timezone. Do not use async rows if timing or condition order is unclear. Mark `mode=async` and analyze separately if enough rows exist.
