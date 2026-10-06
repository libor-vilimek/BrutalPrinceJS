"use strict";

const timeInput = document.getElementById("time");
const facingInput = document.getElementById("facing");
const status = document.getElementById("status");
let animated = false;
let previews = [];
let previewGame = new Phaser.Game(
  1280,
  710,
  Phaser.CANVAS,
  "preview",
  {
    preload() {
      this.load.atlasJSONHash("kid", "../assets/gfx/kid.png", "../assets/gfx/kid.json");
    },
    create() {
      this.game.stage.backgroundColor = "#171e28";
      this.game.stage.disableVisibilityChange = true;
      this.game.renderer.renderSession.roundPixels = true;
      buildPreviews();
    },
    update() {
      if (animated) {
        timeInput.value = (Number(timeInput.value) + this.game.time.elapsedMS / 1000) % 1.5;
      }
      previews.forEach((draw) => draw(Number(timeInput.value)));
      status.textContent =
        "Time: " + Number(timeInput.value).toFixed(2) + "s · Native pale clothing, bare arms and neckline";
    }
  },
  false,
  false
);

function makeKid(direction, frame = 15) {
  const kid = previewGame.add.sprite(0, 54, "kid", "kid-" + frame);
  kid.anchor.setTo(0, 1);
  kid.scale.x = -direction;
  Object.assign(kid, {
    baseX: 0,
    baseY: 0,
    charX: 0,
    charY: 54,
    charFrame: frame,
    charFace: direction,
    action: "stand",
    alive: true,
    active: true,
    room: 1,
    hasTwinTorches: true,
    whipEquipped: true
  });
  kid.z = 20;
  kid.getCharBounds = () => {
    const native = previewGame.cache.getFrameByName("kid", kid.frameName);
    return { x: 0, y: kid.charY - native.height, width: native.width, height: native.height };
  };
  return kid;
}

function buildPreviews() {
  previewGame.world.removeAll(true);
  previews = [];
  const direction = Number(facingInput.value);
  const labels = [
    "Original · standing",
    "Torches · draw / stow",
    "Torches · spinning",
    "Torches · wall pickup",
    "Minigun · braced",
    "Launcher · braced",
    "Whip · swing",
    "Molotov · ground",
    "Original · crouched",
    "Minigun · crouched",
    "Molotov · hanging",
    "Jetpack · straps"
  ];
  labels.forEach((label, index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const start = previewGame.world.children.length;
    const kid = makeKid(direction, [8, 9].includes(index) ? 109 : index === 11 ? 32 : 15);
    const pickup = { collected: true };
    let draw = () => {};
    if ([1, 2, 3].includes(index)) {
      const effects = new PrinceJS.TwinTorchesEffects(previewGame, kid);
      const state = {
        validAction: () => true,
        drawProgress: 1,
        spinTime: 0,
        elapsed: 0,
        actionStage: index === 1 ? "drawing" : index === 2 ? "spinning" : "intro",
        introTorches: [
          { x: 48, y: 20 },
          { x: 80, y: 20 }
        ]
      };
      draw = (time) => {
        state.elapsed = time;
        state.spinTime = time;
        state.drawProgress = Math.min(1, time / 0.42);
        if (index === 1 && time >= 1.18) {
          state.actionStage = time >= 1.44 ? "hidden" : "holstering";
          state.drawProgress = Math.max(0, 1 - (time - 1.18) / 0.26);
        } else if (index === 1) {
          state.actionStage = "drawing";
        }
        if (index === 3) {
          const ease = (start, duration) => {
            let t = Math.max(0, Math.min(1, (time - start) / duration));
            return t * t * (3 - 2 * t);
          };
          let first = 16 - 2 * direction;
          let x = 32 + (first * ease(0, 0.22) + 32 * ease(0.56, 0.22)) * (1 - ease(1.18, 0.32));
          // Keep the walking route centered in this inspection cell.
          kid.baseX = x - 64;
          state.introTorches = [
            { x: -16, y: 20 },
            { x: 16, y: 20 }
          ];
          kid.x = kid.baseX;
          const walking = time < 0.22 || (time >= 0.56 && time < 0.78) || time >= 1.18;
          kid.charFrame = walking ? [121, 122, 123, 124, 123, 122, 132][Math.floor(time * 24) % 7] : 15;
          kid.frameName = "kid-" + kid.charFrame;
        }
        effects.update(0, state);
      };
    } else if ([4, 5, 9].includes(index)) {
      const effects =
        index === 5
          ? new PrinceJS.RocketLauncherEffects(previewGame, kid, pickup)
          : new PrinceJS.MinigunEffects(previewGame, kid, pickup);
      const crouched = index === 9;
      const pose = { x: 0, y: crouched ? 41 : index === 5 ? 26 : 30, floorY: 54, direction, crouched, visible: true };
      effects.actionStage = "firing";
      effects.drawProgress = 1;
      draw = () => {
        effects.drawPrince(pose);
        effects.weapon.visible = true;
        effects.weapon.clear();
        effects.weapon.x = 0;
        effects.weapon.y = pose.y;
        effects.weapon.scale.x = direction;
        effects.drawWeapon(effects.weapon);
      };
    } else if (index === 6) {
      const effects = new PrinceJS.WhipEffects(previewGame, kid, pickup);
      const state = { actionStage: "cracking", elapsed: 0 };
      kid.specialAction = { owner: state };
      draw = (time) => {
        state.elapsed = time % PrinceJS.Whip.CRACK_DURATION;
        effects.update(0, state);
      };
    } else if ([7, 10].includes(index)) {
      const effects = new PrinceJS.MolotovEffects(previewGame, kid, pickup);
      effects.poseActive = true;
      effects.anchor = { x: 2 * direction, y: -2, floorY: 54, direction };
      if (index === 10) {
        kid.alpha = 0;
      }
      draw = (time) =>
        effects.drawPose({
          hanging: index === 10,
          crouched: false,
          phase: "throwing",
          time: time % 0.6,
          lighterLit: true
        });
    } else if (index === 11) {
      const effects = new PrinceJS.JetpackEffects(previewGame, kid, pickup);
      const state = { active: true, phase: "flying", elapsed: 1, velocityX: 0, velocityY: 0 };
      draw = () => effects.update(0, state);
    }
    const children = previewGame.world.children.slice(start);
    const group = previewGame.add.group();
    children.forEach((child) => group.add(child));
    group.x = column * 320 + 160;
    group.y = row * 230 + 48;
    group.scale.setTo(3);
    group.sort("z", Phaser.Group.SORT_ASCENDING);
    previewGame.add.text(column * 320 + 14, row * 230 + 8, label, { font: "16px monospace", fill: "#ffffdd" });
    previews.push(draw);
  });
}

facingInput.addEventListener("change", buildPreviews);
document.getElementById("animate").addEventListener("click", (event) => {
  animated = !animated;
  event.target.textContent = animated ? "Pause" : "Animate";
});
