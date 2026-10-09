"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function fixture(number = 2, map = null) {
  class Display {
    constructor(x = 0, y = 0, key, frameName) {
      Object.assign(this, { x, y, key, frameName, visible: true, tint: 0xffffff, width: 60, height: 79 });
      this.scale = { x: 1, y: 1 };
      this.anchor = { setTo() {} };
      this.children = [];
      this.shapes = [];
    }
    clear() {
      this.shapes.length = 0;
    }
    beginFill(color, alpha) {
      this.color = color;
      this.alpha = alpha;
    }
    drawRect(x, y, width, height) {
      this.shapes.push({ type: "rect", color: this.color, alpha: this.alpha, x, y, width, height });
    }
    drawCircle(x, y, diameter) {
      this.shapes.push({ type: "circle", color: this.color, alpha: this.alpha, x, y, diameter });
    }
    endFill() {}
    addChild(child) {
      this.children.push(child);
    }
    crop(rect) {
      this.cropRect = rect;
    }
    destroy() {
      this.destroyed = true;
      this.children.forEach((child) => child.destroy());
    }
  }
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63, currentLevel: number };
  const context = vm.createContext({
    PrinceJS,
    Phaser: {
      Sprite: function () {},
      Rectangle: function (x, y, width, height) {
        Object.assign(this, { x, y, width, height });
      },
      Animation: { generateFrameNames: () => Array.from({ length: 9 }, (_, i) => "fire_" + (i + 1)) }
    }
  });
  for (const file of [
    "Utils",
    "Actor",
    "Fighter",
    "Kid",
    "Level",
    "tiles/Base",
    "tiles/Gate",
    "tiles/Torch",
    "GorePhysics",
    "PrincePose",
    "TwinTorchesEffects",
    "TwinTorches"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", file + ".js"), "utf8"), context);
  }
  const sounds = [];
  const game = {
    add: { graphics: (...args) => new Display(...args), sprite: (...args) => new Display(...args) },
    make: { sprite: (...args) => new Display(...args) },
    rnd: { between: () => 0 },
    sound: { play: (...args) => sounds.push(args) }
  };
  const level = Object.create(PrinceJS.Level.prototype);
  level.number = number;
  level.rooms = [];
  level.dummyWall = Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: 20 });
  const setTile = (room, column, row, element = 1, posY = 0) => {
    let tile;
    if (element === 19) {
      tile = new PrinceJS.Tile.Torch(game, element, 0, 0);
    } else {
      tile = Object.assign(Object.create(element === 4 ? PrinceJS.Tile.Gate.prototype : PrinceJS.Tile.Base.prototype), {
        element: element,
        back: new Display(),
        front: new Display(),
        posY: posY
      });
    }
    Object.assign(tile, { room, roomX: column, roomY: row, key: "dungeon" });
    tile.x = level.rooms[room].x * 320 + column * 32;
    tile.y = level.rooms[room].y * 189 + row * 63 - 13;
    level.rooms[room].tiles[row * 10 + column] = tile;
    return tile;
  };
  if (map) {
    map.room.forEach((room, index) => {
      if (room.id < 1) {
        return;
      }
      const x = index % map.size.width;
      const y = Math.floor(index / map.size.width);
      const roomAt = (dx, dy) => {
        let targetX = x + dx;
        let targetY = y + dy;
        return targetX >= 0 && targetX < map.size.width && targetY >= 0 && targetY < map.size.height
          ? map.room[targetY * map.size.width + targetX].id
          : -1;
      };
      level.rooms[room.id] = {
        x,
        y,
        links: { left: roomAt(-1, 0), right: roomAt(1, 0), up: roomAt(0, -1), down: roomAt(0, 1) },
        tiles: []
      };
    });
    map.room.forEach((room) => {
      if (room.id > 0) {
        room.tile.forEach((tile, location) => setTile(room.id, location % 10, Math.floor(location / 10), tile.element));
      }
    });
  } else {
    level.rooms[1] = { x: 0, y: 0, links: { left: -1, right: 2, up: -1, down: -1 }, tiles: [] };
    level.rooms[2] = { x: 1, y: 0, links: { left: 1, right: -1, up: -1, down: -1 }, tiles: [] };
    for (const room of [1, 2]) {
      for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 10; column++) {
          setTile(room, column, row, row === 1 ? 1 : 0);
        }
      }
    }
  }
  const roomId = map ? map.prince.room : 1;
  const room = level.rooms[roomId];
  const kid = Object.assign(Object.create(PrinceJS.Kid.prototype), {
    game,
    level,
    room: roomId,
    baseX: room.x * 320,
    baseY: room.y * 189 + 3,
    charX: 56,
    charY: 116,
    charBlockX: 4,
    charBlockY: 1,
    charFace: 1,
    charFdx: 0,
    charFdy: 0,
    charFfoot: 3,
    charName: "kid",
    anims: JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/anims/kid.json"), "utf8")),
    action: "stand",
    actionCode: 0,
    alive: true,
    active: true,
    visible: true,
    hasTwinTorches: true,
    twinTorchesEquipped: true,
    activeWeapon: "twinTorches",
    health: 3,
    tint: 0xffffff,
    specialAction: null,
    sword: { visible: false },
    keyWeaponAction: () => false,
    onChangeRoom: { dispatch: (...args) => roomChanges.push(args) },
    onDamageLife: { dispatch: (damage) => damageEvents.push(damage) },
    showSplash() {
      this.splashes = (this.splashes || 0) + 1;
    },
    hideSplash() {},
    bringAboveOpponent() {},
    crop(rect) {
      this.cropRect = rect;
    }
  });
  const damageEvents = [];
  const roomChanges = [];
  PrinceJS.Utils.flashRedDamage = () => {};
  const key = { isDown: false };
  const ctrlKey = { isDown: false };
  const ignitions = [];
  const delegate = {
    game,
    level,
    kid,
    weaponFireKey: key,
    weaponCtrlKey: ctrlKey,
    enemies: [],
    burningEnemyEffects: {
      ignite(enemy, impact) {
        ignitions.push({ enemy, impact });
        enemy.alive = false;
        enemy.health = 0;
      }
    }
  };
  const weapon = new PrinceJS.TwinTorches(delegate);
  delegate.weapons = [weapon];
  const advance = (seconds) => {
    const frames = Math.ceil(seconds * 60);
    for (let i = 0; i < frames; i++) {
      weapon.update(1 / 60);
    }
  };
  const enemy = (x, y = 119, id = 1) => {
    const enemyRoom = level.rooms[id];
    const target = {
      room: id,
      baseX: enemyRoom.x * 320,
      baseY: enemyRoom.y * 189 + 3,
      charX: x,
      charY: y - 3,
      alive: true,
      active: true,
      visible: true,
      health: 5
    };
    delegate.enemies.push(target);
    return target;
  };
  return {
    PrinceJS,
    weapon,
    effects: weapon.effects,
    kid,
    key,
    ctrlKey,
    delegate,
    level,
    setTile,
    advance,
    enemy,
    sounds,
    ignitions,
    damageEvents,
    roomChanges
  };
}

test("owned idle torches stay put away and Ctrl draws two torches before stationary spinning", () => {
  const f = fixture();
  f.advance(0.5);
  assert.equal(f.effects.body.visible, false);
  assert.equal(f.kid.specialAction, null);
  f.ctrlKey.isDown = true;
  f.advance(0.15);
  assert.equal(f.weapon.actionStage, "drawing");
  assert.equal(f.kid.specialAction.owner, f.weapon);
  assert.equal(f.kid.charXVel, 0);
  assert.equal(f.kid.charYVel, 0);
  assert.equal(f.effects.body.visible, true);
  assert.equal(f.effects.head.frameName, "kid-15");
  assert.equal(f.effects.head.cropRect.width, 12);
  assert.equal(f.effects.head.cropRect.height, 8, "the crop excludes the atlas shoulder pixels");
  const startX = f.kid.charX;
  f.advance(0.3);
  assert.equal(f.weapon.actionStage, "spinning");
  f.advance(1.2);
  assert.equal(f.kid.charX, startX);
  assert.ok(f.effects.back.shapes.some((shape) => shape.color === 0xffe57a));
  assert.ok(f.effects.front.shapes.some((shape) => shape.color === 0xffe57a));
  assert.ok(f.effects.light.shapes.length > 0);
  assert.equal(f.kid.cropRect, f.effects.bodyCrop);
});

test("nonfatal melee damage during draw does not interrupt holding Ctrl; spin deflects later sword strikes", () => {
  const f = fixture();
  f.ctrlKey.isDown = true;
  f.advance(0.12);
  f.kid.stabbed();
  assert.equal(f.kid.health, 2);
  assert.deepEqual(f.damageEvents, [1]);
  assert.equal(f.kid.action, "stand");
  assert.equal(f.weapon.actionStage, "drawing");
  assert.equal(f.kid.specialAction.owner, f.weapon);
  f.advance(0.35);
  assert.equal(f.weapon.actionStage, "spinning");
  f.kid.stabbed();
  assert.equal(f.kid.health, 2);
  assert.deepEqual(f.damageEvents, [1]);
  assert.equal(f.weapon.isSpinning(), true);
  assert.equal(f.sounds.filter((sound) => sound[0] === "StabbedByOpponent").length, 1);
});

test("torch arms keep human proportions through the full turn, with native clothing and correct mirroring", () => {
  for (const direction of [-1, 1]) {
    const f = fixture();
    f.kid.charFace = direction;
    f.ctrlKey.isDown = true;
    f.advance(0.5);
    const start = f.kid.charX;
    const rig = f.PrinceJS.PrincePose;
    const drawArm = rig.drawArm;
    let arms = [];
    rig.drawArm = function (graphic, arm, light) {
      arms.push(arm);
      drawArm.call(this, graphic, arm, light);
    };
    for (let i = 0; i < 48; i++) {
      arms = [];
      f.weapon.spinTime = (i / 48) * 0.4;
      f.effects.update(0, f.weapon);
      assert.equal(arms.length, 2);
      for (const arm of arms) {
        assert.ok(Math.hypot(arm.elbow.x - arm.shoulder.x, arm.elbow.y - arm.shoulder.y) <= 8.01);
        assert.ok(Math.hypot(arm.hand.x - arm.elbow.x, arm.hand.y - arm.elbow.y) <= 7.01);
        assert.ok(Math.hypot(arm.hand.x - arm.shoulder.x, arm.hand.y - arm.shoulder.y) < 15);
        if (i === 12 || i === 36) {
          assert.ok(
            Math.hypot(arm.elbow.x - arm.shoulder.x, arm.elbow.y - arm.shoulder.y) <= 4.01,
            "an arm pointing toward the viewer is foreshortened instead of forming a full-width elbow loop"
          );
        }
      }
      assert.equal(f.kid.tint, 0xffffff, "the clothes keep their native color while spinning");
      assert.equal(f.effects.head.tint, 0xffffff);
      assert.equal(f.effects.body.scale.x, direction);
      assert.ok(f.effects.body.shapes.every((shape) => [0xffffdd, 0xddbbaa].includes(shape.color)));
      assert.equal(f.kid.charX, start);
    }
    assert.equal(f.PrinceJS.TwinTorches.REACH, 76);
    const trails = [...f.effects.back.shapes, ...f.effects.front.shapes].filter((shape) => shape.alpha < 0.5);
    assert.ok(
      trails.some((shape) => Math.abs(shape.x + 6) > 45),
      "the wide outer fire trail is preserved"
    );
  }
});

test("the opening steps beside each actual handle before pickup instead of extending the arms", () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level1.json"), "utf8"));
  const f = fixture(1, map);
  f.kid.charX = 14;
  f.kid.charBlockX = 0;
  f.kid.charBlockY = 1;
  f.weapon.startIntro();
  f.weapon.beginAction("intro");
  const start = f.kid.charX;
  for (let index = 0; index < 2; index++) {
    f.weapon.elapsed = f.PrinceJS.TwinTorches.INTRO_CAPTURES[index];
    f.weapon.updateIntro(0);
    const x = f.kid.baseX + f.PrinceJS.Utils.convertX(f.kid.charX);
    const y = f.kid.baseY + f.kid.charY;
    const hand = f.effects.introHand(f.weapon, index, x, y).hand;
    const arm = f.PrinceJS.PrincePose.arm({ x: index ? -9 : -3, y: -30 }, hand, index ? -1 : 1);
    const torch = f.weapon.introTorches[index];
    assert.ok(Math.abs(x + arm.hand.x - torch.x) < 0.1, "the hand touches the real socket");
    assert.ok(Math.abs(y + arm.hand.y - (torch.y + 12)) < 0.1, "the grip meets the middle of the handle");
    assert.notEqual(f.kid.charX, start, "the Prince steps closer before reaching");
    assert.equal(torch.tile.taken, true);
  }
  f.weapon.elapsed = f.PrinceJS.TwinTorches.INTRO_DURATION;
  f.weapon.updateIntro(0);
  assert.equal(f.PrinceJS.Utils.convertX(f.kid.charX), 61, "the short retreat ends ahead of the starting position");
  const target = map.guards.find((guard) => guard.burnRoute === "opening-shaft");
  const enemy = f.enemy(f.PrinceJS.Utils.convertBlockXtoX(target.location % 10) + target.direction * 7);
  assert.equal(target.location, 12);
  assert.equal(
    f.weapon.canReach(enemy),
    true,
    "the visible guard beside the pillar remains within the first spin's reach"
  );
  assert.ok(80 - f.PrinceJS.Utils.convertX(f.kid.charX) > 17, "the bottle remains outside pickup range");
  assert.equal(f.kid.charFrame, 15);
  assert.equal(f.kid.specialAction, null);
  const blocked = f.setTile(f.kid.room, 1, 1, 20);
  assert.equal(f.weapon.safeIntroStep(f.weapon.introTorches[1]), 0, "pickup steps cannot pass through a real wall");
  assert.equal(blocked.element, 20);
});

test("walking between wall sockets uses the complete native step without a second torso or stale crop", () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level1.json"), "utf8"));
  for (const direction of [-1, 1]) {
    const f = fixture(1, map);
    f.kid.charFace = direction;
    f.kid.charX = 14;
    f.kid.charBlockX = 0;
    f.kid.charBlockY = 1;
    f.weapon.startIntro();
    f.weapon.beginAction("intro");
    for (const time of [0.12, 0.34, 0.68, 0.94, 1.35]) {
      f.weapon.elapsed = time;
      f.weapon.updateIntro(0);
      f.effects.update(0, f.weapon);
      if ([0.12, 0.68, 1.35].includes(time)) {
        assert.ok(f.kid.charFrame >= 121 && f.kid.charFrame <= 132);
        assert.ok(!f.kid.cropRect);
        assert.equal(f.effects.head.visible, false);
        assert.equal(f.effects.body.visible, false);
      } else {
        const index = time === 0.34 ? 0 : 1;
        const x = f.kid.baseX + f.PrinceJS.Utils.convertX(f.kid.charX);
        const y = f.kid.baseY + f.kid.charY;
        const pose = f.effects.introHand(f.weapon, index, x, y);
        const arm = f.PrinceJS.PrincePose.arm({ x: index ? -9 : -3, y: -30 }, pose.hand, index ? -1 : 1);
        assert.ok(Math.abs(x + arm.hand.x * direction - f.weapon.introTorches[index].x) < 0.1);
        assert.equal(f.effects.head.visible, true);
      }
    }
  }
});

test("every native opening frame stays on the starting landing without crossing into a neighboring room", () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level1.json"), "utf8"));
  for (const [direction, startX] of [
    [-1, 14],
    [1, 14],
    [1, 19]
  ]) {
    for (const delta of [1 / 120, 1 / 60, 1 / 30, 0.05]) {
      const f = fixture(1, map);
      f.kid.charX = startX;
      f.kid.charBlockX = 0;
      f.kid.charFace = direction;
      const startBaseX = f.kid.baseX;
      f.weapon.startIntro();
      for (let time = 0; time < 1.6; time += delta) {
        f.weapon.update(delta);
        const context = `direction ${direction}, start ${startX}, delta ${delta}, frame ${f.kid.charFrame}`;
        assert.equal(f.kid.room, 1, context);
        assert.equal(f.kid.baseX, startBaseX, context);
        assert.ok(f.kid.charX >= startX && f.kid.charX < 37, context);
        assert.equal(f.kid.charBlockY, 1, context);
        const tile = f.level.getTileAt(f.kid.charBlockX, f.kid.charBlockY, f.kid.room);
        assert.ok(tile.isSafeWalkable() && !tile.isBarrier(), context);
        f.kid.checkFloor();
        assert.equal(f.kid.inFallDown, false, context);
      }
      assert.deepEqual(f.roomChanges, []);
      assert.ok(f.weapon.introDone && f.weapon.introTorches.every((torch) => torch.captured && torch.tile.taken));
      assert.equal(f.PrinceJS.Utils.convertX(f.kid.charX), direction === 1 ? 61 : 66);
      assert.ok(Number.isInteger(f.kid.charX), "native edge steps need an integer root after collection");
      assert.equal(f.kid.charFrame, 15);
      assert.equal(f.kid.specialAction, null);
    }
  }
});

test("stowing preserves the projected elbows and wrists of the last spin frame", () => {
  const f = fixture();
  f.ctrlKey.isDown = true;
  f.advance(0.5);
  const rig = f.PrinceJS.PrincePose;
  const drawArm = rig.drawArm;
  let arms = [];
  rig.drawArm = function (graphics, arm, light) {
    arms.push(JSON.parse(JSON.stringify(arm)));
    drawArm.call(this, graphics, arm, light);
  };
  for (const time of [0.03, 0.1, 0.18, 0.3]) {
    f.weapon.actionStage = "spinning";
    f.weapon.spinTime = time;
    f.weapon.drawProgress = 1;
    arms = [];
    f.effects.update(0, f.weapon);
    const spinning = arms;
    f.weapon.beginHolster();
    arms = [];
    f.effects.update(0, f.weapon);
    assert.deepEqual(arms, spinning, "release must not snap the arms to full length");
  }
});

test("fatal opening damage preserves native death and releases both animation and body crop", () => {
  const f = fixture();
  f.kid.health = 1;
  f.ctrlKey.isDown = true;
  f.advance(0.1);
  f.kid.stabbed();
  assert.equal(f.kid.alive, false);
  assert.equal(f.kid.health, 0);
  assert.equal(f.kid.action, "dropdead");
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.cropRect, null);
  assert.equal(f.effects.body.visible, false);
  assert.equal(f.weapon.actionStage, "hidden");
});

test("spinning reaches beyond enemy swords on either side and each target ignites once", () => {
  const f = fixture();
  const left = f.enemy(24);
  const right = f.enemy(88);
  const far = f.enemy(92);
  f.ctrlKey.isDown = true;
  f.advance(0.35);
  assert.equal(f.ignitions.length, 0);
  f.advance(0.2);
  assert.equal(left.alive, false);
  assert.equal(right.alive, false);
  assert.equal(far.alive, true);
  assert.equal(f.ignitions.length, 2);
  assert.equal(f.ignitions[0].impact.weapon, "twinTorches");
  assert.equal(f.ignitions[0].impact.direction, -1);
  assert.equal(f.ignitions[1].impact.direction, 1);
  f.advance(1);
  assert.equal(f.ignitions.length, 2);
});

test("wall masonry and a closed native gate shield targets from the torch sweep", () => {
  const f = fixture();
  f.kid.charX = 47;
  f.kid.charBlockX = 3;
  const shielded = f.enemy(70);
  f.setTile(1, 4, 1, 20);
  f.ctrlKey.isDown = true;
  f.advance(0.5);
  assert.equal(shielded.alive, true);
  f.setTile(1, 4, 1, 1);
  const gate = f.setTile(1, 3, 1, 4, 0);
  f.advance(0.2);
  assert.equal(shielded.alive, true);
  gate.posY = -47;
  f.advance(0.1);
  assert.equal(shielded.alive, false);
});

test("nearby guards across linked room boundaries burn, while unlinked boundaries stay protected", () => {
  const f = fixture();
  f.kid.charX = 134;
  f.kid.charBlockX = 9;
  const target = f.enemy(12, 119, 2);
  f.ctrlKey.isDown = true;
  f.advance(0.5);
  assert.equal(target.alive, false);
  const sealed = fixture();
  sealed.kid.charX = 134;
  sealed.kid.charBlockX = 9;
  sealed.level.rooms[1].links.right = -1;
  const unreachable = sealed.enemy(12, 119, 2);
  sealed.ctrlKey.isDown = true;
  sealed.advance(0.5);
  assert.equal(unreachable.alive, true);
});

test("release keeps movement blocked while the torches go back into pants, then restores original sprite state", () => {
  const f = fixture();
  const crop = { x: 1, y: 2, width: 10, height: 20 };
  f.kid.crop(crop);
  f.kid.tint = 0x998877;
  f.key.isDown = true;
  f.advance(0.6);
  f.ctrlKey.isDown = true;
  f.key.isDown = false;
  f.advance(0.1);
  assert.equal(f.weapon.actionStage, "spinning");
  f.ctrlKey.isDown = false;
  f.advance(0.1);
  assert.equal(f.weapon.actionStage, "holstering");
  assert.equal(f.kid.specialAction.owner, f.weapon);
  f.advance(0.2);
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.weapon.actionStage, "hidden");
  assert.deepEqual({ ...f.kid.cropRect }, crop);
  assert.equal(f.kid.tint, 0x998877);
  assert.equal(f.effects.front.visible, false);
});

test("stowing starts at the actual spinning hands and torch tips without snapping to the draw pose", () => {
  const f = fixture();
  f.ctrlKey.isDown = true;
  f.advance(0.7);
  const spinning = [0, 1].map((index) => f.effects.actionHand(f.weapon, index));
  f.weapon.beginHolster();
  for (let index = 0; index < 2; index++) {
    const stowing = f.effects.actionHand(f.weapon, index);
    assert.deepEqual({ ...stowing.hand }, { ...spinning[index].hand });
    assert.deepEqual({ ...stowing.torch }, { ...spinning[index].torch });
  }
});

test("early release reverses the draw; a fall or trap damage can still interrupt and kill while spinning", () => {
  const f = fixture();
  f.ctrlKey.isDown = true;
  f.advance(0.1);
  f.ctrlKey.isDown = false;
  f.advance(0.3);
  assert.equal(f.weapon.actionStage, "hidden");
  assert.equal(f.ignitions.length, 0);
  f.ctrlKey.isDown = true;
  f.advance(0.5);
  f.kid.action = "stepfall";
  f.kid.inFallDown = true;
  f.advance(0.05);
  assert.equal(f.weapon.actionStage, "hidden");
  assert.equal(f.kid.action, "stepfall");
  assert.equal(f.kid.specialAction, null);
  f.kid.action = "stand";
  f.kid.inFallDown = false;
  f.advance(0.5);
  f.kid.health = 1;
  f.kid.damageLife();
  f.advance(0.05);
  assert.equal(f.kid.alive, false);
  assert.equal(f.kid.action, "dropdead");
  assert.equal(f.kid.specialAction, null);
});

test("level1 intro waits for landing, takes both actual nearby wall torches, tucks them away and cannot be skipped by release", () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/maps/level1.json"), "utf8"));
  const f = fixture(1, map);
  f.kid.charX = 14;
  f.kid.charBlockX = 0;
  f.kid.charBlockY = 0;
  f.kid.charY = 53;
  f.kid.action = "stepfall";
  f.kid.inFallDown = true;
  assert.equal(f.weapon.startIntro(), true);
  assert.equal(f.weapon.introTorches.length, 2);
  assert.deepEqual(
    Array.from(f.weapon.introTorches, (torch) => [torch.tile.roomX, torch.tile.roomY]),
    [
      [0, 1],
      [1, 1]
    ]
  );
  f.advance(0.5);
  assert.equal(f.weapon.introPending, true);
  assert.equal(f.kid.specialAction, null);
  f.kid.action = "stand";
  f.kid.inFallDown = false;
  f.kid.charY = 116;
  f.kid.charBlockY = 1;
  f.advance(0.1);
  assert.equal(f.weapon.actionStage, "intro");
  assert.equal(f.weapon.canSelect(), false);
  assert.equal(f.kid.specialAction.owner, f.weapon);
  f.advance(0.26);
  assert.equal(f.level.getTileAt(0, 1, 1).taken, true);
  assert.equal(f.level.getTileAt(1, 1, 1).taken, false);
  f.kid.stabbed();
  assert.equal(f.kid.health, 2);
  assert.equal(f.weapon.actionStage, "intro");
  f.advance(0.6);
  assert.equal(f.level.getTileAt(1, 1, 1).taken, true);
  f.advance(0.6);
  assert.equal(f.weapon.introPending, false);
  assert.equal(f.weapon.introDone, true);
  assert.equal(f.weapon.actionStage, "hidden");
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.PrinceJS.Utils.convertX(f.kid.charX), 61);
  assert.equal(f.kid.activeWeapon, "twinTorches");
  assert.equal(f.weapon.startIntro(), false);
  assert.equal(f.level.getTileAt(0, 1, 1).tileChild.visible, false);
  assert.equal(f.level.getTileAt(1, 1, 1).tileChild.visible, false);
  assert.equal(f.level.getTileAt(0, 1, 1).element, 19);
  assert.equal(f.level.getTileAt(0, 1, 1).isWalkable(), true);
  for (let i = 0; i < 12; i++) {
    f.level.getTileAt(0, 1, 1).update();
  }
  assert.equal(f.level.getTileAt(0, 1, 1).tileChild.visible, false);
  assert.equal(f.level.getTileAt(0, 1, 1).back.frameName, "dungeon_1");
});

test("custom starts without adjacent native torches and later levels skip intro and other pickups are untouched", () => {
  const f = fixture(1);
  const original = f.setTile(1, 5, 1, 10);
  assert.equal(f.weapon.startIntro(), false);
  assert.equal(f.weapon.introPending, false);
  assert.equal(f.weapon.introDone, true);
  assert.equal(f.level.getTileAt(5, 1, 1), original);
  const later = fixture(2);
  later.setTile(1, 2, 1, 19);
  later.setTile(1, 3, 1, 19);
  assert.equal(later.weapon.startIntro(), false);
  later.advance(0.5);
  assert.equal(later.level.getTileAt(2, 1, 1).taken, false);
});

test("another action cannot be stolen and destroyed effects cannot leave behind a crop, light or controller lock", () => {
  const f = fixture();
  const owner = {};
  f.kid.specialAction = { owner, type: "jetpack" };
  f.ctrlKey.isDown = true;
  f.advance(0.6);
  assert.equal(f.weapon.actionStage, "hidden");
  assert.equal(f.kid.specialAction.owner, owner);
  f.kid.specialAction = null;
  f.advance(0.6);
  assert.equal(f.weapon.actionStage, "spinning");
  f.weapon.destroy();
  assert.equal(f.kid.specialAction, null);
  assert.equal(f.kid.cropRect, null);
  for (const display of [f.effects.body, f.effects.head, f.effects.light, f.effects.front, f.effects.back]) {
    assert.equal(display.destroyed, true);
    assert.equal(display.visible, false);
  }
  f.weapon.destroy();
  f.advance(0.6);
  assert.equal(f.weapon.actionStage, "hidden");
});
