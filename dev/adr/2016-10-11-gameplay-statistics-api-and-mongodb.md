# ADR 2016-10-11: Gameplay statistics through an API backed by MongoDB

- Status: Proposed
- Date: 2016-10-11
- Scope: Architecture and event contract only; no implementation in this change.

## Context

We want to count enemy deaths and Prince deaths and retain enough detail to explore gameplay later. Totals alone cannot
tell us which guard is dangerous, where players struggle, or whether a death was caused by a weapon, trap, or fall.
The browser currently runs the game without a statistics backend. Existing actor signals report health loss and death,
but do not carry sufficient causal context for these questions. Guards already receive a numeric `id` in `src/Game.js`.
The map provides room IDs and tile coordinates; the camera can show several rooms at once.

The requested requirements are:

- Record each enemy death, including level and how the enemy was killed.
- Record how much health each identified guard removes from the Prince and the guard's room/screen.
- Identify environmental damage and deaths by level and position, including falling floor tiles and spikes.
- Record each Prince death, its level, and its cause.
- Record when a level starts, including a new attempt after a restart.
- Every 20 seconds, report continuing play only if meaningful gameplay happened since the previous update. An unattended
  game must not produce continuing-play reports.
- Allow statistics transmission to be disabled in the existing menu in the upper-right corner.
- Send statistics through an API that writes to MongoDB.
- Use the official MongoDB Node.js driver and direct MongoDB queries; do not introduce an ODM or an advanced database framework.
- Provide a normal Node.js server using the Koa framework, with API URLs under `/api/...` alongside the existing game.
  Only this server communicates with MongoDB; clients never connect to the database.
- All statistics requests run asynchronously in the background. Failed requests have no effect on the game and show
  no player-facing error. Send events in batches, normally three seconds after the last recorded event.

The choices below are proposed engineering decisions, including the additional statistics. They are not claims that
these features already exist or changes to existing gameplay decisions in the root `ruleset.md`.

## Decision

Use versioned gameplay events as the source of truth. The browser records compact events and sends batches over HTTPS
to a Koa statistics API under the game's `/api/...` URLs. Only the API connects to MongoDB. Derive counters and exploratory reports from accepted events,
rather than sending independent browser totals that could drift from the underlying records.

```text
Gameplay transitions -> telemetry recorder -> bounded queue -> HTTPS /api/... (Koa) -> MongoDB events
                                                                            |
                                                               later queries / aggregates
```

Gameplay must never wait for the API or database. An unavailable backend must not affect health, combat, input,
inventory, animation, rendering, tutorials, sound, or level progression. There are no database credentials or privileged
API secrets in the browser. Building a dashboard or adding visible in-game counters is outside this ADR's implementation
scope; the death counters are initially analytical counts derived from stored events.

### Identity and location

| Field                                 | Meaning                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`                       | Version of the event contract, initially `1`.                                                                   |
| `gameVersion`                         | Build/revision identifier, not just the package version.                                                        |
| `mapId`, `mapRevision`, `levelNumber` | Map identity, revision of map and spawn definitions, and played level. Separate custom maps from campaign maps. |
| `sessionId`                           | Random page-session ID. New on reload; no persistent player identity is required.                               |
| `campaignId`                          | Random ID for a new game or resumed campaign within that session.                                               |
| `attemptId`                           | Random ID for each level entry or restart, including repeated attempts at the same level.                       |
| `eventId`, `sequence`                 | Random event ID and increasing sequence within the session. Preserve both on retries.                           |
| `occurredAt`, `receivedAt`            | Client UTC timestamp and independently assigned server UTC timestamp.                                           |
| `attemptElapsedMs`                    | Monotonic elapsed gameplay time excluding pauses; separate from the campaign countdown.                         |
| `roomId`, `tileColumn`, `tileRow`     | The original room/screen ID and zero-based local tile coordinates, columns `0..9`, rows `0..2`.                 |

The stable guard key is `(mapId, mapRevision, levelNumber, guardId)`. Reuse the existing numeric guard ID only where spawn
ordering is deterministic within that revision. Preserve the spawn room/tile as immutable metadata and record the
current source room/tile on each event: a pursuing guard can hurt the Prince somewhere other than its spawn room.
If dynamic spawning is introduced, reserve deterministic spawn slots and distinguish each instance within an attempt.
Never identify a guard by its current position alone or compare bare numeric IDs across map revisions.

Environmental sources use `(mapId, mapRevision, levelNumber, roomId, tileColumn, tileRow, tileType)` instead of a special
tile ID. A falling loose floor keeps its original tile key after leaving its room; also record its impact position.
For a fall, record the departure position and landing/death position, and the supporting tile when known.
Do not invent a tile cause when it is unavailable.

Event location describes the victim or player at the time of the event. `source` separately describes the damaging actor,
tile, or other cause. A screen means a map room, never a viewport pixel coordinate or screenshot; camera movement must
not change attribution.

### Core events

| Event            | When recorded                                                                                | Important payload                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level_started`  | A playable level is initialized once per attempt, rather than on loading or camera changes.  | Entry reason (`new_game`, `progression`, `restart`, `resume`, `debug_skip`), spawn location, starting/current maximum health, inventory, tutorial state. |
| `level_activity` | At most once per 20-second reporting window, subject to the activity rules below.            | Window ID and duration, meaningful activity count, active-play milliseconds, room-time deltas, current room/health, cumulative attempt active time.      |
| `prince_damaged` | Health actually decreases.                                                                   | Health before/after, actual HP lost, damage mechanism, source, player location, selected weapon and current action.                                      |
| `prince_died`    | The Prince transitions from alive to dead.                                                   | Final cause/source, location, health before death, linked damage event when present, relevant causal chain, attempt active time.                         |
| `enemy_damaged`  | A living enemy actually loses health.                                                        | Guard key/type, source, location, health before/after and HP lost.                                                                                       |
| `enemy_died`     | An enemy transitions from combat-alive to combat-dead.                                       | Guard key/type, spawn and death locations, final mechanism, source/weapon, causal chain, health before death.                                            |
| `level_ended`    | An attempt completes, the player restarts, starts a new game, dies, or explicitly leaves it. | Outcome (`completed`, `prince_died`, `restarted`, `new_game`, `skipped`, `left`), destination level if any, active time, final location/health.          |

Record a Prince death separately from attempt outcome. A dead Prince waiting for the continue prompt must not generate
another death or keep the attempt active. A restart after that death creates a new attempt without ending the old one
twice. Failed level loading and intro/finale animations are not playable level starts. Emit departure/closure events
only when actually observed; a browser termination may prevent delivery. An attempt with no terminal event is
`unknown/incomplete`, not automatically a death, completed level, or proven abandonment.

### Damage, death, and causal attribution

Record actual health loss (`healthBefore - healthAfter`), not nominal weapon damage, blood effects, hit attempts, or
death animation frames. Clamp overkill to remaining health. A fatal health change can produce a damage event and a death
event linked to it; sum health loss from damage events only, and count deaths from death events only.

Use explicit source context at the point where gameplay commits damage or death. Existing `onDamageLife` and `onDead`
signals alone are insufficient: death callbacks may be delayed, and source actors/tiles may have moved by then.
Snapshot the context immediately and keep existing signals and animation behavior intact. Cover alternate instant-death
paths as well as ordinary damage; missing attribution becomes `unknown`, rather than a guessed nearby opponent.

Keep these concepts separate:

- `mechanism`: immediate effect, such as `sword`, `bullet`, `explosion`, `fire`, `fall`, `spikes`, `chopper`,
  `falling_floor`, `poison`, `shared_shadow_damage`, or `scripted_health_loss`.
- `source`: `guard`, `prince`, `tile`, `environment`, `script`, or `unknown`, with the applicable actor or tile key.
- `weapon`: originating weapon when relevant, such as `twin_torches`, `molotov`, `minigun`, `rocket_launcher`,
  `whip`, `kick`, or `sword`.
- `causalChain`: known initiating action/source and intermediate effects, with event/action references. For example,
  `Prince -> whip pull -> fall -> spikes` has spikes as the final mechanism and the whip as the initiating action.
  Attribution follows tracked consequences, not a blanket rule assigning every later death to the last attacker.

Important compatibility cases from `ruleset.md`:

- Fire kills an enemy immediately for combat purposes (`ENEMY-06`, `MOLO-08`, `TORCH-06`). Record one enemy death at
  ignition. Its later collapse, fall, impalement, corpse fragments, or explosion effects cannot count as another kill.
  Optional corpse-outcome events can describe these effects separately.
- A kick, domino collision, or cosmetic blood does not itself remove health (`KICK-01`, `KICK-06`). It may initiate a
  tracked chain ending in an actual environmental death; protected short falls must not become damage events.
- A whip can cause direct damage or pull an enemy into a damaging/fatal fall (`WHIP-02` through `WHIP-05`). Preserve both
  the immediate mechanism and the known initiating action, without duplicating damage during recovery.
- Shadow damage/death is shared (`ENEMY-08`). Record the actual health change of each affected actor, link the reflected
  effect to its origin, and count at most one Prince death. Merging with the shadow is not an enemy kill.
- Skeletons or other special actors must follow their existing alive/dead rules. A knockdown, reset, or scripted removal
  is not a death unless gameplay declares one. Tag enemy type so ordinary guard reports can exclude special actors.
- Scripted reductions such as `stealLife()` are distinct from guard damage; healing and maximum-health changes must
  not look like negative damage. Ten starting HP and growth beyond ten remain intact (`HEALTH-01`).

### Additional statistics for later exploration

Keep useful discrete events and compact activity deltas rather than recording every frame or raw input:

| Event / measurement                                              | Questions supported                                                                                                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `room_entered` and active room-time deltas                       | Which routes are used, where players spend active time, and where damage/death hotspots are.                                                                                         |
| `guard_encountered`                                              | How often a guard is actually encountered, providing a denominator for damage and kill rates. Use actual visible/reachable threat conditions, respecting the passive tutorial guard. |
| `weapon_used` and aggregated shot/hit counts                     | Weapon popularity, hits per shot, damage and kills by weapon, and failed attacks. A burst accumulates counts; it does not generate one request per bullet.                           |
| `item_collected`, `health_recovered`, `max_health_changed`       | Pickup use, potion effectiveness, healing capped by maximum health, and health progression.                                                                                          |
| `tutorial_started`, `tutorial_completed`, `tutorial_interrupted` | Where lessons are reached or interrupted, without counting tutorial reading time as active gameplay.                                                                                 |
| `environment_changed`                                            | Exit destruction, other barrier destruction, and loose-floor activation/destruction, identified by original tile position.                                                           |
| `jetpack_changed`, `shadow_merged`, `campaign_completed`         | Equipment use and important progression milestones.                                                                                                                                  |

Define an encounter as the first meaningful exposure to a given guard instance in an attempt. Repeated room visits do not
increase this denominator. Track optional engagement duration separately. Autonomous cosmetic animation, particle motion,
music, camera settling, and campaign countdown changes are not activity or extra events.

These additions enable enemy/Prince death counts by level, room and cause; guard rankings by total HP removed, Prince
kills, and damage per encountered attempt; trap rankings and heatmaps; weapon efficiency; retries before completion;
active completion-time distributions; and tutorial/item funnels. Report sample sizes, revisions, partial observations,
and missing data alongside rates. Counts describe observed opted-in gameplay, not all players or guaranteed unique people.

### Twenty-second activity reporting

Use a 20-second monotonic wall-clock reporting cadence while a playable attempt exists. A reporting window becomes
dirty only after meaningful gameplay: actual Prince movement, a room change, a performed gameplay action, or a committed
gameplay event during active play. Held movement/fire counts while it produces actual actions. Raw key repeats, moving
the mouse, opening settings, pressing against a wall without movement, or simply advancing simulation time do not count.

Continuing-play reports require a visible, focused, unpaused game with a living Prince and meaningful activity in the
window. Track recent actual player activity; autonomous enemy patrols/attacks and unattended world simulation alone
cannot extend active presence indefinitely. Consequences of a recently performed action may dirty the window, but
cosmetic corpse motion cannot. Cap the recent-player-activity grace period at 20 seconds as an engineering choice.
Count active milliseconds only while these conditions hold, capped by each window's elapsed duration.

At each tick:

1. If the window is eligible and dirty, enqueue one `level_activity` event containing the accumulated deltas.
2. Otherwise, enqueue no continuing-play report. Discard stale presence windows on pause, loss of focus, or hidden tabs;
   resuming does not send catch-up heartbeats for time spent away.
3. Begin a fresh window. Retain already recorded discrete gameplay events independently of the presence window.

The initial `level_started` is recorded immediately, then sent using the batch policy below; it does not by itself make the following window dirty. A discrete event that
was already sent still counts as activity for its current window; clearing a network queue must not clear the activity
marker. Conversely, network retries never create activity. Small actions between ticks count even if the Prince is
standing still at the tick. Terminal events carry any remaining active-time deltas, so short attempts are represented
without waiting 20 seconds or double-counting time.

Suspend background transmission on hidden/unfocused pages; already captured discrete events may be flushed on return.
Death and other discrete observations remain different from assertions of continuing play. Test explicitly that an
untouched game, including automatic guard movement and effects, produces no periodic presence reports.

### API and MongoDB storage

Use a normal Node.js HTTP server implemented with **Koa**. Expose the API under `/api/...` on the same public origin as
the game, alongside the existing page and assets. The browser uses relative API URLs; deployment can serve the game
through the Koa server or route `/api/...` to it through a reverse proxy. Preserve the current game URLs and asset paths.
Reserve `/api/...` for API handlers; an unknown API route must return an API error rather than falling through to a game
page. Koa is a user-selected framework, not an open implementation choice.

Proposed endpoint: `POST /api/v1/gameplay-events`, with `{ "schemaVersion": 1, "events": [...] }`. Each event contains
the identity envelope above plus an event-specific payload. All events, including level starts, deaths, terminal events,
and activity reports, use the asynchronous batch transport below. Suppressing an idle heartbeat does not prevent
delivery of a queued real event.

#### Server-only MongoDB configuration

Use the official `mongodb` Node.js driver directly for connections, collection operations, bulk writes, indexes, and
aggregation queries. Keep documents and queries explicit, with validation in the API. Do not introduce Mongoose,
Prisma, an ODM/ORM, or another database abstraction framework. This is a user-selected constraint on MongoDB access;
Koa remains the HTTP framework.

The supplied connection URI template is:

```text
mongodb+srv://liborvilimek_db_user:{mongo_password}@brutalprince.yartwde.mongodb.net/?appName=brutalprince
```

Configure the resolved URI as the server's `MONGODB_URI` environment variable using a deployment secret. Replace
`{mongo_password}` with the actual password, correctly encoded as a URI credential; this literal placeholder is not a
working password. Never commit the resolved URI, include it in frontend code/assets or responses, or log it on errors.
The URI does not select an application database, so configure that explicitly through `MONGODB_DATABASE`; its name
remains to be chosen. Reuse a server-side MongoDB client/connection pool rather than connecting for every browser event.
No database connection or deployment is performed as part of this documentation change.

#### Asynchronous background batching and failure behavior

Record an event locally when its gameplay transition occurs, enqueue it, and return immediately to the game. Never await
a network request from a gameplay update, input handler, animation, or level transition. Use asynchronous browser HTTP
requests and asynchronous MongoDB operations in Koa; the API may await persistence before acknowledging the batch,
while the browser continues playing independently.

The normal send rule is a **three-second trailing debounce**: the first queued event starts a timer, and each newly
recorded event resets it. After three seconds without a new event, send the pending events in one batch request, within
the configured batch bounds. This rule applies to deaths and level starts too; priority affects queue retention, not
an immediate per-event request. Events recorded during an in-flight request go into the next batch. Split an oversized
backlog into bounded requests, retaining one in-flight request at a time.

A pure trailing debounce could postpone transmission forever during continuous play. As an additional engineering
proposal, cap the wait at 20 seconds from the oldest queued event and flush a full batch when its size limit is reached.
These caps keep the queue bounded; the normal quiet-period rule remains three seconds. A 20-second `level_activity`
event is an activity observation, not a separate transport timer or a forced per-event request. It enters the same queue
and is normally sent three seconds later; the cadence describes observation time rather than exact network arrival time.

Network errors, timeouts, API rejection, and MongoDB failure are contained within the telemetry subsystem. No alert,
modal, gameplay interruption, health change, or progression change follows a statistics failure. Catch asynchronous
errors, bound request duration, and use the retry/overflow policy below; failure may ultimately lose statistics.
Retries preserve event IDs and use their own backoff schedule, without generating gameplay activity or restarting the
event debounce. Development diagnostics may describe failures without exposing credentials or showing errors to players.
Background means independent of gameplay execution; the existing hidden/unfocused-page suspension and opt-out rules
still apply. Page-exit flushing may attempt an earlier best-effort batch, but must never delay leaving or navigating.

The API validates event types, versions, field types, coordinate/health bounds, string lengths, timestamps, and batch
size before writing. Apply request limits and rate limits; restrict browser origins if the API is hosted separately.
Origin checks are not proof that a client is genuine. Client statistics remain untrusted and unsuitable for authoritative
competitive leaderboards. The API assigns `receivedAt`; sequence and monotonic attempt time help reconstruct order despite
late arrivals or clock skew. Hosting, reverse-proxy/static-serving arrangement, database name, and deployment secrets
remain deployment choices to settle before implementation; Node.js, Koa, the `/api/...` prefix, and the MongoDB cluster
above are now specified.

Store one accepted event per MongoDB document in `gameplay_events`, preserving the original versioned payload:

- Unique index on `eventId` for retry deduplication.
- A conditional unique semantic key for death events, `(attemptId, eventType, victimInstanceId)`, to prevent different
  callbacks from recording the same death with different event IDs. Apply a similar once-per-attempt key to start/end.
- Query indexes on `(mapId, mapRevision, levelNumber, eventType, receivedAt)`, `(attemptId, sequence)`, and source guard
  or tile keys for damage/death queries. Final index selection follows the actual query patterns and data volume.

The response acknowledges each event as stored, already stored, or rejected. Acknowledge success only after persistence;
retrying after an uncertain response must be safe. A duplicate with incompatible content is a conflict, not a second
record. Mixed batches must report per-event results so invalid events cannot block valid ones indefinitely. Derive
initial counts through aggregation; later materialized summaries must remain rebuildable and deduplicated.

Use a bounded in-memory client queue, one in-flight batch, exponential backoff with jitter for transient failures, and
server retry guidance for rate limits. Retry the same event IDs; discard/report permanently invalid events locally.
Suggested initial bounds are 100 events per request, 256 KiB per request, and 1,000 queued events per tab, to be tuned
before release. Coalesce high-volume measurements, prioritize deaths/start/end when the queue fills, and include an
explicit dropped-event count with the next accepted batch. Never let a backlog grow indefinitely. Page-exit flushing is
best effort only. Events lost on reload, closed tabs, offline overflow, or disabled tracking are an acknowledged limitation.

### Player setting and data boundaries

Add a clearly labeled `Send gameplay statistics` toggle to the existing upper-right settings menu, with a short
explanation of death, damage, level, and activity collection. Reuse `GameSettings` persistence and its in-memory fallback
when localStorage is unavailable. The proposed default is enabled, interpreting the requested switch as an opt-out;
this is an engineering proposal, not an explicitly requested default.

Disabling takes effect immediately: stop recording and sending, cancel timers/retries, clear all queued events and
activity deltas, and abort in-flight requests where possible. A request already accepted by the server cannot be recalled.
Reloads and new campaigns preserve the saved choice. No opt-out event is transmitted after disabling.

Re-enabling starts a fresh telemetry segment with new identifiers and no replay of the disabled interval. If a level is
already in progress, record `level_observation_started` with `reason: tracking_enabled`, current state, and a partial-attempt
flag; do not fabricate a `level_started` or claim the missing time, damage, or deaths were observed. Link subsequent
events to that observed attempt and exclude it from full-attempt funnels by default.

Do not collect names, email addresses, keystroke logs, screenshots, full URLs/resume links, or persistent cross-session
player IDs. Store only gameplay context and coarse input mode (`keyboard`, `touch`, `mixed`) if useful. Do not persist IP
addresses or user-agent strings in gameplay documents; infrastructure logs require a separately configured policy.
Propose 90 days of raw events using an expiry timestamp/TTL policy, retaining only anonymous aggregate totals longer.
Confirm retention, deployment logging, and the enabled-by-default choice before releasing the implementation.

## Alternatives considered

- **Browser connects directly to MongoDB:** rejected; it exposes database access to untrusted clients and bypasses the
  server's validation and limits.
- **Send only cumulative death counters:** rejected; insufficient for attribution, exploratory statistics, and reliable
  retry handling. Summaries can be derived from events.
- **Send every frame or unconditional heartbeats:** rejected; unnecessary volume and false evidence of active play.
- **Infer cause from animation names or the nearest enemy:** rejected; ambiguous for fire, falls, delayed callbacks,
  explosions, reflected shadow damage, and moving floor tiles.
- **Guaranteed delivery through durable offline storage:** deferred; persistent queues add lifecycle and opt-out
  complexity. The first version explicitly accepts bounded, measurable event loss.

## Consequences

This design supports both the requested counters and later investigations without forcing database migrations for each
new report. Explicit causal context and stable map-scoped identities make guard/trap comparisons meaningful. It also
requires a hosted API, database operations, instrumentation across multiple health/death paths, and careful queue and
activity lifecycle handling. Client opt-out and best-effort delivery mean statistics are observational and incomplete.

## Implementation and acceptance plan (future work)

1. Finalize deployment, setting default, retention, schema, and deterministic guard/spawn identity. Add the accepted
   telemetry rules to `ruleset.md` and update settings/help documentation when implementation is authorized.
2. Implement the Node.js/Koa server under `/api/...`, using the official `mongodb` driver and direct queries,
   server-only MongoDB configuration, validation, batch
   acknowledgements, persistence, idempotency, limits, and configured indexes.
3. Add the isolated recorder and setting, then instrument health/death transitions with explicit causal context.
4. Add activity windows and the additional event catalogue. Start with death/damage/start/activity/opt-out coverage;
   keep reporting queries separate from gameplay code.
5. Verify at least these scenarios:
   - Each weapon, fire ignition plus later corpse effects, direct and indirect falls, spikes, choppers, and loose floors.
   - Actual guard HP loss, fatal overkill, blocked attacks, kick immunity, healing, scripted health loss, shadow reflection
     and merge, and skeleton special behavior.
   - One death per actor instance, prompt Prince-death capture before animation callbacks, restart/progression/resume,
     custom maps, and attribution after crossing rooms or moving the camera.
   - Active continuous play reports about every 20 seconds; short actions still mark a window. Standing idle, wall input,
     unattended enemies/effects, menus, tutorials, pause, blur, and hidden tabs produce no false ongoing-play reports.
   - Network errors, MongoDB failure, uncertain acknowledgements, duplicate and mixed-invalid batches, rate limiting,
     out-of-order arrivals, queue overflow, and a short attempt ending before the first activity tick.
   - Three-second trailing debounce for every event type, timer reset on new events, continuous-play maximum wait,
     batch splitting, events arriving during a request, bounded retries/timeouts, and silent failure without unhandled
     promise rejections or gameplay delays.
   - Same-origin `/api/...` routing alongside the existing game/assets, server-only MongoDB access, and no resolved
     database credentials in client artifacts, responses, or logs.
   - Opt-out with queued/in-flight data, reload persistence, unavailable storage, and mid-attempt opt-in with partial
     coverage and no historical replay.
   - Existing controls, inventory, animations, graphics layers, campaign time, and level transitions remain compliant
     with `ruleset.md`. Browser verification keeps sound muted, per `WORK-04`.

This ADR creates no API, MongoDB deployment, instrumentation, menu toggle, or behavioral changes.
