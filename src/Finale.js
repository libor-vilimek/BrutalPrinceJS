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
  release: 5.4,
  stand: 6,
  windup: 6.15,
  kick: 6.48,
  recover: 6.95,
  glass: 7.12,
  outside: 7.55,
  raise: 7.7,
  princeFire: 8.4,
  princessDraw: 8.7,
  princessFire: 9.5,
  end: 17.5
};

PrinceJS.Finale.STAGE = { princeX: 154, princessX: 200, headX: 134, floorY: 165, windowX: 22, windowY: 112 };

PrinceJS.Finale.prototype = {
  progress: function (time, start, end) {
    let t = Math.max(0, Math.min(1, (time - start) / (end - start)));
    return t * t * (3 - 2 * t);
  },

  pose: function (time) {
    const t = PrinceJS.Finale.TIMES;
    const stage = PrinceJS.Finale.STAGE;
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
      firing: dancing
    };
    let head = {
      x: prince.x - 12,
      y: prince.y - 14,
      rotation: Math.sin(time * 7) * (walking ? 0.12 : 0.02),
      visible: true
    };
    if (time < t.release) {
      head.x -= placing * 8;
      head.y += placing * 8;
    } else if (time < t.kick) {
      head = { x: stage.headX, y: stage.floorY - 6, rotation: 0, visible: true };
    } else {
      const flight = time - t.kick;
      const hit = t.glass - t.kick;
      const vx = (stage.windowX - stage.headX) / hit;
      const vy = (stage.windowY - (stage.floorY - 6) - 50 * hit * hit) / hit;
      head = {
        x: stage.headX + vx * flight,
        y: stage.floorY - 6 + vy * flight + 50 * flight * flight,
        rotation: -flight * 15,
        visible: time < t.outside
      };
    }
    return {
      time,
      prince,
      head,
      headHeld: time < t.release,
      headGrounded: time >= t.release && time < t.kick,
      windowBroken: time >= t.glass,
      princess: {
        x: stage.princessX + princessSway * 3,
        y: 165 - (princessDancing ? Math.abs(Math.sin(beat + 0.8)) * 2 : 0),
        sway: princessSway,
        dancing: princessDancing,
        draw: progress(t.princessDraw, t.princessFire),
        firing: princessDancing
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
