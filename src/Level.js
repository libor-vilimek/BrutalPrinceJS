"use strict";

PrinceJS.Level = function (game, number, name, type) {
  this.game = game;

  this.number = number;
  this.name = name;

  this.type = type;

  this.rooms = [];

  this.back = this.game.add.group();
  this.back.z = 10;

  this.front = this.game.add.group();
  this.front.z = 30;

  this.trobs = [];

  this.maskedTiles = {};

  this.dummyWall = new PrinceJS.Tile.Base(this.game, PrinceJS.Level.TILE_WALL, 0, this.type);

  this.exitDoorOpen = false;
  this.activeGates = [];
};

PrinceJS.Level.TYPE_DUNGEON = 0;
PrinceJS.Level.TYPE_PALACE = 1;

PrinceJS.Level.TILE_SPACE = 0;
PrinceJS.Level.TILE_FLOOR = 1;
PrinceJS.Level.TILE_SPIKES = 2;
PrinceJS.Level.TILE_PILLAR = 3;
PrinceJS.Level.TILE_GATE = 4;
PrinceJS.Level.TILE_STUCK_BUTTON = 5;
PrinceJS.Level.TILE_DROP_BUTTON = 6;
PrinceJS.Level.TILE_TAPESTRY = 7;
PrinceJS.Level.TILE_BOTTOM_BIG_PILLAR = 8;
PrinceJS.Level.TILE_TOP_BIG_PILLAR = 9;
PrinceJS.Level.TILE_POTION = 10;
PrinceJS.Level.TILE_LOOSE_BOARD = 11;
PrinceJS.Level.TILE_TAPESTRY_TOP = 12;
PrinceJS.Level.TILE_MIRROR = 13;
PrinceJS.Level.TILE_DEBRIS = 14;
PrinceJS.Level.TILE_RAISE_BUTTON = 15;
PrinceJS.Level.TILE_EXIT_LEFT = 16;
PrinceJS.Level.TILE_EXIT_RIGHT = 17;
PrinceJS.Level.TILE_CHOPPER = 18;
PrinceJS.Level.TILE_TORCH = 19;
PrinceJS.Level.TILE_WALL = 20;
PrinceJS.Level.TILE_SKELETON = 21;
PrinceJS.Level.TILE_SWORD = 22;
PrinceJS.Level.TILE_BALCONY_LEFT = 23;
PrinceJS.Level.TILE_BALCONY_RIGHT = 24;
PrinceJS.Level.TILE_LATTICE_PILLAR = 25;
PrinceJS.Level.TILE_LATTICE_SUPPORT = 26;
PrinceJS.Level.TILE_SMALL_LATTICE = 27;
PrinceJS.Level.TILE_LATTICE_LEFT = 28;
PrinceJS.Level.TILE_LATTICE_RIGHT = 29;
PrinceJS.Level.TILE_TORCH_WITH_DEBRIS = 30;
PrinceJS.Level.TILE_DEBRIS_ONLY = 31;
PrinceJS.Level.TILE_NULL = 32;

PrinceJS.Level.POTION_RECOVER = 1;
PrinceJS.Level.POTION_ADD = 2;
PrinceJS.Level.POTION_BUFFER = 3;
PrinceJS.Level.POTION_FLIP = 4;
PrinceJS.Level.POTION_DAMAGE = 5;
PrinceJS.Level.POTION_SPECIAL = 6;

PrinceJS.Level.FLASH_RED = 0xff0000;
PrinceJS.Level.FLASH_GREEN = 0x00ff00;
PrinceJS.Level.FLASH_YELLOW = 0xffff00;
PrinceJS.Level.FLASH_WHITE = 0xffffff;

PrinceJS.Level.prototype = {
  addTile: function (x, y, room, tile) {
    if (x >= 0 && y >= 0) {
      this.rooms[room].tiles[y * 10 + x] = tile;
      tile.roomX = x;
      tile.roomY = y;
      tile.room = room;
    }

    tile.x = this.rooms[room].x * PrinceJS.ROOM_WIDTH + x * PrinceJS.BLOCK_WIDTH;
    tile.y = this.rooms[room].y * PrinceJS.ROOM_HEIGHT + y * PrinceJS.BLOCK_HEIGHT - 13;

    this.back.add(tile.back);
    this.front.add(tile.front);
  },

  addTrob: function (trob) {
    this.trobs.push(trob);
  },

  destroyBarrier: function (tile) {
    if (!tile || !this.rooms[tile.room] || this.getTileAt(tile.roomX, tile.roomY, tile.room) !== tile) {
      return false;
    }
    if (tile.element === PrinceJS.Level.TILE_EXIT_LEFT) {
      tile = this.getTileAt(tile.roomX + 1, tile.roomY, tile.room);
    }
    if (tile.element === PrinceJS.Level.TILE_EXIT_RIGHT) {
      if (!tile.blastOpen || tile.destroyedByRocket) {
        return false;
      }
      tile.blastOpen();
      this.exitDoorOpen = true;
      return true;
    }
    if (!tile.isBarrier()) {
      return false;
    }

    // Keep a solid walking surface inside breached stone walls and beneath gates.
    // Hanging tapestry tops have no floor, so they leave the existing gap intact.
    let element =
      tile.element === PrinceJS.Level.TILE_TAPESTRY_TOP ? PrinceJS.Level.TILE_SPACE : PrinceJS.Level.TILE_DEBRIS;
    let rubble = new PrinceJS.Tile.Base(this.game, element, 0, tile.type);
    rubble.destroyedElement = tile.element;
    let backIndex = this.back.getIndex(tile.back);
    let frontIndex = this.front.getIndex(tile.front);
    this.trobs = this.trobs.filter((trob) => trob !== tile);
    this.activeGates = this.activeGates.filter((gate) => gate !== tile);
    for (let id of Object.keys(this.maskedTiles)) {
      if (this.maskedTiles[id] === tile) {
        delete this.maskedTiles[id];
      }
    }
    if (this.mirror === tile) {
      this.mirror = null;
    }
    if (this.delegate && this.delegate.kid && this.delegate.kid.delegate === tile) {
      this.delegate.kid.delegate = null;
    }
    this.addTile(tile.roomX, tile.roomY, tile.room, rubble);
    tile.destroy();
    // Tile artwork overlaps its neighbor; retain the original painter ordering.
    this.back.setChildIndex(rubble.back, backIndex);
    this.front.setChildIndex(rubble.front, frontIndex);
    this.refreshWallAppearance(this.getTileAt(rubble.roomX - 1, rubble.roomY, rubble.room));
    this.refreshWallAppearance(this.getTileAt(rubble.roomX + 1, rubble.roomY, rubble.room));
    return true;
  },

  refreshWallAppearance: function (tile) {
    if (!tile || tile.element !== PrinceJS.Level.TILE_WALL || !this.rooms[tile.room]) {
      return;
    }
    let leftWall = this.getTileAt(tile.roomX - 1, tile.roomY, tile.room).element === PrinceJS.Level.TILE_WALL;
    let rightWall = this.getTileAt(tile.roomX + 1, tile.roomY, tile.room).element === PrinceJS.Level.TILE_WALL;
    if (tile.type === PrinceJS.Level.TYPE_DUNGEON) {
      let pattern = (leftWall ? "W" : "S") + "W" + (rightWall ? "W" : "S");
      tile.front.frameName = pattern + "_" + (tile.roomY * 10 + tile.roomX + Number(tile.room));
    }
    tile.back.frameName = rightWall ? tile.key + "_" + PrinceJS.Level.TILE_WALL : tile.key + "_wall_" + tile.modifier;
  },

  update: function () {
    let i = this.trobs.length;

    while (i--) {
      this.trobs[i].update();
    }
  },

  removeObject: function (x, y, room) {
    let tile = this.getTileAt(x, y, room);
    if (tile && tile.removeObject) {
      tile.removeObject();

      let idx = this.trobs.indexOf(tile);
      if (idx > -1) {
        this.trobs.splice(idx, 1);
      }
    }
  },

  getTileAt: function (x, y, room) {
    if (!this.rooms[room]) {
      return this.dummyWall;
    }
    let newRoom;
    let newX = x;
    let newY;

    let result = this.getRoomX(room, x);
    if (result.room > 0) {
      newRoom = result.room;
      newX = result.x;
      result = this.getRoomY(newRoom, y);
      newRoom = result.room;
      newY = result.y;
    } else {
      result = this.getRoomY(room, y);
      newRoom = result.room;
      newY = result.y;
      if (result.room > 0) {
        result = this.getRoomX(newRoom, x);
        newRoom = result.room;
        newX = result.x;
      }
    }
    if (newRoom <= 0) {
      return this.dummyWall;
    }
    return this.rooms[newRoom].tiles[newX + newY * 10];
  },

  getRoomX: function (room, x) {
    if (x < 0) {
      room = this.rooms[room].links.left;
      x += 10;
    }
    if (x > 9) {
      room = this.rooms[room].links.right;
      x -= 10;
    }
    return {
      room,
      x
    };
  },

  getRoomY: function (room, y) {
    if (y < 0) {
      room = this.rooms[room].links.up;
      y += 3;
    }
    if (y > 2) {
      room = this.rooms[room].links.down;
      y -= 3;
    }
    return {
      room,
      y
    };
  },

  shakeFloor: function (y, room) {
    for (let x = 0; x < 10; x++) {
      let tile = this.getTileAt(x, y, room);

      if (tile.element === PrinceJS.Level.TILE_LOOSE_BOARD) {
        tile.shake(false);
      }
    }
  },

  unMaskTile: function (actor) {
    if (this.maskedTiles[actor.id]) {
      this.maskedTiles[actor.id].toggleMask(actor);
      delete this.maskedTiles[actor.id];
    }
  },

  maskTile: function (x, y, room, actor) {
    let tile = this.getTileAt(x, y, room);

    if (this.maskedTiles[actor.id] === tile) {
      return;
    }
    if (this.maskedTiles[actor.id]) {
      this.unMaskTile(actor);
    }

    if (tile.isWalkable()) {
      this.maskedTiles[actor.id] = tile;
      tile.toggleMask(actor);
    }
  },

  floorStartFall: function (tile) {
    let space = new PrinceJS.Tile.Base(this.game, PrinceJS.Level.TILE_SPACE, 0, tile.type);
    if (tile.type === PrinceJS.Level.TYPE_PALACE) {
      space.back.frameName = tile.key + "_0_1";
    }
    this.addTile(tile.roomX, tile.roomY, tile.room, space);

    while (this.getTileAt(tile.roomX, tile.roomY, tile.room).element === PrinceJS.Level.TILE_SPACE) {
      tile.roomY++;
      if (tile.roomY === 3) {
        tile.roomY = 0;
        tile.room = this.rooms[tile.room].links.down;
      }

      tile.yTo += PrinceJS.BLOCK_HEIGHT;
    }
  },

  floorStopFall: function (tile) {
    let floor = this.getTileAt(tile.roomX, tile.roomY, tile.room);
    if (floor.element !== PrinceJS.Level.TILE_SPACE) {
      tile.destroy();
      floor.addDebris();
      this.shakeFloor(tile.roomY, tile.room);
    } else {
      tile.sweep();
    }
  },

  fireEvent: function (event, type, stuck) {
    if (!this.events[event]) {
      return;
    }
    let room = this.events[event].room;
    let x = (this.events[event].location - 1) % 10;
    let y = Math.floor((this.events[event].location - 1) / 10);

    let tile = this.getTileAt(x, y, room);

    if (tile.element === PrinceJS.Level.TILE_EXIT_LEFT) {
      tile = this.getTileAt(x + 1, y, room);
    }

    if (type === PrinceJS.Level.TILE_RAISE_BUTTON) {
      if (tile.raise) {
        tile.raise(stuck);
        if ([PrinceJS.Level.TILE_EXIT_LEFT, PrinceJS.Level.TILE_EXIT_RIGHT].includes(tile.element)) {
          this.exitDoorOpen = true;
        }
      }
    } else if (tile.drop) {
      tile.drop(stuck);
    }

    if (this.events[event].next) {
      this.fireEvent(event + 1, type);
    }
  },

  activateChopper: function (x, y, room) {
    let tile;

    do {
      tile = this.getTileAt(++x, y, room);
    } while (x < 9 && tile.element !== PrinceJS.Level.TILE_CHOPPER);

    if (tile.element === PrinceJS.Level.TILE_CHOPPER) {
      this.delegate.handleChop(tile);
    }
  },

  checkGates: function (room, prevRoom, visibleRooms = []) {
    let gates = this.getGatesAll(room, prevRoom);
    for (let visibleRoom of visibleRooms) {
      gates.push(...this.getGatesAll(visibleRoom));
    }
    gates = [...new Set(gates)];
    this.activeGates.forEach((gate) => {
      if (!gates.includes(gate)) {
        gate.isVisible(false);
      }
    });
    gates.forEach((gate) => {
      gate.isVisible(true);
    });
    this.activeGates = gates;
  },

  getGatesAll: function (room, prevRoom) {
    let gates = [...this.getGates(room), ...this.getGatesLeft(room)];
    if (prevRoom) {
      if (room && this.rooms[room]) {
        if (this.rooms[room].links.up === prevRoom) {
          gates.push(...this.getGatesUp(room));
        }
        if (this.rooms[room].links.down === prevRoom) {
          gates.push(...this.getGatesDown(room));
        }
      }
    }
    return gates;
  },

  getGates: function (room, edgeX, edgeY) {
    let gates = [];
    if (room && this.rooms[room]) {
      this.rooms[room].tiles.forEach((tile) => {
        if (tile.element === PrinceJS.Level.TILE_GATE) {
          if (edgeX === undefined && edgeY === undefined) {
            gates.push(tile);
          } else if (edgeX !== undefined && edgeY !== undefined && tile.roomX === edgeX && tile.roomY === edgeY) {
            gates.push(tile);
          } else if (edgeX !== undefined && edgeY === undefined && tile.roomX === edgeX) {
            gates.push(tile);
          } else if (edgeX === undefined && edgeY !== undefined && tile.roomY === edgeY) {
            gates.push(tile);
          }
        }
      });
    }
    return gates;
  },

  getGatesLeft: function (room) {
    let gates = [];
    if (room && this.rooms[room]) {
      let roomLeft = this.rooms[room].links.left;
      if (roomLeft > 0) {
        gates.push(...this.getGates(roomLeft, 9));
      }
    }
    return gates;
  },

  getGatesRight: function (room) {
    let gates = [];
    if (room && this.rooms[room]) {
      let roomRight = this.rooms[room].links.right;
      if (roomRight > 0) {
        gates.push(...this.getGates(roomRight, 0));
      }
    }
    return gates;
  },

  getGatesUp: function (room) {
    let gates = [];
    if (room && this.rooms[room]) {
      let roomUp = this.rooms[room].links.up;
      if (roomUp > 0) {
        gates.push(...this.getGates(roomUp, undefined, 2));
        let roomUpLeft = this.rooms[roomUp].links.left;
        if (roomUpLeft > 0) {
          gates.push(...this.getGates(roomUpLeft, 9, 2));
        }
      }
    }
    return gates;
  },

  getGatesDown: function (room) {
    let gates = [];
    if (room && this.rooms[room]) {
      let roomDown = this.rooms[room].links.down;
      if (roomDown > 0) {
        gates.push(...this.getGates(roomDown, undefined, 0));
        let roomDownLeft = this.rooms[roomDown].links.left;
        if (roomDownLeft > 0) {
          gates.push(...this.getGates(roomDownLeft, 9, 0));
        }
      }
    }
    return gates;
  },

  recheckCurrentRoom: function () {
    this.delegate.recheckCurrentRoom();
  }
};

PrinceJS.Level.prototype.constructor = PrinceJS.Level;
