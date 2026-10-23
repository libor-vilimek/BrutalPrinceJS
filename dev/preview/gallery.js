"use strict";

const frame = document.getElementById("engine");
const send = (action, value) =>
  frame.contentWindow.postMessage({ type: "prince-preview-control", action, value }, window.location.origin);
let current = "casings";
let paused = false;

document.querySelectorAll("[data-demo]").forEach((button) => {
  button.addEventListener("click", () => {
    current = button.dataset.demo;
    document
      .querySelectorAll("[data-demo]")
      .forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
    document.getElementById("demo-title").textContent = button.textContent;
    document.getElementById("standalone").href = "engine.html?demo=" + encodeURIComponent(current);
    document.getElementById("timeline-control").hidden = current !== "finale";
    document.getElementById("walk-control").hidden = !current.includes("casings");
    send("select", current);
  });
});
document.getElementById("replay").addEventListener("click", () => send("select", current));
document.getElementById("pause").addEventListener("click", () => send("pause", !paused));
document.getElementById("auto-walk").addEventListener("change", (event) => send("auto-walk", event.target.checked));
document.getElementById("timeline").addEventListener("input", (event) => send("seek", Number(event.target.value)));
window.addEventListener("message", (event) => {
  if (
    event.source !== frame.contentWindow ||
    event.origin !== window.location.origin ||
    event.data?.type !== "prince-preview-status"
  ) {
    return;
  }
  const data = event.data;
  paused = data.paused;
  document.getElementById("pause").textContent = paused ? "Resume" : "Pause";
  document.getElementById("pause").setAttribute("aria-pressed", String(paused));
  document.getElementById("status").textContent = data.message;
  document.getElementById("clock").textContent = data.ready
    ? `${data.elapsed.toFixed(1)}s${data.duration ? " / " + data.duration + "s" : ""}`
    : "";
  if (document.activeElement !== document.getElementById("timeline")) {
    document.getElementById("timeline").value = data.elapsed;
  }
});
