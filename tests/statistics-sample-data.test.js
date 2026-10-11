"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { sampleEvents } = require("../tools/statistics-sample-data");
const { validateEvent, semanticKey } = require("../server/events");

test("sample gameplay passes the real event contract with unique events and one start/end/death per attempt", () => {
  const events = sampleEvents(100);
  const ids = new Set();
  const semantics = new Set();
  for (const event of events) {
    assert.equal(validateEvent(event), null, event.eventType);
    assert(!ids.has(event.eventId));
    ids.add(event.eventId);
    const key = semanticKey(event);
    if (key) {
      assert(!semantics.has(key));
      semantics.add(key);
    }
  }
  assert.equal(events.filter((event) => event.eventType === "level_ended").length, 100);
  assert(events.some((event) => event.eventType === "level_activity"));
  assert(events.some((event) => event.partialAttempt));
});
