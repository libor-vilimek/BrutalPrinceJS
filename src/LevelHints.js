"use strict";

// Small, non-blocking signs in the world. They never supply player input.
PrinceJS.LevelHints = function (delegate) {
  this.delegate = delegate;
  this.game = delegate.game;
  this.level = delegate.level;
  this.elapsed = 0;
  this.hints = [];
  if (this.level.number !== 1) {
    return;
  }

  const pickup = delegate.minigun && delegate.minigun.pickup;
  if (pickup && this.level.rooms[pickup.room]) {
    this.route = this.createHint(pickup.room, pickup.worldX, pickup.worldY - 62, "right", "recommended path");
  }

  for (const door of this.level.exitDoors || []) {
    const room = this.level.rooms[door.room];
    const button = room.tiles.find(
      (tile) => tile.element === PrinceJS.Level.TILE_RAISE_BUTTON && this.opensDoor(tile, door)
    );
    if (button) {
      const x = room.x * PrinceJS.ROOM_WIDTH + button.roomX * PrinceJS.BLOCK_WIDTH + 16;
      const floorY = room.y * PrinceJS.ROOM_HEIGHT + PrinceJS.Utils.convertBlockYtoY(button.roomY) + 3;
      const hint = this.createHint(door.room, x, floorY - 22, "down", "press this");
      hint.button = button;
      hint.door = door;
    }
  }
  this.update(0);
};

PrinceJS.LevelHints.prototype = {
  opensDoor: function (button, door) {
    let index = button.modifier;
    const visited = new Set();
    while (this.level.events[index] && !visited.has(index)) {
      visited.add(index);
      const event = this.level.events[index];
      const location = door.roomY * 10 + door.roomX + 1;
      // Native events can address either half of the double-width doorway.
      if (event.room === door.room && [location - 1, location].includes(event.location)) {
        return true;
      }
      if (!event.next) {
        break;
      }
      index++;
    }
    return false;
  },

  createHint: function (room, x, y, direction, text) {
    const layer = this.game.add.group();
    layer.z = 40;
    layer.position.setTo(Math.round(x), Math.round(y));
    const arrow = this.game.make.graphics(0, 0);
    layer.add(arrow);
    const pixels = [];
    for (let row = -5; row <= 5; row++) {
      for (let column = -8; column <= 5; column++) {
        if ((column <= 0 && Math.abs(row) <= 1) || (column >= 0 && column <= 5 - Math.abs(row))) {
          pixels.push(direction === "right" ? [column * 2, row * 2] : [-row * 2, column * 2]);
        }
      }
    }
    arrow.beginFill(0x20140d);
    for (const [px, py] of pixels) {
      arrow.drawRect(px - 1, py - 1, 4, 4);
    }
    arrow.endFill();
    arrow.beginFill(0xffd064);
    for (const [px, py] of pixels) {
      arrow.drawRect(px, py, 2, 2);
    }
    arrow.endFill();

    const label = this.game.make.bitmapText(0, -30, "font", text, 16);
    label.tint = 0xffedb3;
    // Keep the label readable even for the plate at the room's left edge.
    const left = this.level.rooms[room].x * PrinceJS.ROOM_WIDTH + 4 - x;
    label.x = Math.round(Math.max(left, -label.width / 2));
    const backing = this.game.make.graphics(0, 0);
    backing.beginFill(0x130f12, 0.9);
    backing.drawRect(label.x - 3, label.y + 1, label.width + 6, label.height + 2);
    backing.endFill();
    layer.add(backing);
    layer.add(label);
    const hint = { room, layer, arrow, label };
    this.hints.push(hint);
    return hint;
  },

  update: function (delta) {
    this.elapsed += Math.max(0, Math.min(Number(delta) || 0, 0.05));
    const kid = this.delegate.kid;
    const playing = kid.alive && kid.active && kid.visible && !this.delegate.pressButtonToNext && !PrinceJS.endTime;
    for (const hint of this.hints) {
      let visible = playing && kid.room === hint.room;
      if (hint === this.route) {
        visible = visible && this.delegate.minigun.pickup.collected && kid.hasMinigun;
      } else {
        visible = visible && !this.level.exitDoorOpen && !hint.door.open && !hint.door.destroyedByRocket;
      }
      hint.layer.visible = !!visible;
      // A quiet, stepped flash keeps the native pixel edges and label stable.
      hint.arrow.alpha = this.elapsed % 0.9 < 0.45 ? 1 : 0.3;
    }
  },

  destroy: function () {
    for (const hint of this.hints) {
      hint.layer.destroy(true);
    }
    this.hints.length = 0;
    this.route = null;
  }
};

PrinceJS.LevelHints.prototype.constructor = PrinceJS.LevelHints;
