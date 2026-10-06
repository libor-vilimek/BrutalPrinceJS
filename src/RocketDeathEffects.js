"use strict";

// Explosion choreography extends the same native sprite fragments and terrain physics as gun deaths.
PrinceJS.EnemyDeathEffects.prototype.spawnRocketDeath = function (enemy, impact) {
  let pose = this.pose(enemy);
  let centerY = pose.y - pose.height * 0.5;
  let offsetX = pose.x - impact.x;
  let direction = Math.abs(offsetX) > 3 ? Math.sign(offsetX) : impact.direction || -pose.direction || 1;
  let distance = Math.hypot(offsetX, centerY - impact.y);
  let force = 1 - Math.min(distance / 64, 1) * 0.22;
  let below = Math.max(-0.5, Math.min(0.5, (impact.y - centerY) / Math.max(1, pose.height)));
  let variant = (this.rocketDeathSerial || 0) % 3;
  this.rocketDeathSerial = (this.rocketDeathSerial || 0) + 1;

  let anatomy = [
    { part: "head", side: 0, offset: 0, height: 0.9, speed: 335, lift: 190 },
    { part: "torso", side: 0, offset: 0, height: 0.55, speed: 255, lift: 135 },
    { part: "arm", side: 0, offset: -0.3, height: 0.58, speed: 350, lift: 145 },
    { part: "arm", side: 1, offset: 0.3, height: 0.58, speed: 310, lift: 180 },
    { part: "leg", side: 0, offset: -0.15, height: 0.18, speed: 280, lift: 105 },
    { part: "leg", side: 1, offset: 0.15, height: 0.18, speed: 325, lift: 140 }
  ];

  let parts = anatomy.map((part, index) => {
    let sourceX = pose.x - pose.direction * part.offset * pose.width;
    let radialX = sourceX - impact.x;
    let away = Math.abs(radialX) > 1 ? Math.sign(radialX) : direction;
    let spread = 1 + this.random() * 0.16;
    let speed = Math.min(400, part.speed * force * spread);
    let lift = (part.lift + this.random() * 45 + below * 55) * force;
    let spin = away * (2.8 + this.random() * 4.5);

    if (variant === 1) {
      // A tumbling wheel: the two legs kick outward while the torso rolls along the floor.
      speed *= part.part === "torso" ? 1.15 : 0.92;
      lift *= part.part === "torso" ? 0.6 : 1.05;
      spin *= 1.6;
    } else if (variant === 2) {
      // A high split: head and shoulders climb while boots skid lower and faster.
      lift *= part.height > 0.5 ? 1.2 : 0.72;
      speed *= part.part === "leg" ? 1.12 : 0.83;
    }

    return this.spawnPart(enemy, impact, {
      part: part.part,
      side: part.side,
      vx: away * Math.min(400, speed),
      vy: -Math.min(270, lift),
      rotation: (this.random() - 0.5) * 0.7,
      spin: spin,
      bounceX: 0.22,
      bounceY: index === 0 ? 0.32 : 0.24,
      friction: part.part === "torso" ? 150 : 190,
      bleed: true
    });
  });

  let blood = this.delegate.bloodEffects;
  if (blood) {
    blood.burst(pose.x, centerY, pose.room, {
      direction: direction,
      strength: 1.8,
      count: 25,
      vx: direction * 135,
      vy: -110
    });
  }

  return { variant: ["blast-scatter", "blast-wheel", "blast-lift"][variant], parts: parts };
};
