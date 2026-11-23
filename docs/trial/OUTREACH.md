# Outreach package

Status: **draft, needs owner approval, nothing sent.** No external user has tested Rollout Desk; demand is unproven. Do not create accounts, post, DM, email, or otherwise use these drafts until the owner approves the license, channel choice, sender identity, and final wording.

## Target tester profile

Primary: people who have written, reviewed, approved, or operated production PostgreSQL migrations in the last six months. Useful mix:

- backend/application developers using Rails, Django, Laravel, another ORM, or raw SQL migrations;
- platform/SRE/DBA-like reviewers who think in locks, replication, deploy order, and rollback;
- maintainers or frequent users of migration safety workflows (manual checklists, strong_migrations-style rules, Squawk or similar linters).

Avoid relying only on close friends. Personal contacts are acceptable for early sessions but mark the relationship/conflict. Exclude the owner and anyone who designed or built Rollout Desk.

## Channel research

Rules were checked from source pages on **2026-11-23**. “Unverified” means exactly that; do not fill gaps with third-party summaries or assumptions. Re-check manually immediately before posting because rules change.

| Channel | Audience | Rule source and summary actually verified | Fit | Risk | Account needed? |
| --- | --- | --- | --- | --- | --- |
| Personal network / known contacts | Known PostgreSQL users; highest context but biased | No platform rule page. Use existing consent-based relationships; identify conflicts and do not mass-mail. | Very high for first 5 | Low etiquette risk, high sampling bias | Existing contact only |
| PostgreSQL user groups / local meetups | PostgreSQL practitioners, often experienced operators | [Recognised PostgreSQL User Groups policy](https://www.postgresql.org/about/policies/user-groups/): anyone may submit a PostgreSQL talk proposal; speakers must disclose closed-source/unrelated primary content; organizations may promote business only where it helps PostgreSQL adoption and content is technical. [Directory](https://www.postgresql.org/community/user-groups/) read same date. | High for a short demo plus recruitment | Low/medium; organizer controls audience and format | No central account; organizer/contact method may require one |
| PostgreSQL Slack (`PostgresTeam`) | PostgreSQL users/operators in real time | [Slack Operators wiki](https://wiki.postgresql.org/wiki/Slack_Operators) verifies workspace/operators/self-invite. [PostgreSQL Code of Conduct](https://www.postgresql.org/about/policies/coc/) verified. **No explicit self-promotion or recruitment rule was found in sources read; unverified.** Ask an operator/moderator before posting. | High | Medium/high without permission | Yes, Slack account |
| r/PostgreSQL | Directly relevant PostgreSQL audience | [Rules page](https://www.reddit.com/r/PostgreSQL/about/rules) could not be read: Reddit returned HTTP 403 to automated access. Subreddit-specific self-promotion rule is **unverified**. Do not post until a human reads the live rules or modmail approves. | High | High removal/ban risk if guessed | Yes, established Reddit account strongly preferable |
| r/rails | Rails developers who live with migrations | [Rules page](https://www.reddit.com/r/rails/about/rules) could not be read: HTTP 403. **Unverified.** | Medium/high | High until rules are manually read | Yes |
| r/django | Django/PostgreSQL application developers | [Rules page](https://www.reddit.com/r/django/about/rules) could not be read: HTTP 403. **Unverified.** | Medium/high | High until rules are manually read | Yes |
| pgsql-general mailing list | PostgreSQL users and some developers | [pgsql-general](https://www.postgresql.org/list/pgsql-general/) is for general PostgreSQL SQL/installation discussion. [Mailing list tips](https://www.postgresql.org/list/) say choose the most appropriate list and do not cross-post; archives are public. [pgsql-announce](https://www.postgresql.org/list/pgsql-announce/) is for PostgreSQL and third-party software announcements, but whether a recruitment request belongs there is **unverified**. | Medium | High if perceived as off-topic research spam | Email subscription/moderation likely |
| Hacker News — Show HN | Broad technical builders | [Show HN rules](https://news.ycombinator.com/showhn.html): must be something people can try; avoid signup/email barriers; do not post before ready; submitter must have personally worked on it and be present to discuss; do not ask friends to upvote/comment. | High after validation | Medium; premature launch can burn the shot | Yes |
| Lobsters | Computing-focused practitioners | [About/rules](https://lobste.rs/about): self-promo should be under one quarter of a user’s stories/comments in the last year; users in first 70 days may not submit self-promo. A [2026 moderator update](https://lobste.rs/s/h0eate/updates_site_guidelines_ai_llm_tags) says bare code-repository submissions are no longer allowed; write about purpose/design/lessons instead. | Medium | High for a new/promo-only account | Yes, invitation-based account |
| DEV Community (dev.to) | Broad developer audience | [DEV Terms, content policy](https://dev.to/terms): content must be on-topic/high-quality and not designed primarily for promotion/backlinks; posts need substantial content, not just an external-link reference. | Medium for a technical write-up | Medium; recruitment-only post is weak fit | Yes |
| PostgreSQL-focused Discords | Real-time PostgreSQL users | [Postgres Conference launch post](https://postgresworld.org/blog/discord-server-new-live-webinars-and-more) says the People/Postgres/Data Discord’s rule #1 is “Be Nice.” Current channel-specific self-promotion rules are inside Discord and were not readable without joining: **unverified**. | Medium/high | Medium/high without reading in-server rules | Yes, Discord account |
| Mastodon / fosstodon | FOSS-oriented developers | [fosstodon instance API](https://fosstodon.org/api/v1/instance): invite-only; rules prohibit commercial promotions/advertising through posts that are exclusively links and/or excessive hashtags, including repetitive self-promotion for profit/spam. | Medium/low for recruitment | Medium; unclear whether unpaid research is welcome | Yes, invite/account |
| LinkedIn | Professional network, backend/platform engineers | [Professional Community Policies](https://www.linkedin.com/legal/professional-community-policies): content should be constructive; spam includes untargeted, irrelevant, obviously unwanted, unauthorized commercial/promotional, or repetitive messages; do not use invitations to send promotional messages to strangers. | Medium for warm contacts only | High for cold mass outreach | Yes |
| GitHub Discussions of migration linters | Users of strong_migrations/Squawk-type tools | GitHub API checked 2026-11-23: [`ankane/strong_migrations`](https://api.github.com/repos/ankane/strong_migrations) and [`sbdchd/squawk`](https://api.github.com/repos/sbdchd/squawk) both report `has_discussions: false`. No verified Discussions venue exists; using issues for recruitment would be inappropriate unless a maintainer explicitly invites it. | Theoretically high | Very high; do not use | Yes, but do not use for this |

## Recommended top three

1. **Personal network / known contacts** — fastest, consent-based, no platform-rule uncertainty, and most likely to complete five sessions. Treat results as biased and label them accordingly.
2. **PostgreSQL user-group organizers** — the written PUG policy explicitly contemplates technical PostgreSQL content and organizer review, making this the strongest verified permission-based path to a relevant audience.
3. **PostgresTeam Slack, only after operator/moderator approval** — dense relevant audience and real-time scheduling, but the promotion/recruitment rule was not verified, so permission comes first.

Hold Hacker News until after at least five tester runs, per the draft gate below. Hold Reddit until a human verifies current subreddit rules. Do not use migration-linter issue trackers.

## Draft texts

Every item below is **draft, needs owner approval, nothing sent**.

### 1. Short Reddit post — draft only

**Title:** Looking for 5 PostgreSQL reviewers to test a local migration-review workflow

**Body:**

> I built Rollout Desk, an early local-only tool for reviewing PostgreSQL migration rollout risk. It is not validated yet and demand is unproven; this is a research request, not a launch claim.
>
> I’m looking for five people who review production PostgreSQL migrations to spend 30 minutes (with optional continuation to 45 only if you agree) comparing their normal review workflow with Rollout Desk on synthetic SQL. Participation is unpaid.
>
> You would review only supplied synthetic scenarios—no production SQL, secrets, credentials, customer data, or confidential schema. Data collected: task timing, issues found/missed against a hidden answer key, questionnaire ratings/text, and facilitator notes under a pseudonymous ID. No recording without separate consent; quotes are redacted.
>
> The demo runs locally with Node 24 from the public repository; no database credentials or account are needed. If this is inappropriate for the subreddit, I’d appreciate moderator guidance and will remove/adjust it.

### 2. Slack/Discord message — draft only, post only where rules/operator permit

> Hi — I’m looking for five people who review PostgreSQL migrations to critique Rollout Desk, an early local-only migration rollout review tool. It is not validated and demand is unproven. I’m asking for 30 minutes (optional continuation to 45 only if you agree), unpaid: one synthetic migration review using your normal workflow and one using the tool.
>
> No production SQL or secrets. The scenarios are supplied and synthetic. Data collected: timing, issues found/missed against a hidden answer key, questionnaire responses, and redacted facilitator notes under a pseudonymous ID; no recording without separate consent. The demo runs locally with Node 24, no DB credentials or account. Please DM me if interested or if you know the right channel/person. Thanks.

### 3. Email/DM to a known contact — draft only

> Subject: Could you spare 30 minutes to critique a Postgres migration review tool?
>
> Hi [name], I’m validating whether Rollout Desk is useful before investing more in it. It is an early local-only tool for reviewing PostgreSQL migration rollout risk; no external user has validated it and demand is unproven.
>
> Could you do one unpaid 30-minute session (optional continuation to 45 only if you agree)? You would review synthetic migrations once using your normal workflow and once using the tool. I am not asking for production SQL, secrets, customer data, or confidential schema.
>
> I’ll collect only task timing, issues found/missed against the hidden answer key, questionnaire responses, and redacted notes under a pseudonymous ID. I won’t record audio/video/screen unless you explicitly agree first. Negative feedback is genuinely useful here—if this does not beat your current workflow, that is the answer I need.
>
> If yes, I’ll send the local setup (Node 24, no database credentials) and two scheduling options. If not, no worries at all.

### 4. Show HN — draft only; do not use until at least 5 tester runs are complete

**Additional gates before use:** owner approval; license decision resolved; current HN rules re-read; local clone path still verified; tester results honestly summarized; author available in comments. HN is not a substitute for validation.

**Title:** Show HN: Rollout Desk – local PostgreSQL migration rollout review

**First comment / context:**

> Rollout Desk is an early local-only tool I built for reviewing PostgreSQL migration rollout risk before deploy. It started as an unproven workflow experiment, and demand is still unproven. Before posting here, we ran five small tester sessions; I’ll summarize what they found and what remains unproven in the comments rather than claiming demand.
>
> It runs locally with Node 24 from the public repo; no PostgreSQL credentials, account, or hosted signup are required. You can use the built-in synthetic example immediately.
>
> I’m still looking for unpaid 30-minute research conversations (optional continuation to 45 only if you agree) with people who review production PostgreSQL migrations. Research participants review only synthetic scenarios—no production SQL or secrets. Data collected in those sessions is task timing, issues found/missed against a hidden answer key, questionnaire responses, and redacted notes under a pseudonymous ID; no recording without explicit consent.
>
> Feedback on the workflow, false confidence/false alarms, and missing rollout evidence is especially welcome.

### 5. Follow-up / thank-you — draft only

> Subject: Thank you — Rollout Desk trial notes
>
> Hi [name], thank you for the unpaid 30-minute session (and for any optional extra time you explicitly agreed to). As a reminder, Rollout Desk is an early tool, not externally validated, and demand is unproven.
>
> The data collected was task timing, issues found/missed against the hidden answer key, questionnaire ratings/text, and facilitator notes under your pseudonymous ID. No production SQL or secrets were intentionally collected, and quotes will be redacted before sharing. If you want anything corrected or withdrawn, tell me and I will update/delete what I can.
>
> Your main reported pain points were [1–2 neutral bullets]. I may send one short follow-up after analysis; no further commitment is expected.

## Recruitment target and timeline

- Recruit **8–12** invited people to yield **5 valid completed sessions**, allowing for nonresponse and scheduling loss. Do not mass-post across every channel.
- Day 0: owner approves license decision, final text, sender identity, privacy wording, and first channel(s).
- Days 1–3: send personal-network asks; contact one relevant PUG organizer; ask PostgresTeam Slack operator permission if owner wants that channel.
- Days 1–10: schedule and run sessions. Target no more than two sessions/day so scoring quality stays high.
- Day 14: stop recruitment once five valid sessions are complete.
- Day 15: score, analyze against the pre-registered threshold, and decide next step. Only consider Show HN or broader public posts after those five runs and a separate owner decision.
- If the result is mixed/inconclusive, do not automatically keep recruiting. Document an amendment and the exact reason before adding up to five more sessions.
