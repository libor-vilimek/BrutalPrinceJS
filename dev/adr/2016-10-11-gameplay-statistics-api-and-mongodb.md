# ADR 2016-10-11: Compact gameplay statistics through Koa and MongoDB

- Status: Accepted and implemented; cumulative summaries supersede the original raw-event design.
- Date: 2016-10-11 (date-based filename retained as requested).
- Scope: Gameplay statistics, API, MongoDB storage, local dashboard and isolated database tests.

## Context

We need enemy and Prince death counts, dangerous guards and traps, level starts, and active play. Storing a full
identity, timestamp, position and envelope for every enemy hit or kill costs too much. The updated requirement is to
group enemy kills into counts per client and level. Prince damage and deaths retain useful attribution, but repeats
should also share counters. Exact event histories and individual enemy victims are no longer required.

## Decision

Create a random `clientId` when the game's page opens. Keep it across level changes, restarts and new games within
that page; create a new one on reload. It is not a permanent device/player ID. Opting back into tracking creates a
fresh client ID and starts a partial observation without replaying the disabled interval.

Accumulate counters in the browser and send cumulative snapshots to `POST /api/v2/gameplay-statistics`. Store one
MongoDB document per `(clientId, mapId, mapRevision, levelNumber, UTC day)`, updating it in place. Including the day
preserves daily charts and retention without timestamps on every kill. Map revisions keep guard IDs comparable.

| Measurement    | Grouping                                            | Stored counters                                                                   |
| -------------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Enemy deaths   | Level, cause and weapon                             | Number killed; no enemy ID, spawn position or killer identity                     |
| Prince damage  | Cause and source guard/screen or original trap tile | Number of hits and total actual HP lost                                           |
| Prince deaths  | Cause, source, Prince death tile and weapon         | Number of deaths and latest timestamp in this group                               |
| Attempts       | Client, level and day                               | Full starts, partial observations, ends and full completions                      |
| Active play    | Client, level/day and room                          | Active milliseconds, activity counts, room time and visits                        |
| Weapons        | Weapon                                              | Uses and hits                                                                     |
| Other gameplay | Type and item/lesson/change                         | Pickup, tutorial, equipment and environment counters; healing and health upgrades |

Guard damage retains numeric guard ID, current screen and immutable spawn tile; moving within one screen does not
create another group. Trap damage retains original room, tile column/row and tile type, including loose floor origins.
Falls use the supporting tile or departure position when known. Prince death groups also retain the landing/death tile.
Damage and death counters are separate: a fatal hit contributes actual HP once and a death once. Indirect enemy kills
keep their known initiating weapon (such as whip or kick) alongside the final cause. Corpse animations and repeated
callbacks must not count again. Enemy damage/encounter events are not transmitted or stored in the compact model.

## Delivery and idempotency

All requests run asynchronously in the background. Gameplay never waits for the API or MongoDB, and failures show no
player-facing error or change to health, input, inventory, animation, graphics layers, sound or level progression.
The normal batch delay is three seconds after the last relevant event, with a maximum wait of 20 seconds during
continuous activity. Only dirty level/day summaries are sent, with at most 100 summaries and 256 KiB per request.
One request is in flight; timeouts and bounded exponential backoff handle outages. Page-exit delivery is best effort.

Use atomic MongoDB `$max` updates on cumulative counters, addressed by a deterministic document ID and deterministic
group keys. A duplicated snapshot, older delayed snapshot or simultaneous retry cannot increase a count twice or
reduce it. A newer snapshot includes earlier counts, recovering from uncertain acknowledgements. Never use `$inc`
with replayable batches. Acknowledge each summary only after persistence; reject invalid summaries independently.

Group lists are bounded at 128 entries each. Reserve an `other` bucket for unusually varied custom maps while retaining
total deaths and HP. The bounded local notification queue has no durable offline storage. Unsaved data can be lost on
reload/close or opt-out; this remains observational telemetry. Snapshot size grows with distinct groups, not kills.
The server validates identities, dimensions, numeric bounds, totals, timestamps and request size, and applies rate and
origin limits. Client data is untrusted and cannot establish an authoritative competitive leaderboard.

## Activity and preference

Record every playable level start, including restarts. Every 20 seconds, accumulate an activity report only if meaningful
player movement or an action occurred since the previous report. Simulation, unattended enemies, menus, tutorials,
pause, hidden tabs and unfocused pages must not manufacture activity. Active-time deltas are summed once; level exit
adds only the remaining unreported time. A partial observation never fabricates a full start/completion.

The existing upper-right menu contains `Send gameplay statistics`, default enabled. Its saved preference applies
immediately: disabling clears unsent summaries, notification queues and retry/activity state, and aborts pending requests
where possible. Already accepted data cannot be recalled. Enabling starts fresh counters and a fresh client ID.

## Server, storage and compatibility

The normal Node.js/Koa server serves the game and `/api/...` routes. Only the server connects to MongoDB, using the
official `mongodb` driver and direct queries: no ODM, ORM or advanced database framework. Heroku supplies
`mongoconnectionurl`; `MONGODB_URI` is the fallback. Credentials stay in server configuration or ignored local `.env`.
Normal storage is `brutalprince.brutalprince`, with `MONGODB_DATABASE` optionally overriding the database.

Summaries use schema version 2, hashed group keys, a unique document ID, and an expiry timestamp 90 days after the end
of their UTC play day. The TTL index removes expired documents asynchronously. Existing version-1 raw documents and
`/api/v1/gameplay-events` remain readable/compatible for already open clients. Reports normalize both formats into
weighted groups; they never expand a count into individual events. No automatic deletion or lossy migration of old
records is required. Older raw documents keep their existing expiry policy.

No names, email, raw keystrokes, screenshots, full URLs, persistent cross-page player IDs, IP addresses or user-agent
strings are stored. Host access logs are separate. Local test credentials must never enter tracked examples or logs.

## Dashboard and test data

`/statistics` and `GET /api/v1/statistics` show counts, daily trends, level performance, death causes, dangerous guards
and traps, weapons and active play. The dashboard reads both storage formats, displays repeated death counts, and
filters periods, levels and gameplay versus samples. It shows the database/collection and refreshes every 15 seconds
while visible and on return. Date filters include complete UTC play days. Completion compares observed starts and
completions in the period, not a cohort of individually tracked attempts.

Dashboard routes and the read-only reporting API are public without authentication, including on Heroku. This replaces
the earlier local-only decision at the user's request. Public hostnames and incoming links from other websites work;
gameplay write requests retain origin checks and validation. The preview serves both game and statistics on localhost;
they share `testbrutalprince.test_dashboard_events`. The `seed` script sends random compact summaries through the real
API, `wipe` drops only this fixed collection, `reset` wipes/seeds it, and `preview` opens existing data without deleting
or generating anything. All generated data is explicitly marked as samples.

Real MongoDB tests create fresh `test_gameplay_events_<random-id>` collections in `testbrutalprince` and clean up only
their own collection. The default test collection and normal gameplay storage remain untouched.

## Consequences and validation

Repeated kills and hits change numeric counters instead of adding documents. Retries need no per-event deduplication
history. We deliberately give up exact enemy histories, individual attempt reconstruction, causal event links and
precise per-hit chronology. Guard/trap comparisons, death locations, weapon counts and daily totals remain available.

Verify large-volume reduction; guard/tile grouping; repeated deaths; day/revision separation; identity and opt-out;
newer, older, duplicate and concurrent snapshots; mixed legacy/compact reports; sample seeding; silent failures and
idle activity. Reuse existing combat/animation/inventory/progression checks, and keep browser verification muted.

Setup, API examples, queries and commands are in [statistics documentation](../../docs/statistics.md). Gameplay and
telemetry requirements are recorded in the root [ruleset](../../ruleset.md).
