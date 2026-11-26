// Plugin logic without the Stream Deck SDK, so it can be tested:
// which agent each key shows, what image it gets, and what a press does.

import type { DeckState } from "@herdr-deck/helper";
import { mostUrgent, summarize, type AgentInfo } from "@herdr-deck/shared";
import { renderAgentTile, renderEmptyTile, renderErrorTile, renderOverviewTile, svgDataUrl } from "@herdr-deck/renderer";

export const AGENT_ACTION = "com.herdr-deck.agent";
export const OVERVIEW_ACTION = "com.herdr-deck.overview";
export const CLI_AGENT_ACTION = "com.herdr-deck.cli-agent";
export const CLI_OVERVIEW_ACTION = "com.herdr-deck.cli-overview";

export type KeyKind = "agent" | "overview" | "cli-agent" | "cli-overview";
/** "app": the Herdr app's herdr-core. "cli": the herdr CLI. Each family has its own keys and data. */
export type Family = "app" | "cli";

export const KIND_BY_ACTION: Record<string, KeyKind> = {
  [AGENT_ACTION]: "agent",
  [OVERVIEW_ACTION]: "overview",
  [CLI_AGENT_ACTION]: "cli-agent",
  [CLI_OVERVIEW_ACTION]: "cli-overview",
};

export function familyOf(kind: KeyKind): Family {
  return kind.startsWith("cli-") ? "cli" : "app";
}

function isOverview(kind: KeyKind): boolean {
  return kind.endsWith("overview");
}

const BADGE: Record<Family, string | undefined> = { app: undefined, cli: "HERDR CLI" };

export type KeySettings = {
  /** Agent id chosen in the dropdown (`<machine>/t3`); empty = auto. */
  agent?: string;
  /** Older setting: 1-based agent number. */
  slot?: number | string;
};

export type KeyInfo = {
  id: string;
  kind: KeyKind;
  device: string;
  row: number;
  column: number;
  settings: KeySettings;
};

export type KeyTarget = {
  agent: AgentInfo | null;
  /** Label for an empty key: "AUTO 3" or "NOT RUNNING". */
  emptyLabel: string;
};

/**
 * What each agent key of one family shows. Keys with a chosen agent show it (or "not running");
 * the rest fill in reading order with the agents nobody chose.
 */
export function resolveKeys(keys: KeyInfo[], state: DeckState, family: Family = "app"): Map<string, KeyTarget> {
  const agentKind: KeyKind = family === "cli" ? "cli-agent" : "agent";
  const agentKeys = keys
    .filter((k) => k.kind === agentKind)
    .sort((a, b) => a.device.localeCompare(b.device) || a.row - b.row || a.column - b.column);
  const targets = new Map<string, KeyTarget>();
  const byId = new Map(state.agents.map((agent) => [agent.id, agent]));
  const claimed = new Set<string>();

  for (const key of agentKeys) {
    const chosen = key.settings.agent?.trim();
    if (chosen) {
      // Fall back to the terminal number when the machine part differs (`server/t3` vs `host/t3`).
      const bare = chosen.slice(chosen.lastIndexOf("/") + 1);
      const remote = chosen.includes("/");
      const agent =
        byId.get(chosen) ??
        state.agents.find((a) => a.address === bare && Boolean(a.machine) === remote) ??
        state.agents.find((a) => a.address === bare) ??
        null;
      targets.set(key.id, { agent, emptyLabel: "NOT RUNNING" });
      claimed.add(agent?.id ?? chosen);
      continue;
    }
    const slot = Number(key.settings.slot);
    if (Number.isInteger(slot) && slot > 0) {
      const agent = state.agents[slot - 1] ?? null;
      targets.set(key.id, { agent, emptyLabel: `SLOT ${slot}` });
      if (agent) claimed.add(agent.id);
    }
  }

  const free = state.agents.filter((agent) => !claimed.has(agent.id));
  let next = 0;
  for (const key of agentKeys) {
    if (targets.has(key.id)) continue;
    targets.set(key.id, { agent: free[next] ?? null, emptyLabel: `AUTO ${next + 1}` });
    next += 1;
  }
  return targets;
}

export function imageForKey(key: KeyInfo, targets: Map<string, KeyTarget>, state: DeckState, flash: boolean): string {
  const badge = BADGE[familyOf(key.kind)];
  if (!state.ready) return svgDataUrl(renderErrorTile(state.error ?? "connecting…", badge ?? "HERDR"));
  if (isOverview(key.kind)) return svgDataUrl(renderOverviewTile(summarize(state.agents), { flash, badge }));
  const target = targets.get(key.id);
  if (!target?.agent) return svgDataUrl(renderEmptyTile(target?.emptyLabel ?? "NO AGENT", badge));
  return svgDataUrl(renderAgentTile(target.agent, { flash, badge }));
}

export type PressAction = { kind: "focus"; id: string } | { kind: "next" } | { kind: "none" };

export function pressForKey(key: KeyInfo, targets: Map<string, KeyTarget>, state: DeckState): PressAction {
  if (isOverview(key.kind)) {
    const urgent = mostUrgent(state.agents);
    if (urgent) return { kind: "focus", id: urgent.id };
    // The app can step through agents; the CLI has no "next agent" command.
    return familyOf(key.kind) === "app" && state.agents.length ? { kind: "next" } : { kind: "none" };
  }
  const agent = targets.get(key.id)?.agent;
  return agent ? { kind: "focus", id: agent.id } : { kind: "none" };
}

export function anyBlocked(state: DeckState): boolean {
  return state.agents.some((agent) => agent.state === "blocked");
}

/** Items for the settings dropdown (sdpi-components datasource format). */
export function agentChoices(state: DeckState, current?: string): Array<{ label: string; value: string }> {
  const items = [{ label: "Auto (next free agent)", value: "" }];
  for (const agent of state.agents) {
    const where = [agent.space, agent.tab].filter(Boolean).join(" / ");
    const title = agent.title ? ` — ${agent.title}` : "";
    const machine = agent.machine ? ` [${agent.machine}]` : "";
    items.push({ label: `${where || agent.address}${title}${machine}`, value: agent.id });
  }
  if (current && !state.agents.some((agent) => agent.id === current)) {
    items.push({ label: `${current} (not running)`, value: current });
  }
  return items;
}
