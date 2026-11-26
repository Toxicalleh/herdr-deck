// Writes the images for the README / sharing to docs/images/ (made-up sample data only).
//   banner.svg  1280×640, GitHub social preview + README header
//   deck.svg    a 5×3 Stream Deck with every kind of key
//   states.svg  one tile per state, with labels
//   icon.svg    the plugin icon; scripts/png.sh turns it (and the category icon) into the PNGs the plugin ships
// Tiles are embedded as <image> data URLs so their ids (clip paths, filters) can't clash.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentInfo, AgentState } from "@herdr-deck/shared";
import { escapeXml, PALETTE, renderAgentTile, renderCategoryIcon, renderLogo, renderEmptyTile, renderErrorTile, renderOverviewTile, renderUsageTile, svgDataUrl } from "./index.js";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "images");
const FONT = `font-family="Inter, 'Segoe UI', Arial, sans-serif"`;
const HOUR = 3600000;

let n = 0;
function agent(state: AgentState, space: string, title: string): AgentInfo {
  n += 1;
  return { id: `t${n}`, address: `t${n}`, machine: null, app: "claude-code", tab: "1", message: null, pinned: false, state, space, title };
}
const cli = { badge: "HERDR CLI" };

const deckTiles: string[] = [
  renderOverviewTile({ working: 3, blocked: 1, done: 2, idle: 1, unknown: 0, total: 7 }),
  renderAgentTile(agent("blocked", "Backend", "Fix auth bug")),
  renderAgentTile(agent("working", "Frontend", "Dark mode")),
  renderAgentTile(agent("working", "API", "Rate limiter")),
  renderUsageTile({ badge: "CLAUDE", title: "5 HOURS", usedPercent: 28, resetsAt: 2.3 * HOUR, now: 0 }),

  renderAgentTile(agent("done", "Docs", "Update README")),
  renderAgentTile(agent("working", "Mobile", "Push alerts")),
  renderAgentTile(agent("done", "Data", "Clean dataset")),
  renderAgentTile(agent("idle", "Main", "Claude Code")),
  renderUsageTile({ badge: "CLAUDE", title: "THIS WEEK", usedPercent: 61, resetsAt: 3.2 * 24 * HOUR, now: 0 }),

  renderOverviewTile({ working: 1, blocked: 0, done: 1, idle: 2, unknown: 0, total: 4 }, cli),
  renderAgentTile(agent("working", "Infra", "deploy-script"), cli),
  renderAgentTile(agent("done", "Tests", "flaky-e2e"), cli),
  renderAgentTile(agent("idle", "Notes", "scratch"), cli),
  renderEmptyTile(15),
];

const stateTiles: Array<[string, string]> = [
  ["Working", renderAgentTile(agent("working", "Frontend", "Dark mode"))],
  ["Needs you", renderAgentTile(agent("blocked", "Backend", "Fix auth bug"))],
  ["Done", renderAgentTile(agent("done", "Docs", "Update README"))],
  ["Idle", renderAgentTile(agent("idle", "Main", "Claude Code"))],
  ["Overview", renderOverviewTile({ working: 3, blocked: 1, done: 2, idle: 1, unknown: 0, total: 7 })],
  ["Claude usage", renderUsageTile({ badge: "CLAUDE", title: "5 HOURS", usedPercent: 28, resetsAt: 2.3 * HOUR, now: 0 })],
  ["Offline", renderErrorTile("ssh: connect to host my-server: timed out")],
];

function tile(svg: string, x: number, y: number, size: number): string {
  return `<image href="${svgDataUrl(svg)}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
}

/** A 5×3 Stream Deck body with the tiles on it. Returns the inner svg and its size. */
function deck(x0: number, y0: number, key: number): { svg: string; width: number; height: number } {
  const gap = Math.round(key * 0.22);
  const pad = Math.round(key * 0.42);
  const width = pad * 2 + key * 5 + gap * 4;
  const height = pad * 2 + key * 3 + gap * 2;
  const keys = deckTiles
    .map((svg, i) => {
      const x = x0 + pad + (i % 5) * (key + gap);
      const y = y0 + pad + Math.floor(i / 5) * (key + gap);
      return `<rect x="${x - 3}" y="${y - 3}" width="${key + 6}" height="${key + 6}" rx="${key * 0.19}" fill="#000" opacity="0.55"/>${tile(svg, x, y, key)}`;
    })
    .join("\n  ");
  const svg = `<rect x="${x0}" y="${y0 + 10}" width="${width}" height="${height}" rx="${pad * 0.9}" fill="#000" opacity="0.45" filter="url(#shadow)"/>
  <rect x="${x0}" y="${y0}" width="${width}" height="${height}" rx="${pad * 0.9}" fill="url(#body)" stroke="#2c3242" stroke-width="2"/>
  ${keys}`;
  return { svg, width, height };
}

const defs = `<defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b0f1c"/><stop offset="1" stop-color="#140b22"/></linearGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2030"/><stop offset="1" stop-color="#10131c"/></linearGradient>
    <radialGradient id="glowC" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PALETTE.working.accent}" stop-opacity="0.22"/><stop offset="1" stop-color="${PALETTE.working.accent}" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowM" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${PALETTE.blocked.accent}" stop-opacity="0.2"/><stop offset="1" stop-color="${PALETTE.blocked.accent}" stop-opacity="0"/></radialGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>`;

function svgDoc(width: number, height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${defs}
  ${body}
</svg>
`;
}

function background(width: number, height: number): string {
  return `<rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="${width * 0.82}" cy="${height * 0.2}" r="${height * 0.6}" fill="url(#glowC)"/>
  <circle cx="${width * 0.12}" cy="${height * 0.95}" r="${height * 0.55}" fill="url(#glowM)"/>`;
}

function banner(): string {
  const W = 1280;
  const H = 640;
  const size = deck(0, 0, 96);
  const placed = deck(W - size.width - 56, (H - size.height) / 2, 96);
  const dot = (cx: number, color: string, label: string) =>
    `<circle cx="${cx}" cy="462" r="7" fill="${color}"/><text x="${cx + 16}" y="468" ${FONT} font-size="18" font-weight="700" fill="#c9d0de">${label}</text>`;
  return svgDoc(
    W,
    H,
    `${background(W, H)}
  <image href="${svgDataUrl(renderLogo(96))}" x="80" y="150" width="76" height="76"/>
  <text x="80" y="300" ${FONT} font-size="64" font-weight="900" fill="#ffffff" letter-spacing="-1">Herdr Deck</text>
  <text x="82" y="350" ${FONT} font-size="21" font-weight="600" fill="#aab3c5">Your coding agents, live on Stream Deck.</text>
  <text x="82" y="380" ${FONT} font-size="21" font-weight="600" fill="#aab3c5">Press a key to jump to the one</text>
  <text x="82" y="410" ${FONT} font-size="21" font-weight="600" fill="#aab3c5">that needs you.</text>
  ${dot(88, PALETTE.blocked.accent, "needs you")}
  ${dot(236, PALETTE.done.accent, "done")}
  ${dot(334, PALETTE.working.accent, "working")}
  ${dot(462, PALETTE.idle.accent, "idle")}
  ${placed.svg}`,
  );
}

function deckImage(): string {
  const margin = 40;
  const d = deck(margin, margin, 144);
  return svgDoc(d.width + margin * 2, d.height + margin * 2 + 14, `${background(d.width + margin * 2, d.height + margin * 2 + 14)}\n  ${d.svg}`);
}

function statesImage(): string {
  const key = 144;
  const gap = 28;
  const margin = 36;
  const W = margin * 2 + stateTiles.length * key + (stateTiles.length - 1) * gap;
  const H = margin * 2 + key + 40;
  const items = stateTiles
    .map(([label, svg], i) => {
      const x = margin + i * (key + gap);
      return `${tile(svg, x, margin, key)}
  <text x="${x + key / 2}" y="${margin + key + 32}" text-anchor="middle" ${FONT} font-size="17" font-weight="700" fill="#c9d0de">${escapeXml(label)}</text>`;
    })
    .join("\n  ");
  return svgDoc(W, H, `${background(W, H)}\n  ${items}`);
}

await mkdir(outDir, { recursive: true });
const files: Record<string, string> = {
  "banner.svg": banner(),
  "deck.svg": deckImage(),
  "states.svg": statesImage(),
  "icon.svg": renderLogo(256),
  "icon@2x.svg": renderLogo(512),
  "category-icon.svg": renderCategoryIcon(28),
  "category-icon@2x.svg": renderCategoryIcon(56),
};
for (const [name, svg] of Object.entries(files)) await writeFile(resolve(outDir, name), svg);
console.log(`wrote ${Object.keys(files).length} images to ${outDir}`);
