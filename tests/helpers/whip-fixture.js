"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function fixture() {
  const PrinceJS = { ROOM_WIDTH: 320, ROOM_HEIGHT: 189, BLOCK_WIDTH: 32, BLOCK_HEIGHT: 63 };
  const visuals = [];
  const Phaser = {
    Sprite: function (game) {
      Object.assign(this, { game, x: 0, y: 0, width: 22, height: 40, visible: true, alpha: 1 });
      this.scale = { x: 1, y: 1 };
      this.anchor = { setTo() {}, set() {} };
      this.addChild = () => {};
      this.crop = (rect) => (this.cropRect = rect);
      this.destroy = () => (this.destroyed = true);
    },
    Signal: function () {
      this.listeners = [];
      this.add = (fn, context) => this.listeners.push({ fn, context });
      this.dispatch = (...args) => this.listeners.forEach((listener) => listener.fn.apply(listener.context, args));
    },
    Rectangle: function (x, y, width, height) {
      Object.assign(this, { x, y, width, height });
      this.intersects = (other) =>
        x < other.x + other.width && x + width > other.x && y < other.y + other.height && y + height > other.y;
    }
  };
  const context = vm.createContext({ PrinceJS, Phaser });
  for (const file of [
    "Utils",
    "Actor",
    "Fighter",
    "Enemy",
    "Kid",
    "Level",
    "tiles/Base",
    "tiles/Gate",
    "HordeSpawns",
    "RangedWeapon",
    "GorePhysics",
    "PrincePose",
    "WhipEffects",
    "Whip",
    "KickEffects",
    "Kick"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../src", file + ".js"), "utf8"), context);
  }
  PrinceJS.Utils.delayed = () => {};
  const level = Object.assign(Object.create(PrinceJS.Level.prototype), {
    number: 2,
    rooms: {
      1: { x: 0, y: 0, links: { left: -1, right: 2, up: -1, down: 3 } },
      2: { x: 1, y: 0, links: { left: 1, right: -1, up: -1, down: -1 } },
      3: { x: 0, y: 1, links: { left: -1, right: -1, up: 1, down: -1 } }
    },
    dummyWall: Object.assign(Object.create(PrinceJS.Tile.Base.prototype), { element: 20 }),
    maskTile() {},
    unMaskTile() {}
  });
  const setTile = (id, column, row, element) => {
    let tile = Object.assign(
      Object.create(element === 4 ? PrinceJS.Tile.Gate.prototype : PrinceJS.Tile.Base.prototype),
      {
        room: id,
        roomX: column,
        roomY: row,
        element,
        posY: 0,
        back: { x: column * 32, y: row * 63, width: 32, height: 63, centerX: column * 32 + 16 },
        front: { x: column * 32, y: row * 63, width: 32, height: 63 },
        raise() {},
        showBlood() {}
      }
    );
    level.rooms[id].tiles[row * 10 + column] = tile;
    return tile;
  };
  for (const [id, room] of Object.entries(level.rooms)) {
    room.tiles = [];
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 10; column++) {
        setTile(Number(id), column, row, row === 1 ? 1 : 0);
      }
    }
  }
  const animations = Object.fromEntries(
    ["fighter", "sword", "kid"].map((key) => [
      key + "-anims",
      JSON.parse(fs.readFileSync(path.join(__dirname, "../../assets/anims", key + ".json")))
    ])
  );
  const frames = JSON.parse(fs.readFileSync(path.join(__dirname, "../../assets/gfx/guard-1.json"))).frames;
  const sounds = [];
  const graphics = () => {
    let visual = {
      scale: { x: 1, y: 1 },
      clear() {},
      beginFill() {},
      drawRect() {},
      endFill() {},
      addChild() {},
      destroy() {
        this.destroyed = true;
      }
    };
    visuals.push(visual);
    return visual;
  };
  const game = {
    add: { existing() {}, graphics, sprite: () => new Phaser.Sprite(game) },
    make: { sprite: () => new Phaser.Sprite(game) },
    cache: {
      getJSON: (key) => animations[key],
      getFrameData: () => ({ getFrameByName: (key) => ({ width: frames[key].frame.w, height: frames[key].frame.h }) })
    },
    rnd: { between: () => 254 },
    sound: { play: (...args) => sounds.push(args) },
    world: { getIndex: () => -1 }
  };
  const kid = {
    level,
    room: 1,
    charName: "kid",
    charFace: 1,
    charFdx: 0,
    charFdy: 0,
    charFfoot: 0,
    charFrame: 15,
    alive: true,
    active: true,
    visible: true,
    swordDrawn: false,
    hasWhip: true,
    activeWeapon: "minigun",
    minigunEquipped: true,
    action: "stand",
    health: 10,
    sword: { visible: false },
    cropRect: null,
    crop(rect) {
      this.cropRect = rect;
    },
    beginSpecialAction(owner, type) {
      if (this.specialAction) {
        return false;
      }
      this.specialAction = { owner, type };
      this.charXVel = this.charYVel = 0;
      return true;
    },
    endSpecialAction(owner) {
      if (this.specialAction && this.specialAction.owner === owner) {
        this.specialAction = null;
      }
    },
    setSpecialActionFrame(frame) {
      this.charFrame = frame;
    },
    updateBlockXY() {},
    keyWeaponAction: () => false,
    sneaks: () => false,
    frameID: () => false,
    stabbed() {
      this.health--;
    },
    facingOpponent: () => true,
    opponentInSameRoom: () => true,
    getCharBounds() {
      return { x: PrinceJS.Utils.convertX(this.charX) - 10, y: this.charY - 40, width: 20, height: 40 };
    }
  };
  const placeKid = (column, row = 1, room = 1, direction = 1) => {
    Object.assign(kid, {
      room,
      charBlockX: column,
      charBlockY: row,
      charX: column * 14 + 14,
      charY: PrinceJS.Utils.convertBlockYtoY(row),
      charFace: direction,
      baseX: level.rooms[room].x * 320,
      baseY: level.rooms[room].y * 189 + 3,
      x: column * 32 + 16,
      y: row * 63 + 56
    });
  };
  placeKid(1);
  const ctrlKey = { isDown: false };
  const fireKey = { isDown: false };
  const whipKey = { isDown: false };
  const delegate = {
    game,
    level,
    kid,
    enemies: [],
    weaponCtrlKey: ctrlKey,
    weaponFireKey: fireKey,
    whipKey,
    ui: { showText() {}, setOpponentLive() {} },
    bloodEffects: {
      hits: [],
      bursts: [],
      burst(...args) {
        this.bursts.push(args);
      },
      hit(enemy, impact) {
        this.hits.push({ enemy, impact });
      }
    }
  };
  game.state = { getCurrentState: () => delegate };
  const whip = new PrinceJS.Whip(delegate, 1);
  delegate.weapons = [];
  const guard = (column, row = 1, room = 1, direction = -1) => {
    const enemy = new PrinceJS.Enemy(
      game,
      level,
      row * 10 + column,
      direction,
      room,
      1,
      1,
      "guard",
      delegate.enemies.length + 1
    );
    PrinceJS.HordeSpawns.place(enemy, row * 10 + column);
    enemy.sneakUp = false;
    delegate.enemies.push(enemy);
    return enemy;
  };
  const advance = (seconds) => {
    for (let i = 0; i < Math.round(seconds / 0.01); i++) {
      whip.update(0.01);
    }
  };
  const tickEnemies = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      for (let enemy of delegate.enemies) {
        enemy.updateActor();
      }
      advance(0.08);
    }
  };
  const makeLedge = () => {
    setTile(1, 3, 0, 1);
    placeKid(4, 1, 1, -1);
    return guard(3, 0);
  };
  return {
    PrinceJS,
    whip,
    delegate,
    game,
    kid,
    level,
    guard,
    setTile,
    placeKid,
    advance,
    tickEnemies,
    ctrlKey,
    fireKey,
    whipKey,
    makeLedge,
    sounds,
    visuals
  };
}

module.exports = fixture;
