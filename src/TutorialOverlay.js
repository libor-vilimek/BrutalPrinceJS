"use strict";

PrinceJS.TutorialOverlay = function (accept, game) {
  this.accept = accept;
  this.game = game;
  this.root = document.createElement("div");
  this.root.className = "tutorial-overlay";
  this.root.hidden = true;
  this.root.innerHTML = `
    <section class="tutorial-panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-title"
      aria-describedby="tutorial-description tutorial-instruction tutorial-hint" tabindex="-1">
      <div class="tutorial-page">
        <p class="tutorial-category"></p>
        <h1 id="tutorial-title"></h1>
        <div class="tutorial-lesson">
          <figure class="tutorial-illustration" aria-hidden="true">
            <div class="tutorial-prince"></div>
            <div class="tutorial-art-weapon"></div>
            <div class="tutorial-art-floor"></div>
          </figure>
          <p id="tutorial-description" class="tutorial-description"></p>
        </div>
        <div class="tutorial-inventory" hidden></div>
        <div class="tutorial-divider" aria-hidden="true"></div>
        <p id="tutorial-instruction" class="tutorial-instruction"></p>
        <p id="tutorial-hint" class="tutorial-hint"></p>
      </div>
      <div class="tutorial-action">
        <p class="tutorial-prompt">Press to try</p>
        <div class="tutorial-keys"></div>
      </div>
    </section>`;
  this.panel = this.root.querySelector(".tutorial-panel");
  const prompt = this.root.querySelector(".tutorial-prompt");
  this.setText(prompt, prompt.textContent);
  this.root.addEventListener("pointerdown", (event) => event.stopPropagation());
  this.root.addEventListener("pointerup", (event) => event.stopPropagation());
  this.root.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(this.root);
};

PrinceJS.TutorialOverlay.prototype = {
  // The large serif alphabet comes from the native title/story artwork. Each
  // 20px atlas cell preserves the original baseline and unsmoothed pixels.
  // Whole words wrap naturally; the exact lesson text remains accessible.
  setText: function (element, text) {
    element.textContent = text;
    if (!text) {
      return;
    }
    const readable = document.createElement("span");
    readable.className = "tutorial-readable";
    readable.textContent = text;
    const pixels = document.createElement("span");
    pixels.className = "tutorial-bitmap";
    pixels.setAttribute("aria-hidden", "true");
    for (const word of text.split(/\s+/)) {
      if (!word) {
        continue;
      }
      const run = document.createElement("span");
      run.className = "tutorial-word";
      for (const character of word) {
        const symbol = PrinceJS.TutorialOverlay.SYMBOLS[character];
        const code = character.charCodeAt(0);
        const cell = (code >= 32 && code <= 126 ? code : 63) - 32;
        const advance = symbol ? 10 : PrinceJS.TutorialOverlay.STORY_WIDTHS[cell];
        const letter = document.createElement("span");
        letter.className = "tutorial-letter";
        letter.style.width = advance + "em";
        if (symbol) {
          symbol.forEach((row, y) => {
            [...row].forEach((pixel, x) => {
              if (pixel === "1") {
                const dot = document.createElement("i");
                dot.className = "tutorial-symbol-pixel";
                dot.style.left = x + "em";
                dot.style.top = y + 4 + "em";
                letter.appendChild(dot);
              }
            });
          });
        } else {
          const ink = document.createElement("i");
          ink.className = "tutorial-glyph";
          ink.style.width = advance - 1 + "em";
          ink.style.maskPosition = -(cell % 16) * 20 + "em " + -Math.floor(cell / 16) * 20 + "em";
          letter.appendChild(ink);
        }
        run.appendChild(letter);
      }
      pixels.appendChild(run);
    }
    element.replaceChildren(readable, pixels);
  },

  illustrate: function (lesson) {
    const illustration = this.root.querySelector(".tutorial-illustration");
    illustration.hidden = !!lesson.inventory?.length;
    const hanging = lesson.id.startsWith("ledge") || lesson.id === "whip-pull";
    illustration.dataset.pose = hanging ? "ledge" : "stand";
    const picture = this.root.querySelector(".tutorial-prince");
    const frame = this.game && this.game.cache.getFrameByName("kid", "kid-" + (hanging ? 87 : 15));
    picture.hidden = !frame;
    if (frame) {
      const atlas = this.game.cache.getImage("kid");
      Object.assign(picture.style, {
        width: frame.width + "em",
        height: frame.height + "em",
        backgroundSize: atlas.width + "em " + atlas.height + "em",
        backgroundPosition: -frame.x + "em " + -frame.y + "em"
      });
    }
    const id = lesson.id.includes("minigun")
      ? "minigun"
      : lesson.id.includes("rocket")
        ? "rocketLauncher"
        : lesson.id === "twin-torches"
          ? "twinTorches"
          : null;
    const weapon = this.root.querySelector(".tutorial-art-weapon");
    weapon.innerHTML =
      '<svg viewBox="0 0 64 40" aria-hidden="true">' +
      (id
        ? PrinceJS.TutorialOverlay.WEAPONS[id].art
        : hanging
          ? '<path fill="#e9c56c" d="M29 4h6v20h9l-12 12-12-12h9z"/>'
          : lesson.id === "jetpack-equip"
            ? '<path fill="#e9c56c" d="M29 36h6V16h9L32 4 20 16h9z"/>'
            : '<path fill="#e9c56c" d="M44 9H20V4L9 15l11 10v-7h20v12H24v6h22v-3h3V12h-5z"/>') +
      "</svg>";
  },

  show: function (lesson) {
    this.previousFocus = document.activeElement;
    for (const [selector, value] of [
      [".tutorial-category", lesson.category || "A new skill"],
      ["#tutorial-title", lesson.title],
      ["#tutorial-description", lesson.description],
      ["#tutorial-instruction", lesson.instruction || ""],
      ["#tutorial-hint", lesson.hint || ""]
    ]) {
      this.setText(this.root.querySelector(selector), value);
    }
    const keys = this.root.querySelector(".tutorial-keys");
    keys.replaceChildren();
    lesson.keys.forEach((key, index) => {
      if (index) {
        const or = document.createElement("span");
        or.className = "tutorial-or";
        this.setText(or, "or");
        keys.appendChild(or);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tutorial-key";
      const label = [...(key.modifiers || []).map((code) => (code === 16 ? "Shift" : String(code))), key.label].join(
        " + "
      );
      button.setAttribute("aria-label", "Press " + label + " to try " + lesson.title);
      this.setText(button, label);
      button.addEventListener("click", () => this.accept(key.code));
      keys.appendChild(button);
    });
    const inventory = this.root.querySelector(".tutorial-inventory");
    inventory.replaceChildren();
    inventory.hidden = !lesson.inventory || !lesson.inventory.length;
    for (const id of lesson.inventory || []) {
      const weapon = PrinceJS.TutorialOverlay.WEAPONS[id];
      const card = document.createElement("div");
      card.className = "tutorial-weapon";
      const picture = document.createElement("div");
      picture.className = "tutorial-weapon-picture";
      picture.innerHTML = '<svg viewBox="0 0 64 40" aria-hidden="true">' + weapon.art + "</svg>";
      const label = document.createElement("span");
      this.setText(label, weapon.key + " - " + weapon.label);
      card.append(picture, label);
      inventory.appendChild(card);
    }
    this.illustrate(lesson);
    this.root.hidden = false;
    this.root.querySelector(".tutorial-page").scrollTop = 0;
    this.panel.focus({ preventScroll: true });
  },

  focusKey: function (direction) {
    const buttons = [...this.root.querySelectorAll("button")];
    const index = buttons.indexOf(document.activeElement);
    const next =
      index < 0 ? (direction < 0 ? buttons.length - 1 : 0) : (index + direction + buttons.length) % buttons.length;
    buttons[next].focus({ preventScroll: true });
  },

  hide: function () {
    this.root.hidden = true;
    if (this.previousFocus && this.previousFocus.isConnected) {
      this.previousFocus.focus({ preventScroll: true });
    }
  },

  destroy: function () {
    this.root.remove();
  }
};

// Advances for the 16-column, 20px-cell story alphabet (ASCII 32 through 126).
PrinceJS.TutorialOverlay.STORY_WIDTHS = [
  6, 4, 9, 11, 11, 13, 13, 5, 7, 7, 11, 10, 5, 7, 4, 13, 10, 10, 10, 10, 11, 10, 10, 10, 10, 10, 4, 5, 9, 7, 9, 10, 10,
  14, 10, 10, 10, 9, 10, 14, 10, 7, 7, 11, 11, 13, 10, 15, 11, 10, 12, 10, 10, 10, 14, 13, 10, 10, 13, 7, 13, 7, 10, 10,
  7, 11, 11, 9, 11, 9, 7, 11, 12, 6, 7, 11, 6, 18, 12, 10, 11, 11, 9, 8, 7, 12, 9, 16, 10, 10, 10, 7, 4, 7, 11
];

// Supplemental 7-pixel symbols match the original font's pixel grid.
PrinceJS.TutorialOverlay.SYMBOLS = {
  "↓": ["0001000", "0001000", "0001000", "1001001", "0101010", "0011100", "0001000"],
  "↑": ["0001000", "0011100", "0101010", "1001001", "0001000", "0001000", "0001000"]
};

// Drawn on a fixed pixel grid and displayed only at integral scales.
PrinceJS.TutorialOverlay.WEAPONS = {
  twinTorches: {
    key: "1",
    label: "Twin torches",
    art: '<path fill="#704127" d="m17 34 4-22 4 1-4 22zm25 0-4-22 4-1 4 22z"/><path fill="#ffd269" d="M18 15V8l4-7 2 8 4-3v9zm18 0V7l5-6 1 7 4-2v9z"/><path fill="#f07726" d="m20 14 1-6 4 6zm19 0 2-7 3 7z"/>'
  },
  molotov: {
    key: "2",
    label: "Molotov",
    art: '<path fill="#deb67d" d="M32 7V2h6v3h-3v4z"/><path fill="#244d39" d="M29 6h6v8l5 5v17H24V19l5-5z"/><path fill="#679366" d="M27 20h3v13h-3z"/><path fill="#e5d3a1" d="M25 24h14v7H25z"/><path fill="#ad7346" d="M29 26h6v3h-6z"/>'
  },
  minigun: {
    key: "3",
    label: "Minigun",
    art: '<path fill="#3d4142" d="M6 15h17v-5h16v6h19v12H30v7h-9v-8H6z"/><path fill="#8b9699" d="M29 17h28v3H29zm0 7h28v3H29zM11 16h9v8h-9z"/><path fill="#ba9873" d="M23 28h5v6h-5z"/><path fill="#24282a" d="M49 14h5v16h-5z"/>'
  },
  rocketLauncher: {
    key: "4",
    label: "Rockets",
    art: '<path fill="#3e5148" d="M5 15h48v13H5z"/><path fill="#859184" d="M7 16h44v4H7z"/><path fill="#303b39" d="M3 12h7v18H3zm46 0h8v19h-8zM20 27h7v9h-7z"/><path fill="#bfa678" d="M28 12h9v3h-9z"/><path fill="#242c2b" d="M55 16h5v11h-5z"/>'
  }
};
