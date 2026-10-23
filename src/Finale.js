"use strict";

// A self-contained cinematic: no combat, inventory or player-input state is borrowed.
PrinceJS.Finale = function (game, scene) {
  this.elapsed = 0;
  this.complete = false;
  this.windowBroken = false;
  this.headKicked = false;
  this.shotTimes = [0, 0, 0];
  this.effects = new PrinceJS.FinaleEffects(game, scene);
  this.effects.render(this.pose(0));
};

PrinceJS.Finale.TIMES = {
  enter: 1.2,
  stop: 4,
  place: 4.65,
  release: 5.7,
  stand: 6.25,
  windup: 6.5,
  kick: 6.95,
  recover: 7.45,
  glass: 7.65,
  outside: 7.84,
  raise: 8.15,
  princeFire: 9,
  princessDraw: 9.45,
  princessFire: 10.3,
  archFall: 14,
  archImpact: 15.35,
  end: 20
};

PrinceJS.Finale.STAGE = {
  princeX: 149,
  princessX: 200,
  headX: 129,
  floorY: 165,
  windowX: 22,
  windowY: 112,
  windowLeft: 13,
  windowRight: 29
};

// A wedge cut from the native outer arch, directly above Jaffar's body.
PrinceJS.Finale.ARCH = {
  x: 103,
  y: 16,
  width: 28,
  height: 31,
  outline: [
    [0, 16],
    [3, 12],
    [9, 8],
    [16, 4],
    [24, 0],
    [27, 14],
    [23, 17],
    [17, 20],
    [12, 24],
    [8, 30]
  ],
  landingX: 108,
  landingRotation: 0.45
};

PrinceJS.Finale.prototype = {
  progress: function (time, start, end) {
    let t = Math.max(0, Math.min(1, (time - start) / (end - start)));
    return t * t * (3 - 2 * t);
  },

  pose: function (time) {
    const t = PrinceJS.Finale.TIMES;
    const stage = PrinceJS.Finale.STAGE;
    const masonry = PrinceJS.Finale.ARCH;
    const fall = Math.max(0, Math.min(1, (time - t.archFall) / (t.archImpact - t.archFall)));
    const archX = masonry.x + Math.floor(masonry.width / 2);
    const archY = masonry.y + Math.floor(masonry.height / 2);
    const bottom = Math.max(
      ...masonry.outline.map(
        ([x, y]) =>
          Math.sin(masonry.landingRotation) * (x - Math.floor(masonry.width / 2)) +
          Math.cos(masonry.landingRotation) * (y - Math.floor(masonry.height / 2))
      )
    );
    const progress = (start, end) => this.progress(time, start, end);
    const walking = time >= t.enter && time < t.stop;
    const placing = progress(t.place, t.release) * (1 - progress(t.release + 0.15, t.stand));
    const kick =
      time < t.kick
        ? -0.8 * progress(t.windup, t.kick - 0.16) + 1.8 * progress(t.kick - 0.16, t.kick)
        : 1 - progress(t.kick, t.recover);
    const dancing = time >= t.princeFire;
    const beat = (time - t.princeFire) * Math.PI * 3.6;
    const princessDancing = time >= t.princessFire;
    const sway = dancing ? Math.sin(beat) : 0;
    const princessSway = princessDancing ? Math.sin(beat + 0.8) : 0;
    const prince = {
      x: 336 - (336 - stage.princeX) * progress(t.enter, t.stop) + sway * 3,
      y: 165 - (dancing ? Math.abs(Math.sin(beat)) * 2 : walking ? Math.abs(Math.sin(time * 9)) : 0),
      step: walking ? Math.sin(time * 9) : sway,
      placing,
      kick,
      dancing,
      sway,
      raise: progress(t.raise, t.princeFire),
      firing: dancing,
      aim: { x: 67 + Math.sin(beat * 0.35) * 5, y: 30 + Math.cos(beat * 0.4) * 13, pillar: 0 }
    };
    const lowering = progress(t.place, t.release);
    const body = {
      x: prince.x - 29 - lowering * 29,
      y: prince.y - 25 + lowering * 25,
      rotation: walking ? Math.sin(time * 9) * 0.025 : 0,
      held: time < t.release,
      headAttached: time < t.kick,
      crushed: time >= t.archImpact
    };
    if (!body.held) {
      body.x = stage.headX - 38;
      body.y = stage.floorY;
    }
    let head = {
      x: body.x + 38,
      y: body.y - 5.5,
      rotation: 0,
      visible: false,
      throughWindow: false
    };
    if (time >= t.kick) {
      const flight = time - t.kick;
      const hit = t.glass - t.kick;
      const vx = (stage.windowX - stage.headX) / hit;
      const vy = (stage.windowY - (stage.floorY - 5.5) - 50 * hit * hit) / hit;
      head = {
        x: stage.headX + vx * flight,
        y: stage.floorY - 5.5 + vy * flight + 50 * flight * flight,
        rotation: -flight * 15,
        visible: time < t.outside,
        throughWindow: stage.headX + vx * flight <= stage.windowRight + 1
      };
    }
    return {
      time,
      prince,
      body,
      head,
      arch: {
        falling: time > t.archFall,
        x: archX + (masonry.landingX - archX) * fall,
        y: archY + (stage.floorY - bottom - archY) * fall * fall,
        rotation: masonry.landingRotation * fall
      },
      windowBroken: time >= t.glass,
      princess: {
        x: stage.princessX + princessSway * 3,
        y: 165 - (princessDancing ? Math.abs(Math.sin(beat + 0.8)) * 2 : 0),
        sway: princessSway,
        dancing: princessDancing,
        draw: progress(t.princessDraw, t.princessFire),
        firing: princessDancing,
        aims: [
          {
            x: (time <= t.archFall ? archX : 144) + princessSway * 3,
            y: (time <= t.archFall ? archY : 24) + princessSway * 3,
            pillar: 2
          },
          { x: 248 + princessSway * 5, y: 40 - princessSway * 12, pillar: 1 }
        ]
      }
    };
  },

  update: function (delta) {
    if (this.destroyed || !Number.isFinite(delta) || delta <= 0) {
      return;
    }
    // Frame-independent fixed steps keep the foot, head, broken pane and shots in sync.
    let remaining = Math.min(delta, 0.1);
    while (remaining > 0.000001) {
      let dt = Math.min(remaining, 1 / 60);
      remaining -= dt;
      this.elapsed += dt;
      const pose = this.pose(this.elapsed);
      const t = PrinceJS.Finale.TIMES;
      this.effects.update(dt);
      this.effects.render(pose);
      if (!this.headKicked && this.elapsed >= t.kick) {
        this.headKicked = true;
        this.effects.kickHead();
      }
      if (!this.windowBroken && pose.windowBroken) {
        this.windowBroken = true;
        this.effects.breakWindow();
      }
      const guns = this.effects.guns;
      for (let i = 0; i < guns.length; i++) {
        const start = i === 0 ? t.princeFire : t.princessFire + (i - 1) * 0.055;
        const interval = i === 0 ? 0.075 : 0.14;
        if (this.elapsed >= start && this.elapsed >= this.shotTimes[i]) {
          this.effects.shoot(guns[i], i);
          this.shotTimes[i] = this.elapsed + interval;
        }
      }
      this.complete = this.elapsed >= t.end;
    }
  },

  destroy: function () {
    if (!this.destroyed) {
      this.destroyed = true;
      this.effects.destroy();
    }
  }
};
