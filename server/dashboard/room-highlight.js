"use strict";

// Attach each overlay to the artwork itself: animation, facing, cropping, camera and layer order stay in sync.
PrinceJS.RoomHighlight = function (game, sources, includeChildren = true) {
  this.parts = [];
  const visit = (source) => {
    const children = source.children.slice();
    if (source.texture?.baseTexture?.source) {
      const mask = game.make.bitmapData(1, 1);
      const bitmap = game.make.bitmapData(1, 1);
      mask.smoothed = bitmap.smoothed = false;
      const overlay = game.make.sprite(0, 0, bitmap);
      overlay.smoothed = false;
      // Draw the tint over this sprite, then let its original children keep their foreground order.
      source.addChildAt(overlay, 0);
      this.parts.push({ source, mask, bitmap, overlay });
    }
    if (includeChildren) {
      children.forEach(visit);
    }
  };
  sources.filter(Boolean).forEach(visit);
  this.update();
};

PrinceJS.RoomHighlight.prototype.update = function (alpha = 1) {
  const padding = 3;
  for (const part of this.parts) {
    const { source, mask, bitmap, overlay } = part;
    const { crop, frame, trim, baseTexture } = source.texture;
    const resolution = baseTexture.resolution || 1;
    // Phaser anchors refer to the untrimmed frame, while crop contains only the atlas pixels actually rendered.
    overlay.x =
      ((trim ? trim.x - source.anchor.x * trim.width : -source.anchor.x * frame.width) - padding) / resolution;
    overlay.y =
      ((trim ? trim.y - source.anchor.y * trim.height : -source.anchor.y * frame.height) - padding) / resolution;
    overlay.scale.setTo(1 / resolution);
    overlay.alpha = alpha;
    overlay.visible = crop.width > 0 && crop.height > 0;
    if (!overlay.visible) {
      continue;
    }
    const key = [crop.x, crop.y, crop.width, crop.height].join(":");
    if (part.image === baseTexture.source && part.key === key) {
      continue;
    }
    part.image = baseTexture.source;
    part.key = key;
    mask.resize(crop.width, crop.height);
    mask.clear();
    const ctx = mask.ctx;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(baseTexture.source, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "#ffc857";
    ctx.fillRect(0, 0, crop.width, crop.height);
    ctx.globalCompositeOperation = "source-over";

    bitmap.resize(crop.width + padding * 2, crop.height + padding * 2);
    bitmap.clear();
    const glow = bitmap.ctx;
    glow.globalCompositeOperation = "source-over";
    // A soft outer halo and a crisp one-pixel silhouette, with a translucent tint over the original artwork.
    for (const [radius, opacity] of [
      [3, 0.12],
      [1, 0.9]
    ]) {
      glow.globalAlpha = opacity;
      for (const [dx, dy] of [
        [-radius, 0],
        [radius, 0],
        [0, -radius],
        [0, radius]
      ]) {
        glow.drawImage(mask.canvas, padding + dx, padding + dy);
      }
    }
    glow.globalAlpha = 1;
    glow.globalCompositeOperation = "destination-out";
    glow.drawImage(mask.canvas, padding, padding);
    glow.globalCompositeOperation = "source-over";
    glow.globalAlpha = 0.3;
    glow.drawImage(mask.canvas, padding, padding);
    glow.globalAlpha = 1;
    bitmap.dirty = true;
  }
};
