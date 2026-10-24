"use strict";

const byId = (id) => document.getElementById(id);
const number = (value) => new Intl.NumberFormat("en").format(value || 0);
const duration = (ms) => `${(ms / 3600000).toFixed(1)}h`;
const title = (value) => (value || "unknown").replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) {
    node.textContent = text;
  }
  if (className) {
    node.className = className;
  }
  return node;
}
function empty(node) {
  node.append(element("p", "No observations in this period.", "empty"));
}
function svg(tag, attrs, text) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    node.setAttribute(key, value);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}
function trend(id, rows, { daysRange, rangeStart }, key, color, label) {
  const root = byId(id);
  root.replaceChildren();
  if (!rows.length) {
    empty(root);
    return;
  }
  const days = new Map(rows.map((row) => [row._id, row]));
  const values = [];
  const start = rangeStart ? Date.parse(rangeStart) : Date.now() - (daysRange - 1) * 86400000;
  for (let index = 0; index < daysRange; index++) {
    const key = new Date(start + index * 86400000).toISOString().slice(0, 10);
    values.push(days.get(key) || { _id: key, princeDeaths: 0, enemyDeaths: 0 });
  }
  const chart = svg("svg", { viewBox: "0 0 620 200", role: "img", "aria-label": label });
  const maximum = Math.ceil(Math.max(1, ...values.map((row) => row[key] || 0)) / 4) * 4;
  for (let i = 0; i <= 4; i++) {
    const y = 15 + i * 37;
    chart.append(
      svg("line", { x1: 52, x2: 610, y1: y, y2: y, stroke: "#2b2e33" }),
      svg("text", { x: 44, y: y + 4, "text-anchor": "end" }, number((maximum * (4 - i)) / 4))
    );
  }
  const slot = 558 / values.length;
  values.forEach((row, index) => {
    const value = row[key] || 0;
    const height = (value / maximum) * 148;
    const description = `${row._id} UTC: ${number(value)}`;
    const bar = svg("rect", {
      x: 52 + index * slot + slot * 0.15,
      y: 163 - height,
      width: slot * 0.7,
      height: Math.max(1, height),
      fill: color,
      opacity: value ? 1 : 0.25,
      "data-day": row._id,
      "data-count": value,
      "aria-label": description,
      tabindex: 0
    });
    bar.append(svg("title", {}, description));
    bar.addEventListener("focus", () => {
      byId(`${id}-value`).textContent = description;
    });
    bar.addEventListener("pointerenter", () => {
      byId(`${id}-value`).textContent = description;
    });
    bar.addEventListener("click", () => {
      byId(`${id}-value`).textContent = description;
    });
    chart.append(bar);
  });
  chart.append(
    svg("text", { x: 52, y: 190 }, values[0]._id.slice(5)),
    svg("text", { x: 610, y: 190, "text-anchor": "end" }, values.at(-1)._id.slice(5))
  );
  root.append(chart);
  root.append(element("p", "Select a day to see its count.", "footnote"));
  root.lastChild.id = `${id}-value`;
}
function previewTarget(row) {
  const id = row._id;
  return {
    level: id.level,
    map: id.map,
    revision: id.revision,
    room: id.spawn?.roomId ?? id.room,
    recordedRoom: id.room,
    guard: id.guard,
    column: id.spawn?.tileColumn ?? id.column,
    row: id.spawn?.tileRow ?? id.row,
    tileType: id.tileType
  };
}
function showPreview(target, label) {
  const dialog = byId("room-preview");
  byId("preview-title").textContent = label;
  const query = new window.URLSearchParams();
  for (const [key, value] of Object.entries(target)) {
    if (value !== null && value !== undefined) {
      query.set(key, value);
    }
  }
  const frame = element("iframe");
  frame.title = `Room preview: ${label}`;
  frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
  frame.src = `/statistics/room-preview?${query}`;
  byId("preview-content").replaceChildren(frame);
  if (!dialog.open) {
    dialog.showModal();
  }
}
function ranks(id, rows, details, primary, relative = false) {
  const root = byId(id);
  root.replaceChildren();
  if (!rows.length) {
    empty(root);
  }
  rows.forEach((row, index) => {
    const item = element("button", undefined, "rank");
    item.type = "button";
    const name = element("span", details(row)[0], "rank-name");
    name.append(element("small", details(row)[1]));
    item.title = "View this source in the room";
    item.addEventListener("click", () => showPreview(previewTarget(row), details(row)[0]));
    const value = element("span", relative ? row.killsPer100Starters.toFixed(1) : number(row[primary]), "rank-value");
    value.append(
      element(
        "small",
        relative
          ? `${number(row.kills)} deaths / ${number(row.levelStarters)} clients`
          : primary === "hpLost"
            ? `${number(row.kills)} kills · ${number(row.hits)} hits`
            : `${number(row.hpLost)} HP lost`
      )
    );
    item.append(element("span", String(index + 1).padStart(2, "0"), "rank-number"), name, value);
    root.append(item);
  });
}
function render(data) {
  byId("sample").hidden = !data.sampleData;
  byId("storage").textContent = data.storage ? `${data.storage.database}.${data.storage.collection}` : "";
  byId("data-counts").textContent = (data.dataSources || [])
    .map((row) => `${number(row.events)} ${row._id === "samples" ? "sample" : "gameplay"} observations`)
    .join(" · ");
  const deathsTable = byId("latest-deaths");
  deathsTable.replaceChildren();
  for (const death of data.latestDeaths || []) {
    const row = element("tr");
    for (const value of [
      new Date(death.receivedAt).toLocaleString(),
      `Level ${death.levelNumber}`,
      title(death.payload.mechanism),
      death.location?.roomId ?? "unknown",
      number(death.count || 1),
      death.sampleData ? "Sample" : "Gameplay"
    ]) {
      row.append(element("td", value));
    }
    const source = death.payload.source || {};
    const button = element("button", title(death.payload.mechanism), "text-button");
    button.addEventListener("click", () =>
      showPreview(
        {
          level: death.levelNumber,
          map: death.mapId,
          revision: death.mapRevision,
          room: source.spawnLocation?.roomId ?? source.roomId ?? death.location?.roomId,
          recordedRoom: source.roomId,
          guard: source.guardId,
          column: source.spawnLocation?.tileColumn ?? source.tileColumn ?? death.location?.tileColumn,
          row: source.spawnLocation?.tileRow ?? source.tileRow ?? death.location?.tileRow,
          tileType: source.tileType
        },
        `${title(death.payload.mechanism)} · Level ${death.levelNumber}`
      )
    );
    row.children[2].replaceChildren(button);
    deathsTable.append(row);
  }
  if (!deathsTable.children.length) {
    const row = element("tr");
    const cell = element("td", "No Prince deaths in this selection.");
    cell.colSpan = 6;
    row.append(cell);
    deathsTable.append(row);
  }
  const t = data.totals;
  const metrics = byId("metrics");
  metrics.replaceChildren();
  for (const [label, value, note, id] of [
    ["Prince deaths", number(t.princeDeaths), "Observed fatal outcomes"],
    ["Enemies defeated", number(t.enemyDeaths), "One kill per actor per attempt"],
    ["Level attempts", number(t.starts), `${number(t.observations)} additional partial observations`],
    [
      "Completion rate",
      t.starts ? `${Math.round((t.completed / t.starts) * 100)}%` : "—",
      `${number(t.completed)} full attempts completed`
    ],
    ["Active play", duration(t.activeMs), `${number(t.hpLost)} Prince HP lost`],
    ["Currently playing", number(data.currentlyPlaying), "Unique clients · last 180s · all levels", "currently-playing"]
  ]) {
    const card = element("article", undefined, "metric");
    if (id) {
      card.id = id;
    }
    card.append(
      element("div", label, "metric-label"),
      element("div", value, "metric-value"),
      element("div", note, "metric-note")
    );
    metrics.append(card);
  }
  trend("prince-trend", data.days, data, "princeDeaths", "#eb8174", "Prince deaths per UTC day");
  trend("enemy-trend", data.days, data, "enemyDeaths", "#dbb56d", "Enemies defeated per UTC day");
  const causes = byId("causes");
  causes.replaceChildren();
  const deaths = data.causes.filter((row) => row._id.type === "prince_died").slice(0, 6);
  if (!deaths.length) {
    empty(causes);
  }
  for (const row of deaths) {
    const item = element("div");
    const label = element("div", title(row._id.cause), "bar-label");
    label.append(element("span", `${number(row.deaths)} · ${Math.round((row.deaths / t.princeDeaths) * 100)}%`));
    const track = element("div", undefined, "track");
    const fill = element("div", undefined, "fill");
    fill.style.width = `${(row.deaths / Math.max(...deaths.map((r) => r.deaths))) * 100}%`;
    track.append(fill);
    item.append(label, track);
    causes.append(item);
  }
  const levels = byId("levels");
  levels.replaceChildren();
  for (const row of data.levels) {
    const tr = element("tr");
    const name = element("td", `Level ${row._id.level}`);
    name.append(element("small", `${row._id.map} · ${row._id.revision.slice(0, 8)}`));
    tr.append(name);
    for (const value of [
      number(row.starts),
      number(row.completed),
      row.starts ? `${Math.round((row.completed / row.starts) * 100)}%` : "—",
      number(row.princeDeaths),
      number(row.enemyDeaths),
      duration(row.activeMs)
    ]) {
      tr.append(element("td", value));
    }
    levels.append(tr);
  }
  if (!data.levels.length) {
    const row = element("tr");
    const cell = element("td", "No level observations.");
    cell.colSpan = 7;
    row.append(cell);
    levels.append(row);
  }
  const guardDetails = (r) => [
    `Guard #${r._id.guard} · Level ${r._id.level}`,
    `Room ${r._id.room ?? r._id.spawn?.roomId ?? "unknown"} · spawn ${r._id.spawn?.roomId ?? "unknown"} · ${r._id.map} / ${r._id.revision.slice(0, 8)}`
  ];
  const trapDetails = (r) => [
    `${title(r._id.cause)} · Level ${r._id.level}`,
    `Room ${r._id.room ?? "unknown"} · tile ${r._id.column ?? "?"}, ${r._id.row ?? "?"} · revision ${r._id.revision.slice(0, 8)}`
  ];
  ranks("guards", data.guards, guardDetails, "hpLost");
  ranks("traps", data.traps, trapDetails, "kills");
  ranks("guards-per-player", data.guardsPerPlayer || [], guardDetails, "kills", true);
  ranks("traps-per-player", data.trapsPerPlayer || [], trapDetails, "kills", true);
  const weapons = byId("weapons");
  weapons.replaceChildren();
  if (!data.weapons.length) {
    empty(weapons);
  }
  for (const row of data.weapons) {
    const item = element("div", undefined, "weapon");
    item.append(
      element("h3", title(row._id)),
      element("strong", number(row.kills)),
      element("span", " kills", "subtle"),
      element("p", `${number(row.shots)} uses · ${number(row.hits)} hits`)
    );
    weapons.append(item);
  }
  const select = byId("level");
  const milestones = byId("milestones");
  milestones.replaceChildren();
  const milestoneRows = new Map((data.milestones || []).map((row) => [row._id, row]));
  for (const [key, label, unit] of [
    ["exitDoors", "Blasted the level exit", "exit doors destroyed"],
    ["healthPotions", "Drank a max-health potion", "potions consumed"],
    ["jaffar", "Defeated Jaffar", "Jaffar defeats"],
    ["jetpack", "Used the jetpack", "activations"],
    ["laserRockets", "Rocket intercepted · Level 6", "rockets intercepted"],
    ["doors", "Destroyed doors", "doors destroyed"],
    ["walls", "Destroyed walls", "wall tiles destroyed"]
  ]) {
    const row = milestoneRows.get(key) || {};
    const card = element("div", undefined, "weapon");
    card.dataset.milestone = key;
    card.append(
      element("h3", label),
      element("strong", number(row.clients)),
      element("span", " clients", "subtle"),
      element("p", `${number(row.occurrences)} ${unit}`)
    );
    milestones.append(card);
  }
  const selected = select.value;
  if (!selected) {
    select.replaceChildren(element("option", "All levels"));
    select.firstChild.value = "";
    for (const row of data.availableLevels) {
      const option = element("option", `Level ${row._id}`);
      option.value = row._id;
      select.append(option);
    }
  }
}
let request = 0;
async function refresh() {
  const current = ++request;
  const singleDay = byId("days").value === "day";
  if (singleDay && !byId("day").checkValidity()) {
    byId("status").textContent = "Select a valid UTC day to view statistics.";
    return;
  }
  byId("status").textContent = "Loading statistics…";
  try {
    const query = new window.URLSearchParams({ source: byId("source").value });
    query.set(singleDay ? "day" : "days", singleDay ? byId("day").value : byId("days").value);
    if (byId("level").value) {
      query.set("level", byId("level").value);
    }
    const response = await window.fetch(`/api/v1/statistics?${query}`, { signal: window.AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error("unavailable");
    }
    const data = await response.json();
    if (current !== request) {
      return;
    }
    render(data);
    byId("status").textContent =
      `${number(data.totals.events)} observations · updated ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    if (current === request) {
      byId("status").textContent = "Statistics unavailable. Use refresh to try again.";
      const liveCount = byId("currently-playing")?.querySelector(".metric-value");
      if (liveCount) {
        liveCount.textContent = "—";
      }
    }
  }
}
byId("refresh").addEventListener("click", refresh);
byId("day").value = new Date().toISOString().slice(0, 10);
byId("days").addEventListener("change", () => {
  byId("day-filter").hidden = byId("days").value !== "day";
  refresh();
});
byId("day").addEventListener("change", refresh);
byId("level").addEventListener("change", refresh);
byId("source").addEventListener("change", refresh);
byId("preview-close").addEventListener("click", () => byId("room-preview").close());
byId("room-preview").addEventListener("close", () => byId("preview-content").replaceChildren());
window.addEventListener("message", (event) => {
  const frame = byId("preview-content").querySelector("iframe");
  if (
    event.origin === window.location.origin &&
    event.source === frame?.contentWindow &&
    event.data?.type === "statistics-preview-close"
  ) {
    byId("room-preview").close();
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refresh();
  }
});
window.addEventListener("focus", () => {
  if (!document.hidden) {
    refresh();
  }
});
window.setInterval(() => {
  if (!document.hidden) {
    refresh();
  }
}, 15000);
refresh();
