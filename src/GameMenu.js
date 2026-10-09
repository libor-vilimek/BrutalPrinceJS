"use strict";

PrinceJS.GameMenu = function (game) {
  this.game = game;
  this.isOpen = false;
  this.corner = document.createElement("div");
  this.corner.className = "menu-corner";
  this.corner.innerHTML = `<button class="menu-toggle" type="button" aria-label="Open settings" aria-haspopup="dialog" aria-expanded="false" aria-controls="game-menu-panel" title="Settings (Esc)">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
  </button>`;
  this.toggle = this.corner.querySelector("button");
  this.root = document.createElement("div");
  this.root.className = "game-menu";
  this.root.hidden = true;
  this.root.innerHTML = `
    <section id="game-menu-panel" class="game-menu-panel" role="dialog" aria-modal="true" aria-labelledby="game-menu-title" tabindex="-1">
      <header class="game-menu-header">
        <div><p class="game-menu-eyebrow">Brutal Prince of Persia</p><h1 id="game-menu-title">Settings</h1></div>
        <button class="menu-close" type="button" aria-label="Close settings">×</button>
      </header>
      <div class="menu-settings">
        <p class="menu-description">Make yourself at home. The world can wait.</p>
        ${["sound", "music"]
          .map(
            (channel) => `
          <div class="menu-audio">
            <label for="${channel}-volume">${channel === "sound" ? "Sound effects" : "Music"}</label>
            <output for="${channel}-volume" id="${channel}-value"></output>
            <input id="${channel}-volume" type="range" min="0" max="100" step="1">
            <button type="button" data-mute="${channel}" aria-pressed="false">Mute</button>
          </div>`
          )
          .join("")}
        <label class="menu-touch-setting"><span>On-screen controls<small>Movement and actions at the bottom left</small></span><input id="touch-enabled" type="checkbox" role="switch"></label>
        <button class="menu-controls-button" type="button">Controls <span aria-hidden="true">→</span></button>
        <p class="menu-note">Your preferences are saved on this device.</p>
      </div>
      <div class="menu-controls" hidden>
        <p class="menu-description">Hold buttons to keep moving or attacking. Combine directions with Jump or Walk / Grab.</p>
        <h2>Movement</h2>
        <dl>
          <dt>← / →</dt><dd>Move left / right</dd>
          <dt>↑</dt><dd>Jump or climb up; combine with left / right for a running jump</dd>
          <dt>↓</dt><dd>Crouch, crawl or climb down</dd>
          <dt>Shift</dt><dd>Walk slowly, drink a potion or grab / hold an edge</dd>
          <dt>Shift + ↓</dt><dd>Lower yourself to hang from an edge</dd>
        </dl>
        <h2>Weapons &amp; equipment</h2>
        <dl>
          <dt>Ctrl / F</dt><dd>Hold to draw and fire the selected weapon or spin the torches</dd>
          <dt>Molotov</dt><dd>Hold Fire to charge; release to throw. Hold ↑ for a high arc. While hanging, Fire lights and drops it straight down.</dd>
          <dt>1 · 2 · 3 · 4</dt><dd>Select torches · molotov · minigun · rocket launcher, when owned</dd>
          <dt>X</dt><dd>Whip: tap for one lash, hold to repeat. A caught ankle pull finishes after release.</dd>
          <dt>C</dt><dd>Roundhouse kick; hold to repeat. Near an enemy, it can interrupt drawing, stowing or climbing.</dd>
          <dt>J</dt><dd>Equip / remove the jetpack, when owned. Fly with the arrows.</dd>
        </dl>
        <h2>Game</h2>
        <dl>
          <dt>Esc</dt><dd>Open / close settings and pause / resume</dd>
          <dt>Space</dt><dd>Show remaining time</dd>
          <dt>Enter</dt><dd>Continue after death or at the end of a level</dd>
          <dt>Ctrl / Shift + A</dt><dd>Restart this level</dd>
          <dt>Ctrl / Shift + R</dt><dd>Start a new game</dd>
          <dt>Ctrl / Shift + L</dt><dd>Skip a level (levels 1–3 and custom levels)</dd>
        </dl>
        <h2>Touch &amp; mouse</h2>
        <p>Enable on-screen controls on any device. Use multiple fingers for running jumps, grabbing and aiming. Walk / Grab is Shift; Fire is Ctrl; Kick is C; Whip is X. Switch cycles only through owned weapons. Jetpack is J, Time is Space, and Continue resumes after death or a completed level.</p>
        <p>Tap a tutorial's displayed key to try its lesson. With on-screen controls off, the original screen regions remain: left / right edges move, the upper / lower third jumps or crouches, and the center grabs, drinks or uses the selected weapon. Drag between regions to combine actions.</p>
        <p>On the game's bottom status strip, tap to show time. While time or the level is shown, tap the left / center / right part to go back a level / restart / go forward a level.</p>
        <h2>Game controller</h2>
        <p>Sticks or D-pad: move. A / R / ZR: jump. B / Y / L / ZL: grab, drink or use the selected weapon. X: show time; press again while time is shown to restart. Minus / Plus: previous / next level. Any button: continue. Use the keyboard or on-screen buttons for weapon selection, kick, whip and jetpack.</p>
        <button class="menu-back" type="button">← Back to settings</button>
      </div>
      <button class="menu-resume" type="button">Resume game</button>
    </section>`;
  document.body.append(this.corner, this.root);
  this.panel = this.root.querySelector("section");
  this.corner.addEventListener("pointermove", () => this.reveal());
  this.corner.addEventListener("pointerdown", () => this.reveal());
  this.toggle.addEventListener("click", () => (this.isOpen ? this.close() : this.open()));
  this.toggle.addEventListener("focus", () => this.reveal());
  this.root.querySelector(".menu-close").addEventListener("click", () => this.close());
  this.root.querySelector(".menu-resume").addEventListener("click", () => this.close());
  this.root.querySelector(".menu-controls-button").addEventListener("click", () => this.showControls(true));
  this.root.querySelector(".menu-back").addEventListener("click", () => this.showControls(false));
  this.root.addEventListener("click", (event) => {
    if (event.target === this.root) {
      this.close();
    }
  });
  for (const element of [this.root, this.corner]) {
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"]) {
      element.addEventListener(type, (event) => event.stopPropagation());
    }
  }
  for (const channel of ["sound", "music"]) {
    this.root.querySelector(`#${channel}-volume`).addEventListener("input", (event) => {
      this.game.settings.set(channel, Number(event.target.value) / 100);
      this.game.settings.unlockAudio();
      this.syncSettings();
    });
    this.root.querySelector(`[data-mute="${channel}"]`).addEventListener("click", () => {
      this.game.settings.set(channel + "Muted", !this.game.settings.values[channel + "Muted"]);
      this.game.settings.unlockAudio();
      this.syncSettings();
    });
  }
  this.root.querySelector("#touch-enabled").addEventListener("change", (event) => {
    this.game.settings.set("touch", event.target.checked);
    this.game.touchControls.refresh();
  });
  // Installed at boot, before tutorial listeners and Phaser gameplay callbacks.
  window.addEventListener("keydown", (event) => this.onKeyDown(event), true);
  window.addEventListener(
    "keyup",
    (event) => {
      if (this.isOpen) {
        event.stopImmediatePropagation();
      }
    },
    true
  );
  this.syncSettings();
  this.reveal();
};

PrinceJS.GameMenu.prototype = {
  reveal: function () {
    this.corner.classList.add("menu-visible");
    window.clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.corner.classList.remove("menu-visible"), 3500);
  },

  syncSettings: function () {
    const values = this.game.settings.values;
    for (const channel of ["sound", "music"]) {
      const percent = Math.round(values[channel] * 100);
      this.root.querySelector(`#${channel}-volume`).value = percent;
      this.root.querySelector(`#${channel}-value`).textContent = percent + "%";
      const mute = this.root.querySelector(`[data-mute="${channel}"]`);
      mute.textContent = values[channel + "Muted"] ? "Unmute" : "Mute";
      mute.setAttribute(
        "aria-label",
        `${values[channel + "Muted"] ? "Unmute" : "Mute"} ${channel === "sound" ? "sound effects" : "music"}`
      );
      mute.setAttribute("aria-pressed", String(values[channel + "Muted"]));
    }
    this.root.querySelector("#touch-enabled").checked = values.touch;
  },

  open: function () {
    if (this.isOpen) {
      return;
    }
    this.isOpen = true;
    this.ownsPause = !this.game.paused;
    this.keyboardEnabled = this.game.input.keyboard.enabled;
    this.game.touchControls.clear();
    const state = this.game.state.getCurrentState();
    if (state.tutorial) {
      // Key-up events belong to the settings UI while it is open. A key held
      // before opening must not remain "already down" in the next lesson.
      state.tutorial.downKeys.clear();
      if (!state.tutorial.active) {
        state.tutorial.cancelAssist();
      }
    }
    if (this.ownsPause) {
      this.pauseTime = new Date();
      this.startTime = PrinceJS.startTime;
      PrinceJS.menuPauseTime = this.pauseTime;
    }
    this.game.input.reset(false);
    this.game.input.keyboard.enabled = false;
    this.game.paused = true;
    this.root.hidden = false;
    this.toggle.setAttribute("aria-expanded", "true");
    this.corner.classList.add("menu-open");
    this.game.touchControls.root.inert = true;
    this.showControls(false);
    this.syncSettings();
  },

  close: function () {
    if (!this.isOpen) {
      return;
    }
    this.root.hidden = true;
    this.game.input.keyboard.enabled = this.keyboardEnabled;
    if (this.ownsPause) {
      if (PrinceJS.startTime && PrinceJS.startTime === this.startTime) {
        PrinceJS.startTime = new Date(PrinceJS.startTime.getTime() + Date.now() - this.pauseTime.getTime());
      }
      PrinceJS.menuPauseTime = null;
      this.game.paused = false;
    }
    this.isOpen = false;
    this.game.touchControls.root.inert = false;
    this.toggle.setAttribute("aria-expanded", "false");
    this.corner.classList.remove("menu-open");
    const tutorial = this.game.state.getCurrentState().tutorial;
    if (tutorial && tutorial.active) {
      tutorial.overlay.focusKey(0);
    } else {
      this.game.canvas.focus({ preventScroll: true });
    }
    this.reveal();
  },

  showControls: function (show) {
    this.root.querySelector(".menu-settings").hidden = show;
    this.root.querySelector(".menu-controls").hidden = !show;
    this.root.querySelector("#game-menu-title").textContent = show ? "Controls" : "Settings";
    this.panel.scrollTop = 0;
    this.root.querySelector(".menu-close").focus({ preventScroll: true });
  },

  onKeyDown: function (event) {
    if (event.key === "Escape" && !event.repeat) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.isOpen ? this.close() : this.open();
      return;
    }
    if (!this.isOpen) {
      return;
    }
    event.stopImmediatePropagation();
    if (event.key === "Tab") {
      event.preventDefault();
      const focusable = Array.from(this.panel.querySelectorAll("button, input")).filter(
        (node) => !node.disabled && node.getClientRects().length
      );
      const index = focusable.indexOf(document.activeElement);
      focusable[(index + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus();
    }
  }
};
