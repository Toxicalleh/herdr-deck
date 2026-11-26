// SVG tiles for Stream Deck keys (144×144), in the same style as codex-usage-deck.

import type { AgentInfo, AgentState, AgentSummary } from "@herdr-deck/shared";

export type Palette = { accent: string; accent2: string; dark: string; word: string };

export const PALETTE: Record<AgentState, Palette> = {
  working: { accent: "#54f3ee", accent2: "#79fff7", dark: "#101a3d", word: "WORKING" },
  blocked: { accent: "#f61bde", accent2: "#ff65ef", dark: "#2a0b2a", word: "NEEDS YOU" },
  done: { accent: "#3df58a", accent2: "#8affb8", dark: "#0c2118", word: "DONE" },
  idle: { accent: "#8a94a8", accent2: "#aab3c5", dark: "#151922", word: "IDLE" },
  unknown: { accent: "#ffb52e", accent2: "#ffd15b", dark: "#17131e", word: "UNKNOWN" },
};

const FONT = `font-family="Inter, Arial, sans-serif"`;
const SIZE = 144;

export function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function truncate(value: string, max: number): string {
  const chars = [...value.trim()];
  return chars.length <= max ? chars.join("") : `${chars.slice(0, max - 1).join("").trimEnd()}…`;
}

function frame(id: string, bg: string, body: string, border = "#ffffff", borderOpacity = 0.16): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <clipPath id="c-${id}"><rect width="${SIZE}" height="${SIZE}" rx="24" ry="24"/></clipPath>
    <filter id="g-${id}" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g clip-path="url(#c-${id})">
    <rect width="${SIZE}" height="${SIZE}" fill="${bg}"/>
    <circle cx="${SIZE - 18}" cy="18" r="38" fill="#ffffff" opacity="0.06"/>
    ${body}
    <rect width="${SIZE}" height="${SIZE}" rx="24" ry="24" fill="none" stroke="${border}" stroke-opacity="${borderOpacity}" stroke-width="3"/>
  </g>
</svg>`;
}

function glyph(state: AgentState, color: string, id: string, cx = 72, cy = 68): string {
  const glow = `filter="url(#g-${id})"`;
  switch (state) {
    case "working":
      return [-20, 0, 20].map((dx, i) => `<circle cx="${cx + dx}" cy="${cy}" r="${i === 1 ? 8 : 6.5}" fill="${color}" ${glow}/>`).join("");
    case "blocked":
      return `<circle cx="${cx}" cy="${cy}" r="22" fill="none" stroke="${color}" stroke-width="5" ${glow}/>
    <rect x="${cx - 3.5}" y="${cy - 13}" width="7" height="16" rx="3" fill="${color}"/><circle cx="${cx}" cy="${cy + 10}" r="4" fill="${color}"/>`;
    case "done":
      return `<path d="M ${cx - 18} ${cy + 1} L ${cx - 5} ${cy + 14} L ${cx + 20} ${cy - 13}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" ${glow}/>`;
    case "idle":
      return `<rect x="${cx - 18}" y="${cy - 4}" width="36" height="8" rx="4" fill="${color}" opacity="0.85"/>`;
    default:
      return `<text x="${cx}" y="${cy + 14}" text-anchor="middle" ${FONT} font-size="40" font-weight="900" fill="${color}">?</text>`;
  }
}

export type AgentTileOptions = {
  /** Second frame of the blocked blink. */
  flash?: boolean;
  /** Slot number shown when the key has no agent. */
  slot?: number;
  /** Text in a band across the top, e.g. "HERDR CLI". */
  badge?: string;
};

/** Top bar: a thin accent line, or a band with a label. Returns the svg and the y of the first text line. */
function topBar(color: string, textColor: string, badge?: string): { svg: string; titleY: number } {
  if (!badge) return { svg: `<rect x="0" y="0" width="${SIZE}" height="6" fill="${color}"/>`, titleY: 30 };
  return {
    svg: `<rect x="0" y="0" width="${SIZE}" height="17" fill="${color}"/>
    <text x="72" y="12.5" text-anchor="middle" ${FONT} font-size="10" font-weight="900" fill="${textColor}" letter-spacing="2">${escapeXml(badge)}</text>`,
    titleY: 36,
  };
}

export function renderAgentTile(agent: AgentInfo, options: AgentTileOptions = {}): string {
  const p = PALETTE[agent.state];
  const flash = Boolean(options.flash) && agent.state === "blocked";
  const id = `a-${agent.address.replace(/[^a-z0-9]/gi, "")}`;
  const top = escapeXml(truncate((agent.space || agent.app).toUpperCase(), 12));
  const bottom = escapeXml(truncate(agent.title || agent.tab || agent.address, 16));
  const bg = flash ? p.accent : p.dark;
  const fg = flash ? p.dark : p.accent;
  const textColor = flash ? p.dark : "#ffffff";
  const bar = topBar(flash ? p.dark : p.accent, flash ? p.accent : p.dark, options.badge);
  const body = `
    ${bar.svg}
    <text x="72" y="${bar.titleY}" text-anchor="middle" ${FONT} font-size="${options.badge ? 13 : 15}" font-weight="800" fill="${textColor}" letter-spacing="0.8">${top}</text>
    ${glyph(agent.state, fg, id, 72, options.badge ? 71 : 68)}
    <text x="72" y="110" text-anchor="middle" ${FONT} font-size="14" font-weight="900" fill="${fg}" letter-spacing="1.2">${p.word}</text>
    <text x="72" y="130" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="${textColor}" opacity="0.75">${bottom}</text>`;
  return frame(id, bg, body, flash ? "#ffffff" : p.accent, flash ? 0.9 : 0.35);
}

export function renderEmptyTile(text?: number | string, badge?: string): string {
  const label = escapeXml(typeof text === "number" ? `SLOT ${text}` : text || "NO AGENT");
  const body = `
    <rect x="${72 - 18}" y="64" width="36" height="6" rx="3" fill="#3a4152"/>
    <text x="72" y="112" text-anchor="middle" ${FONT} font-size="12" font-weight="800" fill="#5b6475" letter-spacing="1.2">${label}</text>
    ${badge ? topBar("#2a3040", "#8a94a8", badge).svg : ""}`;
  return frame("empty", "#0d1017", body, "#ffffff", 0.08);
}

export function renderErrorTile(message: string, title = "HERDR"): string {
  const lines = wrap(message, 18, 3).map(
    (text, i) => `<text x="72" y="${92 + i * 14}" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#ffffff" opacity="0.75">${escapeXml(text)}</text>`,
  );
  const body = `
    <text x="72" y="34" text-anchor="middle" ${FONT} font-size="16" font-weight="800" fill="#ffffff" letter-spacing="1.1">${escapeXml(title)}</text>
    <text x="72" y="66" text-anchor="middle" ${FONT} font-size="18" font-weight="900" fill="#ff6b2b" letter-spacing="1.2">OFFLINE</text>
    ${lines.join("\n    ")}`;
  return frame("error", "#17111a", body, "#ff6b2b", 0.4);
}

export function renderOverviewTile(summary: AgentSummary, options: { flash?: boolean; badge?: string } = {}): string {
  const state: AgentState = summary.blocked > 0 ? "blocked" : summary.done > 0 ? "done" : summary.working > 0 ? "working" : "idle";
  const p = PALETTE[state];
  const big = state === "idle" ? summary.total : summary[state];
  const caption = state === "idle" ? (summary.total === 1 ? "AGENT IDLE" : "AGENTS IDLE") : p.word;
  const flash = Boolean(options.flash) && state === "blocked";
  const bg = flash ? p.accent : p.dark;
  const fg = flash ? p.dark : p.accent;
  const textColor = flash ? p.dark : "#ffffff";

  const counts: Array<[AgentState, number]> = (["blocked", "done", "working", "idle"] as AgentState[]).map((s) => [s, summary[s]]);
  const chips = counts
    .map(([s, n], i) => {
      const x = 24 + i * 32;
      const color = flash ? p.dark : PALETTE[s].accent;
      return `<circle cx="${x - 8}" cy="126" r="4.5" fill="${color}" opacity="${n ? 1 : 0.35}"/>
    <text x="${x + 1}" y="130.5" text-anchor="start" ${FONT} font-size="12" font-weight="800" fill="${textColor}" opacity="${n ? 0.95 : 0.4}">${n}</text>`;
    })
    .join("\n    ");

  const bar = topBar(flash ? p.dark : p.accent, flash ? p.accent : p.dark, options.badge);
  const body = `
    ${bar.svg}
    <text x="72" y="${bar.titleY}" text-anchor="middle" ${FONT} font-size="${options.badge ? 13 : 15}" font-weight="800" fill="${textColor}" letter-spacing="1.1">AGENTS</text>
    <text x="72" y="82" text-anchor="middle" ${FONT} font-size="48" font-weight="900" fill="${fg}" filter="url(#g-overview)">${big}</text>
    <text x="72" y="104" text-anchor="middle" ${FONT} font-size="13" font-weight="900" fill="${fg}" letter-spacing="1.2">${caption}</text>
    ${chips}`;
  return frame("overview", bg, body, flash ? "#ffffff" : p.accent, flash ? 0.9 : 0.35);
}

function wrap(text: string, width: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if ((current + " " + word).length <= width) current += " " + word;
    else {
      lines.push(current);
      current = word;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.map((line) => truncate(line, width));
}

/** Stream Deck takes images as data URLs. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// ---- Claude usage tiles (same style as the agent tiles, with a band on top) ----

export type UsageTileInput = {
  /** Band text, e.g. "CLAUDE". */
  badge: string;
  /** Title under the band, e.g. "5 HOURS". */
  title: string;
  usedPercent: number;
  /** ms since epoch */
  resetsAt: number | null;
  now?: number;
};

/** Colour by what's left: plenty → cyan, getting low → amber/orange, almost out → magenta. */
export function usagePalette(remaining: number): Palette {
  if (remaining >= 60) return { accent: "#54f3ee", accent2: "#79fff7", dark: "#101a3d", word: "LEFT" };
  if (remaining >= 30) return { accent: "#ffb52e", accent2: "#ffd15b", dark: "#17131e", word: "LEFT" };
  if (remaining >= 10) return { accent: "#ff6b2b", accent2: "#ff9a3c", dark: "#17111a", word: "LEFT" };
  return { accent: "#f61bde", accent2: "#ff65ef", dark: "#2a0b2a", word: "LEFT" };
}

/** "45m", "2h 14m", "3d 4h". */
export function formatResetIn(resetsAt: number | null, now = Date.now()): string {
  if (resetsAt === null) return "";
  const minutes = Math.max(0, Math.round((resetsAt - now) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export function renderUsageTile(input: UsageTileInput): string {
  const used = Math.max(0, Math.min(100, Math.round(input.usedPercent)));
  const remaining = 100 - used;
  const p = usagePalette(remaining);
  const id = `u-${input.title.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
  const bar = topBar(p.accent, p.dark, input.badge);
  const reset = formatResetIn(input.resetsAt, input.now);
  const trackWidth = 104;
  const fill = Math.round((trackWidth * remaining) / 100);
  const body = `
    ${bar.svg}
    <text x="72" y="${bar.titleY}" text-anchor="middle" ${FONT} font-size="13" font-weight="800" fill="#ffffff" letter-spacing="1.1">${escapeXml(input.title)}</text>
    <text x="72" y="83" text-anchor="middle" ${FONT} font-size="42" font-weight="900" fill="${p.accent}" filter="url(#g-${id})">${remaining}%</text>
    <text x="72" y="101" text-anchor="middle" ${FONT} font-size="12" font-weight="900" fill="${p.accent}" letter-spacing="1.4">LEFT</text>
    <rect x="20" y="110" width="${trackWidth}" height="6" rx="3" fill="#ffffff" opacity="0.14"/>
    ${fill > 0 ? `<rect x="20" y="110" width="${fill}" height="6" rx="3" fill="${p.accent}"/>` : ""}
    <text x="72" y="133" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#ffffff" opacity="0.75">${reset ? `resets in ${escapeXml(reset)}` : "&#160;"}</text>`;
  return frame(id, p.dark, body, p.accent, 0.35);
}

/** Claude Code isn't logged in (or the login expired). */
export function renderLoginTile(badge = "CLAUDE", where = "on the server"): string {
  const amber = "#ffb52e";
  const bar = topBar(amber, "#17131e", badge);
  const body = `
    ${bar.svg}
    <text x="72" y="72" text-anchor="middle" ${FONT} font-size="24" font-weight="900" fill="${amber}" letter-spacing="1.2">LOG IN</text>
    <text x="72" y="98" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#ffffff" opacity="0.8">run claude, then /login</text>
    <text x="72" y="114" text-anchor="middle" ${FONT} font-size="11" font-weight="700" fill="#ffffff" opacity="0.6">${escapeXml(truncate(where, 22))}</text>`;
  return frame("login", "#17131e", body, amber, 0.4);
}

// ---- Plugin icon ----

/** Plugin icon: three stacked status bars (needs you / done / working) on a dark key. */
export function renderLogo(size = 256): string {
  const s = size / 144;
  const bar = (y: number, w: number, color: string) =>
    `<rect x="${30 * s}" y="${y * s}" width="${w * s}" height="${16 * s}" rx="${8 * s}" fill="${color}" filter="url(#lg)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="lb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151a30"/><stop offset="1" stop-color="#1e0d24"/></linearGradient>
    <filter id="lg" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="${3 * s}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="${size}" height="${size}" rx="${30 * s}" fill="url(#lb)"/>
  <rect x="${1.5 * s}" y="${1.5 * s}" width="${141 * s}" height="${141 * s}" rx="${28.5 * s}" fill="none" stroke="#ffffff" stroke-opacity="0.14" stroke-width="${3 * s}"/>
  ${bar(38, 74, PALETTE.blocked.accent)}
  ${bar(64, 60, PALETTE.done.accent)}
  ${bar(90, 72, PALETTE.working.accent)}
  <circle cx="${118 * s}" cy="${46 * s}" r="${7 * s}" fill="${PALETTE.blocked.accent}" filter="url(#lg)"/>
</svg>
`;
}

/** Category icon for the Stream Deck action list: the same bars in plain white on transparent. */
export function renderCategoryIcon(size = 28): string {
  const s = size / 28;
  const bar = (y: number, w: number) => `<rect x="${4 * s}" y="${y * s}" width="${w * s}" height="${4 * s}" rx="${2 * s}" fill="#ffffff"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bar(6, 15)}<circle cx="${23 * s}" cy="${8 * s}" r="${2 * s}" fill="#ffffff"/>
  ${bar(12, 12)}
  ${bar(18, 17)}
</svg>
`;
}
