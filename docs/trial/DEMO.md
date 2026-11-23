# Demo path for an outside tester

Status: prepared locally, but no outside tester has used it yet.

## Use the local demo, not the hosted Devin App

The hosted Devin App at `https://rollout-desk--bbcnjtf0.preview.devinapps.com` requires sign-in to the owner’s Devin organization. **Outside testers cannot use it.** Do not send that URL as tester instructions.

The usable path is local:

- clone the public GitHub repository;
- use Node.js 24 or newer;
- run `npm ci` and `npm start`;
- open <http://127.0.0.1:3000>.

No PostgreSQL server, database credentials, paid service, account, browser extension, or Docker container is needed. The server listens on loopback only and stores saved reviews in local SQLite at `data/reviews.sqlite` relative to the directory where it was started.

## Tester instructions

1. Install Git and Node.js 24+. If Node 24 is already installed through nvm, activate it with:

   ```sh
   source ~/.nvm/nvm.sh && nvm use 24
   ```

2. Clone and enter the repository:

   ```sh
   git clone https://github.com/Braventh/migration-rollout-review.git
   cd migration-rollout-review
   ```

3. Confirm the runtime and install dependencies:

   ```sh
   node --version   # must be v24.x or newer
   npm ci
   ```

4. Start the app:

   ```sh
   npm start
   ```

5. Open <http://127.0.0.1:3000>. Leave the terminal running; press Ctrl+C there to stop the app.

If port 3000 is busy, use another loopback port, for example `PORT=3100 npm start`, and open `http://127.0.0.1:3100`.

## Three-minute product flow

1. Choose **Load example**. This fills a synthetic invoice migration, synthetic database evidence, and example rollout context.
2. Choose **Inspect SQL**. Confirm that the scoped target is shown.
3. Open **Read-only capture query**. Explain that Rollout Desk never connects to PostgreSQL or executes the migration; in real use a person may copy this read-only catalog query into an approved session and paste back one JSON cell.
4. Choose **Generate review**. Read the evidence warning and the generated gate(s).
5. Optionally enter a team decision, save locally, and download Markdown. For the trial, do not paste production SQL, secrets, customer data, or internal incident details.

## Maintainer verification already performed

A fresh public clone was tested on 2026-11-23 in a clean directory on this Ubuntu machine. This verifies that the documented path can run; it is **not** user validation.

| Measurement | Result |
| --- | --- |
| Repository commit tested | `6f348d595118c97f716d0bdb7abd4055532558b0` |
| Node / npm | `v24.22.2` / `10.8.3` |
| `git clone` wall time | 663 ms |
| `npm ci` wall time | 1,130 ms |
| server start to HTTP 200 | 225 ms |
| **clone to running page** | **2.018 seconds** |
| Browser flow check | Passed in 464 ms using Playwright with `/home/ubuntu/.local/bin/google-chrome` |
| Flow evidence | **Load example** → **Inspect SQL** showed the scoped capture query containing `BEGIN READ ONLY;` → **Generate review** rendered `Required value · statement 1` with one decision field |

The timing was measured at 2026-11-23T06:50:21Z on a warm development machine. It includes a real fresh clone and dependency installation, but external testers may be slower because of network speed, Node installation, operating system, corporate proxies, or cold npm caches.

## Legal/hosting gates before outside use

- No `LICENSE` file exists in the repository at the tested commit. Choosing and adding a license is an owner decision that should be resolved before inviting outside testers to clone or reuse the project.
- A public hosted demo would require explicit owner approval. Do not expose the local server directly to a network, and do not treat the private Devin App as a public demo.
