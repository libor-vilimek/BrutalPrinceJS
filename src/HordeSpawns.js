"use strict";

PrinceJS.HordeSpawns = {
  place: function (enemy, location) {
    // Collision uses animated feet, which are offset from the sprite's anchor.
    let room = enemy.room;
    enemy.processCommand();
    enemy.room = room;
    enemy.updateBase();
    // convertBlockXtoX is the beginning of a 14-unit collision interval.
    enemy.charX =
      PrinceJS.Utils.convertBlockXtoX(location % 10) + 7 + (enemy.charFfoot - enemy.charFdx) * enemy.charFace;
    enemy.updateBlockXY();
    enemy.updateCharPosition();
  },

  storyRows: function (level, json) {
    // Converted custom maps use their own actors and disable campaign scripts.
    if (json.id !== undefined || json.prince.specialEvents === false) {
      return new Set();
    }
    let rows = new Set(
      json.guards
        .filter((guard) => !["guard", "fatguard"].includes(guard.type))
        .map((guard) => `${guard.room}:${Math.floor((guard.location + (guard.bias || 0)) / 10)}`)
    );
    // These actors move to other floors during skeleton, potion and merge scenes.
    let choreography = {
      3: ["3:1", "8:2"],
      5: ["24:0"],
      12: ["15:0", "15:1", "2:0"]
    };
    for (let row of choreography[level.number] || []) {
      rows.add(row);
    }
    return rows;
  },

  create: function (level, json) {
    let spawnRoom = level.rooms[json.prince.room];
    if (!spawnRoom) {
      return [];
    }
    let spawnColumn = (json.prince.location + (json.prince.bias || 0)) % 10;
    let spawnX = spawnRoom.x * PrinceJS.ROOM_WIDTH + spawnColumn * PrinceJS.BLOCK_WIDTH + 16;
    let introRoom = level.number === 1 && json.id === undefined ? spawnRoom.links.down : null;
    let storyRows = this.storyRows(level, json);
    let guards = [];
    let occupied = json.guards.map((guard) => {
      let room = level.rooms[guard.room];
      let location = guard.location + (guard.bias || 0);
      let direction = guard.direction * (guard.reverse || 1);
      return {
        x:
          room.x * PrinceJS.ROOM_WIDTH +
          PrinceJS.Utils.convertX(PrinceJS.Utils.convertBlockXtoX(location % 10) + direction * 7),
        row: room.y * 3 + Math.floor(location / 10)
      };
    });
    let safeFloors = [
      PrinceJS.Level.TILE_FLOOR,
      PrinceJS.Level.TILE_PILLAR,
      PrinceJS.Level.TILE_BOTTOM_BIG_PILLAR,
      PrinceJS.Level.TILE_DEBRIS,
      PrinceJS.Level.TILE_TORCH
    ];

    for (let roomId of Object.keys(level.rooms)) {
      let room = level.rooms[roomId];
      roomId = Number(roomId);
      if (roomId === json.prince.room) {
        continue;
      }
      for (let row = 0; row < 3; row++) {
        if (storyRows.has(`${roomId}:${row}`)) {
          continue;
        }
        for (let column = 0; column < 10; column++) {
          // The upper-left landing joins the invisible leap-of-faith bridge.
          if (
            json.id === undefined &&
            json.prince.specialEvents !== false &&
            level.number === 12 &&
            level.rooms[2] &&
            roomId === level.rooms[2].links.left &&
            row === 0 &&
            column >= 6
          ) {
            continue;
          }
          // A small first encounter directly beneath the loose-floor shaft gives
          // the hanging molotov a purpose before the minigun pickup on the left.
          if (roomId === introRoom && (row !== 1 || ![6, 7].includes(column))) {
            continue;
          }
          // Leave room to reach the left-hand gun before entering the first crowd.
          if (introRoom > 0 && room.links.left === introRoom && row === 1 && column < 3) {
            continue;
          }
          let tile = level.getTileAt(column, row, roomId);
          if (!safeFloors.includes(tile.element)) {
            continue;
          }
          let x = room.x * PrinceJS.ROOM_WIDTH + column * PrinceJS.BLOCK_WIDTH + 16;
          // Leave a generous approach at every entrance to the starting room.
          if (
            (room.links.right === json.prince.room && column >= 7) ||
            (room.links.left === json.prince.room && column <= 2) ||
            ((room.links.up === json.prince.room || room.links.down === json.prince.room) && Math.abs(x - spawnX) <= 80)
          ) {
            continue;
          }
          let worldRow = room.y * 3 + row;
          if (occupied.some((guard) => guard.row === worldRow && Math.abs(guard.x - x) < 28)) {
            continue;
          }
          guards.push({
            room: roomId,
            location: row * 10 + column,
            direction: x > spawnX ? -1 : 1,
            skill: roomId === introRoom ? 0 : (column + row + roomId) % 4,
            health: roomId === introRoom ? 2 : undefined,
            colors: 1 + ((column + row * 3 + roomId) % 7),
            type: "guard",
            sneak: false,
            reinforcement: true
          });
          occupied.push({ x, row: worldRow });
        }
      }
    }
    return guards;
  }
};
