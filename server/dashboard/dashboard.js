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
function trend(rows, daysRange) {
  const root = byId("trend");
  root.replaceChildren();
  if (!rows.length) {
    empty(root);
    return;
  }
  const days = new Map(rows.map((row) => [row._id, row]));
  const values = [];
  for (let index = daysRange - 1; index >= 0; index--) {
    const key = new Date(Date.now() - index * 86400000).toISOString().slice(0, 10);
    values.push(days.get(key) || { _id: key, princeDeaths: 0, enemyDeaths: 0 });
  }
  const chart = svg("svg", { viewBox: "0 0 620 200", role: "img", "aria-label": "Daily Prince and enemy deaths" });
  const maximum = Math.max(1, ...values.map((row) => Math.max(row.princeDeaths, row.enemyDeaths)));
  for (let i = 0; i <= 4; i++) {
    const y = 15 + i * 37;
    chart.append(
      svg("line", { x1: 30, x2: 610, y1: y, y2: y, stroke: "#2b2e33" }),
      svg("text", { x: 22, y: y + 4, "text-anchor": "end" }, Math.round((maximum * (4 - i)) / 4))
    );
  }
  for (const [key, color] of [
    ["enemyDeaths", "#dbb56d"],
    ["princeDeaths", "#eb8174"]
  ]) {
    const points = values
      .map((row, index) => `${30 + (index * 580) / Math.max(1, values.length - 1)},${163 - (row[key] / maximum) * 148}`)
      .join(" ");
    chart.append(
      svg("polyline", { points, stroke: color, "stroke-width": 2, fill: "none", "stroke-linejoin": "round" })
    );
  }
  chart.append(
    svg("text", { x: 30, y: 190 }, values[0]._id.slice(5)),
    svg("text", { x: 610, y: 190, "text-anchor": "end" }, values.at(-1)._id.slice(5))
  );
  root.append(chart);
}
function ranks(id, rows, details, primary) {
  const root = byId(id);
  root.replaceChildren();
  if (!rows.length) {
    empty(root);
  }
  rows.forEach((row, index) => {
    const item = element("div", undefined, "rank");
    const name = element("div", details(row)[0], "rank-name");
    name.append(element("small", details(row)[1]));
    const value = element("div", number(row[primary]), "rank-value");
    value.append(
      element(
        "small",
        primary === "hpLost" ? `${number(row.kills)} kills · ${number(row.hits)} hits` : `${number(row.hpLost)} HP lost`
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
      death.location.roomId,
      number(death.count || 1),
      death.sampleData ? "Sample" : "Gameplay"
    ]) {
      row.append(element("td", value));
    }
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
  for (const [label, value, note] of [
    ["Prince deaths", number(t.princeDeaths), "Observed fatal outcomes"],
    ["Enemies defeated", number(t.enemyDeaths), "One kill per actor per attempt"],
    ["Level attempts", number(t.starts), `${number(t.observations)} additional partial observations`],
    [
      "Completion rate",
      t.starts ? `${Math.round((t.completed / t.starts) * 100)}%` : "—",
      `${number(t.completed)} full attempts completed`
    ],
    ["Active play", duration(t.activeMs), `${number(t.hpLost)} Prince HP lost`]
  ]) {
    const card = element("article", undefined, "metric");
    card.append(
      element("div", label, "metric-label"),
      element("div", value, "metric-value"),
      element("div", note, "metric-note")
    );
    metrics.append(card);
  }
  trend(data.days, data.daysRange);
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
  ranks(
    "guards",
    data.guards,
    (r) => [
      `Guard #${r._id.guard} · Level ${r._id.level}`,
      `Room ${r._id.room ?? r._id.spawn?.roomId ?? "unknown"} · spawn ${r._id.spawn?.roomId ?? "unknown"} · ${r._id.map} / ${r._id.revision.slice(0, 8)}`
    ],
    "hpLost"
  );
  ranks(
    "traps",
    data.traps,
    (r) => [
      `${title(r._id.cause)} · Level ${r._id.level}`,
      `Room ${r._id.room ?? "unknown"} · tile ${r._id.column ?? "?"}, ${r._id.row ?? "?"} · revision ${r._id.revision.slice(0, 8)}`
    ],
    "kills"
  );
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
  byId("status").textContent = "Loading statistics…";
  try {
    const query = new window.URLSearchParams({ days: byId("days").value, source: byId("source").value });
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
    }
  }
}
byId("refresh").addEventListener("click", refresh);
byId("days").addEventListener("change", refresh);
byId("level").addEventListener("change", refresh);
byId("source").addEventListener("change", refresh);
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
