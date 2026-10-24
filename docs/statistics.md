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

## Gameplay milestones

The dashboard shows unique clients and total occurrences for blasted level exits, large max-health potions consumed,
Jaffar defeated, jetpack activations, rockets intercepted by the level-6 laser, destroyed doors and destroyed wall tiles.
Doors include gates and exit doors; an exit's two halves count as one door. Wall totals count destroyed tiles, not entire
connected walls. Tapestries and other barriers are excluded. Potions count when the health upgrade takes effect;
ordinary healing potions are excluded. Jetpack pickup and deactivation do not count as use.

These are sparse cumulative counters (`exitDoorsDestroyed`, `doorsDestroyed`, `wallsDestroyed`, `healthUpgrades`,
`jaffarDeaths`, `jetpackUses`, `laserRocketsIntercepted`) in existing v2 summaries. Retries retain the same `$max`
semantics, and no enemy identity is added. The read API returns `milestones: [{_id, clients, occurrences}]`, using keys
`exitDoors`, `healthPotions`, `jaffar`, `jetpack`, `laserRockets`, `doors`, `walls`. A client contributes at most once
to each milestone within the selected period/level/source, even across days and map revisions. Reloads create fresh
client IDs, so clients approximate game sessions rather than physical people. Raw v1 data uses its existing session ID.

Older compact records support health upgrades and jetpack use, but omitted Jaffar identity and barrier types cannot
be reconstructed. Historical zero counts do not prove nobody performed an action. Sample generation covers all seven
milestones; preview and seeding remain restricted to test storage.

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

Click a day in either daily chart to switch the whole dashboard to that UTC day. A focused bar also opens with Enter
or Space. The level and data filters are preserved, including when selecting a zero-count day.
You can also choose **Single day** in **Period**, then select **Day (UTC)** to see only that calendar day's observations in every
historical total, chart and table. The day starts at 00:00 UTC and ends just before the next UTC midnight. Level and data
filters still apply; choose a rolling period again to return to multiple days. A day without observations shows zero
totals and empty results. **Currently playing** remains the live count described below.

The read API accepts `GET /api/v1/statistics?day=2026-10-24` with optional `level` and `source` filters. `day` must be a
real calendar date in `YYYY-MM-DD` format and takes precedence over a valid `days` parameter. Without `day`, `days=7`,
`30` (default) or `90` selects a rolling period. The response includes `rangeStart` (the first UTC day) and `daysRange`
(1 for a single day), so historical charts use the requested date. Compact summaries use their stored play day; legacy
events use their server receipt day, as in the rolling reports.

The dashboard refreshes every 15 seconds while visible and immediately on return. Allow for the three-second game batch
delay, or use manual refresh.

### Currently playing

**Currently playing** counts unique gameplay clients from which the server received an accepted statistics update in
the last **180 seconds**, including the exact 180-second boundary. A client counts once across levels, map revisions,
days and repeated updates. The read API returns the number as `currentlyPlaying` (zero when nobody qualifies).
This is a live, all-level count independent of the historical period, level and data filters; generated samples are
always excluded. It refreshes with the dashboard every 15 seconds while visible. A failed refresh shows “—” for the live
count instead of keeping an outdated number.

The query uses the existing server-written `updatedAt` on compact summaries and `receivedAt`/`sessionId` on legacy
events, with indexes on both receipt fields. Client event timestamps and historical play dates do not determine whether
someone is currently playing. No additional heartbeat or player tracking is added: idle clients, closed pages and clients
with statistics disabled disappear after their last receipt ages out. Reloads create new client IDs, so this estimates
active clients rather than identifying individual people.

### Daily charts

Prince deaths and enemy kills have separate bar charts and independent scales. Every bar is that UTC play day's count,
not a running total. Missing days are zero; hover or focus a bar for its exact date, event count and unique clients.
Clicking opens that day's report. The summary cards show totals for the selected period. Compact rows use their stored
play day rather than the delivery date.

### Unique clients alongside totals

Summary cards retain event/attempt totals and also show unique clients who started or completed a level, died,
defeated enemies, lost HP or reported active play. Level rows show clients beneath starts, completions, deaths, enemy
kills and active time. Starts and completions count actual recorded starts and full
completions; partial observations do not become starts or completed attempts. Completion percentages still use attempts.
The daily charts, death causes, data-source summaries, weapons and danger rankings also show clients. Weapon cards
distinguish clients who used the weapon from clients with kills; rankings show affected clients and clients who died.

Each client counts once for each metric within the selected period, level and data filter. Repeat attempts, multiple
days and revisions do not add another client to a whole-period metric. Each level/map/revision row deduplicates
independently, so adding row counts or daily client counts can exceed the overall unique count. A client who only has
damage observations is included among affected clients, even without a death. Active clients require recorded active
time greater than zero. The counts use `clientId`, falling back to `sessionId` for legacy rows; missing IDs do not
invent a client. Reloading or re-enabling collection creates a new client as described above.

The read API adds `clients`, `startedClients`, `completedClients`, `observationClients`, `princeDeathClients`,
`enemyDeathClients`, `damagedClients` and `activeClients` to totals, with the same fields on daily and level rows.
Causes and data sources add `clients`; weapons add `clients`, `usedClients` and `killClients`; danger rankings add
`clients` and `deathClients`. Reporting groups first by client and then sums counts, without returning client IDs or
storing new gameplay data.

### Relative danger

The absolute guard ranking (HP removed) and place ranking (Prince deaths) are retained. Two additional rankings show
**Prince deaths per 100 unique clients who started the level**: `deaths / levelStarters × 100`. The denominator uses the
same period, data filter, level, map and revision. Restarts and multiple days count once per client; a partial observation
without an actual start does not count. Legacy records use `sessionId`. Reloads create new clients, so these are an
approximation of people. Repeated deaths can exceed 100 per 100 starters; this is not a probability or a tracked cohort.
Sources with no observed starters are omitted from the relative lists. Absolute deaths and denominator are shown beside
each rate. All sources are ranked before taking eight results, independently of the absolute top eight.

The read API adds `guardsPerPlayer` and `trapsPerPlayer`; rows retain source `_id`, `kills`, `hpLost` and `hits`, plus
`levelStarters` and `killsPer100Starters`. The relative aggregation uses MongoDB 5.0+ `$setWindowFields` after deduplicating
client starts across days. Reporting remains read-only and collection never sends additional player or enemy data.

### Animated room previews

Select a row in any danger ranking, or a cause in Recent Prince deaths, to open its room. Close with the × button or
Escape. The preview uses the real Phaser engine, map builder, camera framing, foreground/background layers, all map and
generated enemies, pickup artwork and laser turret. Choppers, spikes, torches and other tile animations continue; loose
floors shake without removing the floor. Enemies retain their idle animations without AI, combat or collision damage.
The source glows yellow along its actual artwork: guards have a silhouette outline and tiles have a translucent tint
over their visible surfaces. Highlights follow animation frames, facing, cropped artwork and the original foreground/
background layers. There is no Prince present.

`/statistics/room-preview` runs in its own iframe and Phaser instance. It never starts `Game` or constructs a settings
manager, statistics recorder, Prince, weapon controller or gameplay input bindings. It does not load audio, send gameplay
requests, read/write saved preferences, change the main game's URL, inventory, timer or level, or advance the campaign.
Closing removes the iframe and its engine. Art and pickup placement reuse the game's drawing/placement routines.

This is the initial room layout, not a replay: source summaries do not store historical world state or guard trajectories.
Guard rows show the guard at its starting position and identify a different recorded damage room when applicable. Map
revision is checked before matching a guard ID. If the recorded revision is unavailable, a notice identifies the current
layout and only the recorded position is marked. Empty gaps use a short dashed floor line, not a filled box in the air.
Missing maps, rooms, source positions or a tile type absent at the recorded position are stated instead of silently
highlighting a different enemy or nearby tile. Generated sample sources can therefore differ from the real current layout.

### Sample data preview

To view varied samples in isolated test storage:

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
- The same switch runs `tests/statistics-preview-browser.test.js`: separate daily counts including zero days, all four
  rankings, actual animated traps, no damage/telemetry/settings changes, modal cleanup, mobile framing, old revisions,
  missing rooms and all fourteen campaign maps. It uses a local fixture server without database writes.
- With preview running, `RUN_DASHBOARD_TESTS=1` enables `tests/statistics-dashboard-browser.test.js` for real reports,
  filters, auto refresh, empty state and responsive layout. Set `PLAYWRIGHT_MODULE` to an installed module if needed.

Network/browser tests are skipped unless explicitly enabled. Database diagnostics never print raw driver errors.
