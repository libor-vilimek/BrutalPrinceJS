# Gameplay statistics

The Node.js 24/Koa server serves the game and accepts `POST /api/v2/gameplay-statistics`. Only the server communicates
with MongoDB through the official driver and direct queries. The browser sends compact cumulative counters.

## Configuration

Set Heroku's **`mongoconnectionurl`** to the complete connection string. `MONGODB_URI` is a fallback.
`MONGODB_DATABASE` defaults to `brutalprince`, with collection `brutalprince`; `PORT` defaults to 8080.
Optionally set `PUBLIC_ORIGIN` to the canonical origin without a trailing slash. Heroku proxy headers are trusted
only when `DYNO` is set, with one forwarding hop. Database pooling and index initialization are lazy.

Locally, copy `.env.example` to ignored **`.env`**, put the actual credentials only there, and run `npm run start:local`.
URI-encode passwords in connection strings. Never put credentials in `.env.example`, command history, screenshots or
commits. Neither the environment file nor server code is served to browsers. Errors suppress driver details.
`npm start` and `Procfile` use the host environment. An unavailable database does not stop gameplay.

## Compact API and documents

Each page creates a random `clientId`, reused across level changes and restarts. Reload or re-enabling statistics creates
a fresh ID. No persistent player identity is saved. Each document groups one client, map/revision, level and UTC day.
The browser sends only dirty summaries; later snapshots replace counters through atomic `$max` updates. Identical,
older and concurrent retries cannot double-count or reduce values. Do not send counter deltas to this endpoint.

Example body (use an actual current UTC date):

```json
{
  "schemaVersion": 2,
  "clientId": "6e6faf58-c6d4-4725-bbf9-a33969e6cf5f",
  "levels": [
    {
      "mapId": "campaign:1",
      "mapRevision": "a1b2c3",
      "levelNumber": 1,
      "day": "2026-10-11",
      "counters": { "starts": 1, "enemyDeaths": 12 },
      "kills": [{ "cause": "fire", "weapon": "molotov", "count": 12 }],
      "damage": [],
      "deaths": [],
      "weapons": [],
      "rooms": [],
      "extras": []
    }
  ],
  "droppedEventCount": 0
}
```

A response contains `results` in input order, each with `key` (`mapId|mapRevision|levelNumber|day`), `status: stored` or
`rejected`, and a rejection reason where applicable. Persistence is confirmed before acknowledging. There are at most
100 summaries/256 KiB per request; strict fields, bounds, timestamp/total checks, rate limits and same-origin rules apply.
IP rate buckets are temporary server memory; IPs are not stored in gameplay documents.

The groups retain:

- `kills`: cause, weapon, count. Enemy IDs, individual victims and positions are omitted.
- `damage`: cause, source, hit count, actual HP lost. Guards retain ID, current room and spawn tile; moving around one
  room does not split a group. Traps retain their original room/tile/type; falls retain known support/departure context.
- `deaths`: cause, source, Prince tile, weapon, count, latest `lastAt`. Repeated deaths at the same place share one row.
- `weapons`: weapon, shots and hits; `rooms`: room ID, active milliseconds and visits.
- `extras`: type, item/lesson/change and count. Main counters include starts, partial observations, ends, full completions,
  deaths, HP lost, active milliseconds, activity count, healing and health upgrades.

Groups are capped at 128 each; unusual custom maps overflow into `other` without losing total counts. MongoDB stores
groups as objects under deterministic hashes, so individual counters can be updated atomically. The unique `_id`
starts with `summary:`; metadata is stored once. Map revisions separate layouts/spawns and guard identity.
The [ADR](../dev/adr/2016-10-11-gameplay-statistics-api-and-mongodb.md) documents the grouping tradeoffs.

Existing raw version-1 documents and the old `/api/v1/gameplay-events` endpoint remain compatible. The dashboard sums
both formats; no previous observations are wiped or migrated automatically. New gameplay and sample seeding use v2.
A fatal hit contributes actual HP once and a death once. Corpse animation cannot add another kill. Indirect kills
retain known initiating weapons. Enemy damage/encounters are omitted from compact transmission.

## Background delivery, activity and preference

Send asynchronously three seconds after the last relevant event, with a maximum 20-second wait during continuous
play. Only one request is in flight. An 8-second timeout and bounded backoff contain failures, without player alerts
or gameplay effects. Cumulative snapshots include earlier counts even if local notifications overflow; the local
notification queue is bounded at 1,000. `droppedEventCount` is a queue diagnostic, not a death total.
Delivery on page exit is best effort; nothing is durably queued across reloads.

Active-play observations occur every 20 seconds only after real movement or a meaningful action. Patrols, animations,
wall input, an unattended simulation, pause, tutorials, menus, hidden tabs and blur do not manufacture active play.
Room/active-time deltas are summed once; terminal events contribute remaining deltas only.

**Send gameplay statistics** in the upper-right settings menu defaults to enabled and is saved on the device. Disabling
stops collection/sending, clears summaries, queues and retry/activity state, and aborts requests where possible.
Already accepted data cannot be recalled. Mid-level re-enabling creates a fresh client ID and partial observation;
missing starts/time/damage/deaths are not replayed, and partial observations do not count as full starts/completions.

Summaries expire 90 days after the end of their UTC play day; MongoDB TTL cleanup is asynchronous. Older raw documents
retain expiry 90 days after receipt. No names, emails, keystroke logs, screenshots, full URLs, permanent player IDs, IPs
or user-agent strings are stored. Host access logs are separate. These observations are incomplete and untrusted.

## Statistics page and local preview

The statistics page and read-only reporting API are public without a login, including on Heroku. Open `/statistics`
on the deployed game, or `http://localhost:8080/statistics` locally, to inspect **`brutalprince.brutalprince`**.
The page displays its exact database and collection. **Play game** uses that server's same collection. It shows deaths,
causes, daily trends, level completion, actual guard damage, traps, weapons and active play, plus recent Prince death
groups and their repeat counts. Period filters include complete UTC play days; guard rankings separate revisions and
screens. Completion compares starts/completions within the selected period, not individually tracked cohorts.

The dashboard refreshes every 15 seconds while visible and immediately on return. Allow for the three-second game batch
delay, or use manual refresh. To view varied samples in isolated test storage:

```text
npm run statistics:reset
npm run statistics:preview
```

Open `http://127.0.0.1:8081/statistics`. This preview uses **`testbrutalprince.test_dashboard_events`**, labeled TEST DATABASE.
Both its game and dashboard use this collection. The **Data** filter separates Gameplay only, Samples only and both.
Set `STATISTICS_PREVIEW_PORT` for another port. These commands load ignored `.env`; stop the preview with Ctrl+C.

- `statistics:seed` adds 180 random attempts as compact summaries through the real API, grouped by level/day and covering
  guards, traps, deaths, weapons and activity over 14 days. Generated documents are marked as samples.
- `statistics:wipe` drops only `testbrutalprince.test_dashboard_events`.
- `statistics:reset` wipes that fixed collection and seeds it.
- `statistics:preview` views existing data without deleting or generating any.

Destructive commands cannot be redirected through production configuration. The default `testbrutalprince` collection
and integration-test collections remain independent. The preview process still binds to loopback, while the normal
server serves the public dashboard on its configured port. Read-only routes accept public hostnames and navigation
from other websites. Gameplay write requests keep their existing origin checks and validation.

## Exploratory queries

Examples for `mongosh`, targeting new compact documents:

```javascript
// Total deaths by level, keeping map revisions separate.
db.brutalprince.aggregate([
  { $match: { schemaVersion: 2 } },
  {
    $group: {
      _id: { map: "$mapId", revision: "$mapRevision", level: "$levelNumber" },
      enemyDeaths: { $sum: "$counters.enemyDeaths" },
      princeDeaths: { $sum: "$counters.princeDeaths" }
    }
  }
]);

// Guard damage; weighted counters instead of counting documents.
db.brutalprince.aggregate([
  { $match: { schemaVersion: 2 } },
  { $project: { mapId: 1, mapRevision: 1, levelNumber: 1, damage: { $objectToArray: { $ifNull: ["$damage", {}] } } } },
  { $unwind: "$damage" },
  { $match: { "damage.v.source.kind": "guard" } },
  {
    $group: {
      _id: {
        map: "$mapId",
        revision: "$mapRevision",
        level: "$levelNumber",
        guard: "$damage.v.source.guardId",
        room: "$damage.v.source.roomId"
      },
      hpLost: { $sum: "$damage.v.hpLost" },
      hits: { $sum: "$damage.v.hits" }
    }
  },
  { $sort: { hpLost: -1 } }
]);
```

These examples intentionally select v2; the dashboard's `GET /api/v1/statistics` combines legacy and compact data.
Missing ends do not establish deaths or abandonment. Exact attempt histories and per-hit chronology are no longer stored.

## Tests

- `npm test` checks grouping, substantial JSON reduction, gameplay attribution, activity, transport, opt-out and local API.
- `npm run test:mongodb` loads ignored `.env` and uses `testbrutalprince` (or `MONGODB_TEST_DATABASE`). It verifies real
  HTTP persistence, duplicate/older/concurrent snapshots, raw/compact reports, validation, indexes and expiry. Each run
  creates and removes only its own fresh `test_gameplay_events_<random-id>` collection.
- Optional `tests/statistics-browser.test.js` uses `RUN_BROWSER_TESTS=1`, Playwright and `BROWSER_EXECUTABLE`, and keeps
  music/effects muted. It checks the real game, compact batches, attribution, opt-out, failures, inventory and restarts.
- With preview running, `RUN_DASHBOARD_TESTS=1` enables `tests/statistics-dashboard-browser.test.js` for real reports,
  filters, auto refresh, empty state and responsive layout. Set `PLAYWRIGHT_MODULE` to an installed module if needed.

Network/browser tests are skipped unless explicitly enabled. Database diagnostics never print raw driver errors.
