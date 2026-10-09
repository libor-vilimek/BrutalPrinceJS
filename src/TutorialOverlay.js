"use strict";

PrinceJS.TutorialOverlay = function (accept) {
  this.accept = accept;
  this.root = document.createElement("div");
  this.root.className = "tutorial-overlay";
  this.root.hidden = true;
  this.root.innerHTML = `
    <section class="tutorial-panel" role="dialog" aria-modal="true" aria-labelledby="tutorial-title"
      aria-describedby="tutorial-description tutorial-instruction tutorial-hint" tabindex="-1">
      <div class="tutorial-corners" aria-hidden="true"></div>
      <p class="tutorial-eyebrow">The Prince's training</p>
      <div class="tutorial-emblem" aria-hidden="true">
        <svg viewBox="0 0 120 120" fill="none">
          <path d="M60 3 77 19 100 20 101 43 117 60 101 77 100 100 77 101 60 117 43 101 20 100 19 77 3 60 19 43 20 20 43 19Z"/>
          <path d="m60 12 14 15 20-1-1 20 15 14-15 14 1 20-20-1-14 15-14-15-20 1 1-20-15-14 15-14-1-20 20 1Z"/>
          <circle cx="60" cy="60" r="31"/>
          <path class="tutorial-flame" d="M60 32c3 12 16 15 16 28 0 10-7 18-16 18s-16-8-16-18c0-7 4-13 9-18-1 8 2 10 4 11 6-6 6-12 3-21Z"/>
          <path d="M53 83h14m-7-4v12"/>
        </svg>
      </div>
      <p class="tutorial-category"></p>
      <h1 id="tutorial-title"></h1>
      <p id="tutorial-description" class="tutorial-description"></p>
      <div class="tutorial-divider" aria-hidden="true"><span>◆</span></div>
      <p class="tutorial-prompt">Press to try</p>
      <div class="tutorial-keys"></div>
      <p id="tutorial-instruction" class="tutorial-instruction"></p>
      <p id="tutorial-hint" class="tutorial-hint"></p>
      <p class="tutorial-footer">The world waits while you read</p>
    </section>`;
  const ornament = `<svg viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <path d="M5 95V5h90M13 80V13h67M21 68V21h47M5 45h14l12-14V5M13 57l16-16 12 12-12 12-16-16M57 13 41 29l12 12 12-12-16-16M21 21l20 20M38 74l18-18 18 18-18 18ZM74 38 56 56l18 18 18-18Z"/>
    <path class="tutorial-ornament-fill" d="m56 45 11 11-11 11-11-11ZM25 25h8v8h-8Z"/>
    <circle cx="80" cy="20" r="3"/><circle cx="20" cy="80" r="3"/>
  </svg>`;
  this.root.querySelector(".tutorial-corners").innerHTML = ornament.repeat(4);
  this.panel = this.root.querySelector(".tutorial-panel");
  this.root.addEventListener("pointerdown", (event) => event.stopPropagation());
  this.root.addEventListener("pointerup", (event) => event.stopPropagation());
  this.root.addEventListener("click", (event) => event.stopPropagation());
  document.body.appendChild(this.root);
};

PrinceJS.TutorialOverlay.prototype = {
  show: function (lesson) {
    this.previousFocus = document.activeElement;
    for (const [selector, value] of [
      [".tutorial-category", lesson.category || "A new skill"],
      ["#tutorial-title", lesson.title],
      ["#tutorial-description", lesson.description],
      ["#tutorial-instruction", lesson.instruction || ""],
      ["#tutorial-hint", lesson.hint || ""]
    ]) {
      this.root.querySelector(selector).textContent = value;
    }
    const keys = this.root.querySelector(".tutorial-keys");
    keys.replaceChildren();
    lesson.keys.forEach((key, index) => {
      if (index) {
        const or = document.createElement("span");
        or.className = "tutorial-or";
        or.textContent = "or";
        keys.appendChild(or);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tutorial-key";
      button.setAttribute("aria-label", "Press " + key.label + " to try " + lesson.title);
      button.textContent = key.label;
      button.addEventListener("click", () => this.accept(key.code));
      keys.appendChild(button);
    });
    this.root.hidden = false;
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
