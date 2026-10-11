# Gameplay statistics

The Node.js 24/Koa server serves the game and accepts `POST /api/v1/gameplay-events` on the same origin. It uses the
official `mongodb` driver, explicit documents and direct queries. Browsers only send HTTPS requests to the API.

## Configuration

Set Heroku's existing **`mongoconnectionurl`** config var to the complete MongoDB connection string. `MONGODB_URI` is a
fallback if that variable is absent. Neither value is exposed in client files, responses or server error logs.
`MONGODB_DATABASE` selects the database (default `brutalprince`). `PORT` selects the HTTP port (default `8080`, supplied
by Heroku). Optionally set `PUBLIC_ORIGIN` to the canonical public origin, such as `https://brutalprince.com`, without a
trailing slash. Heroku proxy headers are trusted only when `DYNO` is set, with one forwarding hop.

For local development, copy `.env.example` to **`.env`** and replace the password placeholder in `.env`. URI-encode the
password when constructing the connection string. Run `npm run start:local`, which loads the local file without printing
it. Do not put actual credentials in `.env.example`, shell command history, screenshots or commits. `.env` is ignored
by Git. The Koa static-file allowlist excludes environment files, server code, Git data and package metadata.

`npm start` uses environment variables already provided by the host. `Procfile` starts the Heroku web process. The server
starts serving the game even without a working database; API calls then return a sanitized retryable response.
MongoDB connection pooling and index initialization are lazy and shared between requests.

## Collection and event contract

Normal documents are stored in `brutalprince.brutalprince` (database and collection). See the
[ADR](../dev/adr/2016-10-11-gameplay-statistics-api-and-mongodb.md) for the event catalogue, attribution and identity model.
The batch body is `{ "schemaVersion": 1, "events": [...], "droppedEventCount": 0 }`. There are at most 100 events and
256 KiB per request. Each result has an `eventId` and `status` of `stored`, `duplicate` or `rejected`; rejected events
also contain a machine-readable reason. The server acknowledges only confirmed persistence. Retries keep the original
event IDs; unique event and semantic indexes prevent duplicate deaths or starts/ends. Invalid fields, health deltas,
coordinates, oversized batches and foreign origins are rejected. Rate limits apply per transient in-memory client IP
bucket; IP addresses are not stored with events.

The event envelope includes session/campaign/attempt IDs, map identity and revision, build version, ordering, timestamps,
location and `partialAttempt`. Runtime guard IDs remain scoped to their map revision. Map revisions hash the map data and
horde-spawn definitions; the build identifier comes from Heroku's `SOURCE_VERSION` or the server's hash of game source.
Room IDs identify the original screens, and local tile columns/rows are zero-based. Events retain source and victim
positions separately. Moving floors retain their original source tile, with the impact location recorded separately.

Damage is actual HP lost. A fatal hit records both damage and death with linked event IDs, so queries sum damage only
from `*_damaged` and deaths only from `*_died`. Fire records a kill immediately; corpse animation adds no kill. Falls,
spikes and choppers keep the known whip/kick initiator while it owns the victim's motion. Shared shadow damage links to
the original damage event; merging is a separate event. Skeleton knockdowns keep their existing immunity.

Active-play reports are observed every 20 seconds only after meaningful actions; animations, patrols, wall input and
unattended simulation cannot keep the player present. Foreground player activity has a maximum 20-second grace period.
`attemptElapsedMs` excludes pauses, while `payload.attemptActiveMs` counts only observed active presence. `roomTime` and
`activeMs` are deltas, not independent totals to add to the cumulative field. A terminal event carries the remaining
deltas. Pauses/backgrounding discard stale activity windows; they do not fabricate catch-up reports.

Requests use a three-second trailing debounce after the most recent event, with a 20-second maximum wait and a full-batch
flush during continuous events. One request is in flight at a time; an 8-second timeout and bounded exponential backoff
contain outages. The in-memory queue holds at most 1,000 events, prioritizing starts, deaths and ends over ordinary
events. Overflow is reported in `droppedEventCount` and stored as `reportedDroppedEvents` on a newly inserted document
when available. Page-exit delivery is best effort. Queues are lost on reload, and no durable offline queue is used.

## Player preference and retention

**Send gameplay statistics** in the settings menu defaults to enabled and is saved on this device. Turning it off stops
recording and sending, clears queues/retry timers/activity deltas and aborts pending requests where possible. A request
already stored cannot be recalled. Re-enabling mid-attempt records `level_observation_started` with new identifiers and
`partialAttempt: true`, without replaying anything from the disabled interval.

Raw events have an `expiresAt` timestamp 90 days after receipt. MongoDB's TTL index removes expired records asynchronously.
No long-term aggregates or dashboard are deployed by this change. No names, emails, raw key logs, screenshots, resume
URLs, persistent player IDs, IP addresses or user-agent strings are stored in gameplay events. Host access logs are
separate from this collection and must be configured by the deployment owner. These client observations are incomplete
and untrusted, not an authoritative competitive leaderboard.

## Local statistics page

On the normal local server, open `http://localhost:8080/statistics` to inspect the configured gameplay collection.
The dashboard shows key counts, daily death trends, level completion, actual guard damage, dangerous traps and weapon
performance. Period and level filters run MongoDB aggregations; guard/trap rankings keep map revisions separate.
Completion compares full starts and completions observed during the selected period, not a tracked cohort; attempts
crossing the date boundary can affect that ratio. Active time is observational and excludes known pauses.

For an isolated preview with varied sample data, run:

```text
npm run statistics:reset
npm run statistics:preview
```

Open `http://127.0.0.1:8081/statistics`. Preview data is visibly labeled **SAMPLE DATA**. Set `STATISTICS_PREVIEW_PORT`
to choose another port. The preview serves the game too, so local play can send additional events into the same test
collection. Stop the server with Ctrl+C. These commands load credentials from ignored `.env` without printing them.

- `statistics:seed` adds 180 randomized attempts covering deaths, guards, traps, weapons and active windows. Batches
  go through the HTTP API and real MongoDB; sample receipt dates are then backdated over 14 days to populate the trend.
- `statistics:wipe` drops only `testbrutalprince.test_dashboard_events`.
- `statistics:reset` wipes that same collection and seeds a fresh sample dataset.
- `statistics:preview` starts the local viewer without deleting or generating data.

Destructive preview commands have a fixed test database/collection and cannot be redirected through production
configuration. The existing default `testbrutalprince` collection is left alone. Integration-test collections are also
independent. Local dashboards require a loopback socket and localhost host, reject foreign origins, and are disabled
on Heroku; a hosted authenticated dashboard would be a separate feature.

## Exploratory queries

Examples for `mongosh`, using the configured database:

```javascript
// Prince and enemy deaths by level and mechanism.
db.brutalprince.aggregate([
  { $match: { eventType: { $in: ["prince_died", "enemy_died"] } } },
  {
    $group: {
      _id: {
        map: "$mapId",
        revision: "$mapRevision",
        level: "$levelNumber",
        type: "$eventType",
        cause: "$payload.mechanism"
      },
      deaths: { $sum: 1 }
    }
  }
]);

// Guards ranked by actual health removed. Keep map revision and guard ID together.
db.brutalprince.aggregate([
  { $match: { eventType: "prince_damaged", "payload.source.kind": "guard" } },
  {
    $group: {
      _id: { map: "$mapId", revision: "$mapRevision", level: "$levelNumber", guard: "$payload.source.guardId" },
      hpLost: { $sum: "$payload.hpLost" },
      hits: { $sum: 1 }
    }
  },
  { $sort: { hpLost: -1 } }
]);
```

Do not interpret missing terminal events as proven deaths or abandonment. Exclude `partialAttempt: true` from full-attempt
completion funnels by default. Include encounter counts and sample sizes when comparing dangerous guards or traps.

## Tests

- `npm test`: deterministic game/recorder tests and local HTTP API tests. No real MongoDB writes.
- `npm run test:mongodb`: loads ignored `.env`, uses the dedicated `testbrutalprince` database (override with
  `MONGODB_TEST_DATABASE`), pings real MongoDB and exercises HTTP batch persistence, invalid events,
  concurrent retries, conflicts, direct aggregation and index/expiry configuration. Each run owns a unique
  `test_gameplay_events_<random-id>` collection and drops only that collection afterward. It never wipes production data.
- The optional `tests/statistics-browser.test.js` requires Playwright and `RUN_BROWSER_TESTS=1`. Set `PLAYWRIGHT_MODULE`
  to an installed module path if needed and `BROWSER_EXECUTABLE` to an installed Chromium/Chrome executable. It runs the
  real game against a local Koa test store, keeping music and effects muted. It checks batching, attribution, menu opt-out,
  outages, restart/inventory and mobile layout. `BROWSER_SCREENSHOT` optionally selects a screenshot output path.
- With a seeded preview running, set `RUN_DASHBOARD_TESTS=1` and run `node --test tests/statistics-dashboard-browser.test.js`
  using the same Playwright/executable variables to verify real dashboard data, filters, empty states and mobile layout.

Regular test runs skip the real-database and browser tests unless explicitly enabled. Real-database tests suppress raw
driver errors so credentials cannot appear in test-runner diagnostics.
