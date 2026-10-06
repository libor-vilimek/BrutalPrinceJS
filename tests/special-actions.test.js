"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture() {
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189 };
  const context = vm.createContext({
    PrinceJS,
    Phaser: { Sprite: function () {}, Keyboard: { F: 70, CONTROL: 17, ONE: 49, TWO: 50, THREE: 51, J: 74 } }
  });
  for (const file of ["Utils", "Actor", "Fighter", "Kid", "Game"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const calls = [];
  const kid = Object.assign(Object.create(PrinceJS.Kid.prototype), {
    alive: true,
    active: true,
    visible: true,
    specialAction: null,
    action: "running",
    charX: 60,
    charY: 116,
    charXVel: 5,
    charYVel: 2,
    sword: { visible: true },
    anims: JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/anims/kid.json"), "utf8"))
  });
  for (const method of [
    "updateTimer",
    "updateSplash",
    "updateBehaviour",
    "updateAcceleration",
    "updateVelocity",
    "checkFight",
    "checkSpikes",
    "checkChoppers",
    "checkBarrier",
    "checkButton",
    "checkFloor",
    "checkRoomChange",
    "updateCharPosition",
    "updateSwordPosition",
    "maskAndCrop"
  ]) {
    kid[method] = () => calls.push(method);
  }
  kid.processCommand = () => {
    calls.push("processCommand");
    kid.charX += 5;
  };
  return { PrinceJS, kid, calls };
}

test("drawing or throwing freezes movement while world hazards and character timers stay active", () => {
  const { kid, calls } = fixture();
  const owner = {};
  assert.equal(kid.beginSpecialAction(owner, "minigun"), true);
  const x = kid.charX;
  kid.updateActor();
  assert.equal(kid.charX, x);
  assert.equal(kid.charXVel, 0);
  assert.equal(kid.charYVel, 0);
  assert.equal(kid.sword.visible, false);
  for (const method of ["updateTimer", "checkSpikes", "checkChoppers", "checkFloor"]) {
    assert.ok(calls.includes(method));
  }
  assert.ok(!calls.includes("updateBehaviour"));
  assert.ok(!calls.includes("processCommand"));
  assert.equal(kid.endSpecialAction(owner), true);
  kid.updateActor();
  assert.equal(kid.charX, x + 5);
});

test("flight keeps hazards active and leaves floor, room and movement physics to the flight controller", () => {
  const { kid, calls } = fixture();
  kid.beginSpecialAction({}, "jetpack");
  kid.updateActor();
  assert.ok(calls.includes("checkSpikes"));
  assert.ok(calls.includes("checkChoppers"));
  for (const method of ["checkFloor", "checkButton", "checkRoomChange", "checkBarrier", "updateVelocity"]) {
    assert.ok(!calls.includes(method));
  }
});

test("another controller cannot steal or release an active action, and death resumes the original animation", () => {
  const { kid, calls } = fixture();
  const owner = {};
  kid.beginSpecialAction(owner, "molotov");
  assert.equal(kid.beginSpecialAction({}, "jetpack"), false);
  assert.equal(kid.endSpecialAction({}), false);
  assert.equal(kid.specialAction.owner, owner);
  kid.alive = false;
  kid.action = "dropdead";
  kid.updateActor();
  assert.ok(calls.includes("processCommand"));
  assert.equal(kid.beginSpecialAction({}, "minigun"), false);
});

test("Ctrl handles only the selected weapon; molotov charges on ground or ledge and releases after both triggers are up", () => {
  const { PrinceJS, kid } = fixture();
  const calls = [];
  const state = Object.assign(Object.create(PrinceJS.Game.prototype), {
    kid,
    molotov: {
      spec: { id: "molotov", equipped: "molotovEquipped" },
      equip: () => (kid.molotovEquipped = true),
      beginCharge: () => calls.push("charge"),
      triggerDown: () => held,
      releaseThrow: () => calls.push("release")
    },
    weapons: [
      {
        spec: { id: "minigun", equipped: "minigunEquipped" },
        equip: () => {
          kid.minigunEquipped = true;
          calls.push("gun");
        }
      }
    ],
    jetpack: { toggle: () => calls.push("jetpack") }
  });
  let held = true;
  state.weapons.unshift(state.molotov);
  kid.activeWeapon = "molotov";
  kid.action = "stand";
  state.handleWeaponControl();
  state.handleWeaponRelease();
  assert.deepEqual(calls, ["charge"]);
  held = false;
  state.handleWeaponRelease();
  assert.deepEqual(calls, ["charge", "release"]);
  kid.action = "hangstraight";
  state.handleWeaponControl();
  assert.deepEqual(calls, ["charge", "release", "charge"]);
  kid.activeWeapon = "minigun";
  kid.action = "stand";
  state.handleWeaponControl();
  state.handleWeaponControl();
  state.toggleJetpack();
  assert.deepEqual(calls, ["charge", "release", "charge", "gun", "jetpack"]);
});

test("weapon selection respects throw and stow locks, preserves flight ownership, and uses a molotov-specific instruction", () => {
  const { PrinceJS, kid } = fixture();
  const messages = [];
  const molotov = {
    spec: { id: "molotov", owned: "hasMolotov", label: "MOLOTOV" },
    equip: () => {
      kid.activeWeapon = "molotov";
      return true;
    }
  };
  const state = Object.assign(Object.create(PrinceJS.Game.prototype), {
    kid,
    weapons: [molotov],
    ui: { showText: (text) => messages.push(text) }
  });
  kid.hasMolotov = true;
  for (const stage of ["throwing", "holstering"]) {
    molotov.actionStage = stage;
    kid.specialAction = { owner: molotov };
    state.selectWeapon("molotov");
  }
  kid.specialAction = { owner: { actionStage: "flying" }, type: "jetpack" };
  state.selectWeapon("molotov");
  assert.equal(messages.length, 0);
  kid.specialAction = null;
  state.selectWeapon("molotov");
  assert.equal(kid.activeWeapon, "molotov");
  assert.match(messages[0], /HOLD CTRL\/F, RELEASE/);
});

test("render updates and shutdown manage the molotov once through the shared inventory", () => {
  const { PrinceJS, kid } = fixture();
  const calls = [];
  const molotov = { update: () => calls.push("update"), destroy: () => calls.push("destroy") };
  PrinceJS.Utils.continueGame = () => false;
  const state = Object.assign(Object.create(PrinceJS.Game.prototype), {
    kid,
    molotov,
    weapons: [molotov],
    game: {
      time: { elapsedMS: 16 },
      onPause: { remove() {} },
      onResume: { remove() {} }
    },
    input: { keyboard: { removeKey() {} } },
    updateCamera() {}
  });
  state.update();
  assert.deepEqual(calls, ["update"]);
  state.shutdown();
  assert.deepEqual(calls, ["update", "destroy"]);
  assert.equal(state.molotov, null);
});
