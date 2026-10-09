"use strict";

PrinceJS.TouchControls = function (game) {
  this.game = game;
  this.pointers = new Map();
  this.shiftLocked = false;
  this.root = document.createElement("nav");
  this.root.className = "touch-controls";
  this.root.setAttribute("aria-label", "On-screen game controls");
  this.root.hidden = true;
  this.root.innerHTML = `
    <div class="touch-dpad">
      <button data-code="38" class="touch-up" aria-label="Jump / climb up">↑</button>
      <button data-code="37" class="touch-left" aria-label="Move left">←</button>
      <button data-code="16" class="touch-grab" aria-label="Hold to walk slowly, grab edges or drink">Walk<br>Grab</button>
      <button data-code="39" class="touch-right" aria-label="Move right">→</button>
      <button data-code="40" class="touch-down" aria-label="Crouch / climb down">↓</button>
    </div>
    <div class="touch-actions">
      <button data-code="17" class="touch-fire" aria-label="Hold to fire; release to throw a molotov">Fire</button>
      <button data-code="67" aria-label="Roundhouse kick">Kick</button>
      <button data-code="88" aria-label="Use whip">Whip</button>
      <button data-action="switch" class="touch-switch" aria-label="Switch to next owned weapon">Switch<span class="touch-weapon">Torches</span></button>
      <button data-code="74" aria-label="Toggle jetpack">Jetpack</button>
      <button data-action="shift" data-code="16" class="touch-shift-toggle" aria-label="Toggle Shift" aria-pressed="false">Toggle<br>Shift</button>
      <button data-action="continue" aria-label="Continue game">Continue</button>
    </div>`;
  document.querySelector(".game").appendChild(this.root);
  this.shiftToggle = this.root.querySelector(".touch-shift-toggle");
  this.buttons = Array.from(this.root.querySelectorAll("button"));
  this.buttons.forEach((button) => {
    button.type = "button";
    button.addEventListener("pointerdown", (event) => this.press(event, button));
    button.addEventListener("pointerup", (event) => this.release(event.pointerId));
    button.addEventListener("pointercancel", (event) => this.release(event.pointerId, true));
    button.addEventListener("lostpointercapture", (event) => this.release(event.pointerId, true));
    // Keyboard/assistive activation of buttons uses the same input path.
    button.addEventListener("click", (event) => {
      if (event.detail === 0) {
        this.press({ pointerId: "keyboard", preventDefault() {} }, button);
        window.setTimeout(() => this.release("keyboard"), 120);
      }
    });
  });
  for (const type of ["pointerdown", "pointerup", "click", "touchstart", "touchend", "mousedown", "mouseup"]) {
    this.root.addEventListener(type, (event) => event.stopPropagation());
  }
  window.addEventListener("blur", () => this.clear());
  window.addEventListener("pagehide", () => this.clear());
  window.addEventListener("resize", () => this.clear());
  document.addEventListener("visibilitychange", () => this.clear());
  game.onPause.add(this.clear, this);
};

PrinceJS.TouchControls.prototype = {
  attach: function (state) {
    this.clear();
    this.state = state;
    this.refresh();
  },

  refresh: function () {
    this.clear();
    this.root.hidden = !this.state || !this.game.settings.values.touch;
    this.game.menu?.setControlsVisible(!this.root.hidden);
    this.update();
  },

  isDown: function (code) {
    if (!this.state || this.root.hidden || this.game.paused || !this.state.kid.alive) {
      return false;
    }
    if (this.state.tutorial && this.state.tutorial.isGuidedKey(code)) {
      return false;
    }
    return (code === 16 && this.shiftLocked) || Array.from(this.pointers.values()).some((entry) => entry.code === code);
  },

  press: function (event, button) {
    event.preventDefault();
    if (event.button > 0 || button.disabled || this.root.hidden || !this.state || this.game.paused) {
      return;
    }
    this.game.settings.unlockAudio();
    const code = Number(button.dataset.code);
    const tutorial = this.state.tutorial;
    if (
      tutorial &&
      (tutorial.isGuidedKey(code) || (button.dataset.action === "switch" && tutorial.sequence?.guiding))
    ) {
      return;
    }
    if (code === 67 && tutorial?.sequence?.guiding) {
      tutorial.sequence.cancel();
    }
    const held = this.isDown(code);
    // The toggle commits on a completed tap, not as a held Shift pointer.
    this.pointers.set(event.pointerId, { code: button.dataset.action === "shift" ? null : code, button });
    button.classList.add("pressed");
    if (typeof event.pointerId === "number") {
      button.setPointerCapture(event.pointerId);
    }
    if (held) {
      return;
    }
    if (button.dataset.action === "continue") {
      this.state.buttonPressed();
    } else if (button.dataset.action === "switch") {
      this.cycleWeapon();
    } else if (code === 17) {
      this.state.handleWeaponControl();
    } else if (code === 88) {
      this.state.handleWhipControl();
    } else if (code === 67) {
      this.state.handleKickControl();
    } else if (code === 74) {
      this.state.toggleJetpack();
    }
    this.update();
  },

  release: function (id, cancelled = false) {
    const entry = this.pointers.get(id);
    if (!entry) {
      return;
    }
    this.pointers.delete(id);
    const stillPressed = [...this.pointers.values()].some((other) => other.button === entry.button);
    if (!stillPressed) {
      entry.button.classList.remove("pressed");
    }
    if (
      !cancelled &&
      !stillPressed &&
      entry.button.dataset.action === "shift" &&
      this.state &&
      this.state.kid.alive &&
      !this.root.hidden &&
      !this.game.paused &&
      !this.state.tutorial?.isGuidedKey(16)
    ) {
      this.setShiftLocked(!this.shiftLocked);
    }
    if (!cancelled && entry.code === 17 && !this.isDown(17) && this.state && !this.game.paused) {
      this.state.handleWeaponRelease();
    }
  },

  clear: function () {
    this.pointers.clear();
    this.buttons.forEach((button) => button.classList.remove("pressed"));
    this.setShiftLocked(false);
  },

  setShiftLocked: function (locked) {
    this.shiftLocked = locked;
    this.shiftToggle.setAttribute("aria-pressed", String(locked));
  },

  cycleWeapon: function () {
    const owned = this.state.weapons.filter((weapon) => this.state.kid[weapon.spec.owned]);
    if (owned.length) {
      const index = owned.findIndex((weapon) => weapon.spec.id === this.state.kid.activeWeapon);
      this.state.selectWeapon(owned[(index + 1) % owned.length].spec.id);
    }
  },

  update: function () {
    if (!this.state || this.root.hidden) {
      return;
    }
    const kid = this.state.kid;
    if (!kid.alive) {
      this.clear();
    }
    const weapon = this.state.weapons.find((item) => item.spec.id === kid.activeWeapon);
    this.root.querySelector(".touch-weapon").textContent = weapon ? weapon.spec.label : "Torches";
    this.root.querySelector('[data-code="88"]').disabled = !kid.hasWhip;
    this.root.querySelector('[data-code="74"]').disabled = !kid.hasJetpack;
    this.root.querySelector('[data-code="74"]').setAttribute("aria-pressed", String(!!kid.jetpackEquipped));
  }
};
