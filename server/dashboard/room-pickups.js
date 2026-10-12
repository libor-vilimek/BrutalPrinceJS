"use strict";

// Reuse the game's placement and drawing routines, without constructing weapons or a Prince actor.
PrinceJS.RoomPreviewPickups = function (game, level, json) {
  const location = json.prince.location + (json.prince.bias || 0);
  const direction = json.prince.direction * (json.prince.reverse || 1);
  const spawn = {
    room: json.prince.room,
    charBlockX: location % 10,
    charBlockY: Math.floor(location / 10),
    charX:
      PrinceJS.Utils.convertBlockXtoX(location % 10) + (json.prince.turn !== false ? 7 : 0) + (json.prince.offset || 0)
  };
  const delegate = { weapons: [] };
  const placement = { level, kid: spawn, delegate };
  const drawings = [];
  const add = (id, weapon, effects, facing, collected, draw = "drawGround") => {
    const pickup = weapon.prototype.findPickup.call(placement, facing);
    if (!pickup) {
      return;
    }
    pickup.collected = collected;
    const item = { pickup };
    if (id === "minigun") {
      delegate.minigun = item;
    }
    if (id !== "whip" && id !== "jetpack") {
      delegate.weapons.push(item);
    }
    if (collected) {
      return;
    }
    const graphic = game.add.graphics(0, 0);
    graphic.z = id === "jetpack" ? 20 : 22;
    const drawing = Object.assign(Object.create(effects.prototype), {
      id,
      pickup,
      ground: graphic,
      pickupGraphic: graphic,
      elapsed: 0,
      spin: 0,
      spinSpeed: 0,
      collected: false
    });
    drawing.renderPickup = () => {
      if (id === "molotov") {
        graphic.clear();
        drawing.rect(graphic, 0x000000, pickup.worldX - 7, pickup.worldY, 15, 2, 0.5);
        drawing.drawBottle(graphic, pickup.worldX, pickup.worldY - 7, false, 0);
      } else {
        drawing[draw]();
      }
    };
    drawing.renderPickup();
    drawings.push(drawing);
  };
  add("minigun", PrinceJS.Minigun, PrinceJS.MinigunEffects, direction, PrinceJS.currentLevel >= 2);
  if (PrinceJS.currentLevel >= 2) {
    add(
      "rocketLauncher",
      PrinceJS.RocketLauncher,
      PrinceJS.RocketLauncherEffects,
      -direction,
      PrinceJS.currentLevel >= 4
    );
  }
  add(
    "molotov",
    PrinceJS.Molotov,
    PrinceJS.MolotovEffects,
    json.prince.turn !== false ? -direction : direction,
    PrinceJS.currentLevel >= 2
  );
  if (PrinceJS.currentLevel === 2) {
    add("whip", PrinceJS.Whip, PrinceJS.WhipEffects, direction, false, "drawPickup");
  }
  if (PrinceJS.currentLevel === 12) {
    add("jetpack", PrinceJS.Jetpack, PrinceJS.JetpackEffects, direction, false, "drawPickup");
  }
  return drawings;
};
