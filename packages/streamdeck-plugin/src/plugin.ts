import streamDeck from "@elgato/streamdeck";
import { AgentHub, extendPath, focusAgent, focusAppTerminal, focusCliAgent, nextAgent, type DeckSettings, type DeckState } from "@herdr-deck/helper";
import { CLAUDE_USAGE_ACTION, ClaudeKeys, type ClaudeKeySettings } from "./claude.js";
import { KIND_BY_ACTION, agentChoices, anyBlocked, familyOf, imageForKey, pressForKey, resolveKeys, type Family, type KeyInfo, type KeySettings } from "./deck.js";

type KeyHandle = { setImage(image?: string): Promise<void>; setTitle(title?: string): Promise<void>; showAlert(): Promise<void> };

// Stream Deck gives plugins a bare PATH; find hc/herdr/herdr-app in the usual places.
extendPath();

const FLASH_MS = 700;
const log = streamDeck.logger;

// One hub per family: the Herdr app's herdr-core, and the herdr CLI.
const hubs: Record<Family, AgentHub> = { app: new AgentHub("app"), cli: new AgentHub("cli") };
const states: Record<Family, DeckState> = { app: hubs.app.state(), cli: hubs.cli.state() };
const keys = new Map<string, KeyInfo>();
const handles = new Map<string, KeyHandle>();
const lastImage = new Map<string, string>();
let settings: DeckSettings = {};
const claude = new ClaudeKeys(log);
let flash = false;
let flashTimer: NodeJS.Timeout | null = null;

function keysOf(family: Family): KeyInfo[] {
  return [...keys.values()].filter((k) => familyOf(k.kind) === family);
}

/** Run a family's data source only while it has keys on the deck. */
function syncHubs(): void {
  for (const family of ["app", "cli"] as Family[]) {
    const wanted = keysOf(family).length > 0;
    if (wanted) hubs[family].configure(settings);
    else if (hubs[family].running) {
      hubs[family].stop();
      states[family] = hubs[family].state();
      log.info(`${family}: no keys, source stopped`);
    }
  }
}

function redraw(): void {
  for (const family of ["app", "cli"] as Family[]) {
    const familyKeys = keysOf(family);
    const targets = resolveKeys(familyKeys, states[family], family);
    for (const key of familyKeys) {
      const handle = handles.get(key.id);
      if (!handle) continue;
      const image = imageForKey(key, targets, states[family], flash);
      if (lastImage.get(key.id) === image) continue;
      lastImage.set(key.id, image);
      void handle.setImage(image).catch((error) => log.warn(`setImage failed: ${String(error)}`));
    }
  }
  updateFlashTimer();
}

function updateFlashTimer(): void {
  const wanted = keys.size > 0 && (["app", "cli"] as Family[]).some((f) => keysOf(f).length > 0 && anyBlocked(states[f]));
  if (wanted && !flashTimer) {
    flashTimer = setInterval(() => {
      flash = !flash;
      redraw();
    }, FLASH_MS);
  } else if (!wanted && flashTimer) {
    clearInterval(flashTimer);
    flashTimer = null;
    flash = false;
  }
}

function applySettings(next: DeckSettings): void {
  settings = next ?? {};
  claude.setSettings(settings);
  log.info(`settings: ssh=${settings.sshTarget || "-"} machine=${settings.machine || "-"} local=${String(settings.includeLocal ?? "auto")}`);
  syncHubs();
}

for (const family of ["app", "cli"] as Family[]) {
  hubs[family].on("change", (next: DeckState) => {
    const wasReady = states[family].ready;
    states[family] = next;
    if (wasReady !== next.ready) log.info(`${family}: ${next.ready ? `connected, ${next.agents.length} agents` : `offline: ${next.error}`}`);
    redraw();
  });
}

streamDeck.actions.onWillAppear(async (ev) => {
  if (ev.action.manifestId === CLAUDE_USAGE_ACTION) {
    if (!ev.action.isKey()) return;
    await ev.action.setTitle("");
    claude.add(ev.action.id, ev.action, (ev.payload.settings ?? {}) as ClaudeKeySettings);
    return;
  }
  const kind = KIND_BY_ACTION[ev.action.manifestId];
  if (!kind || !ev.action.isKey()) return;
  const coordinates = ev.action.coordinates;
  keys.set(ev.action.id, {
    id: ev.action.id,
    kind,
    device: ev.action.device.id,
    row: coordinates?.row ?? 99,
    column: coordinates?.column ?? 99,
    settings: (ev.payload.settings ?? {}) as KeySettings,
  });
  handles.set(ev.action.id, ev.action);
  lastImage.delete(ev.action.id);
  await ev.action.setTitle("");
  syncHubs();
  redraw();
});

streamDeck.actions.onWillDisappear((ev) => {
  if (claude.has(ev.action.id)) return claude.remove(ev.action.id);
  keys.delete(ev.action.id);
  handles.delete(ev.action.id);
  lastImage.delete(ev.action.id);
  syncHubs();
  redraw();
});

streamDeck.settings.onDidReceiveSettings((ev) => {
  if (claude.has(ev.action.id)) return claude.updateKey(ev.action.id, (ev.payload.settings ?? {}) as ClaudeKeySettings);
  const key = keys.get(ev.action.id);
  if (!key) return;
  key.settings = (ev.payload.settings ?? {}) as KeySettings;
  redraw();
});

async function pressCli(id: string): Promise<void> {
  await focusCliAgent(id, settings);
  // If the herdr CLI runs in a Herdr app terminal, bring that one forward too
  // (`server/t2` for a server agent, a bare `t4` for one on this PC).
  const remote = id.includes("/");
  const host = states.app.cliHosts.find((h) => h.includes("/") === remote);
  if (host) await focusAppTerminal(host, settings.herdrAppPath).catch((error) => log.warn(`could not show herdr CLI terminal: ${String(error)}`));
}

streamDeck.actions.onKeyDown(async (ev) => {
  if (claude.has(ev.action.id)) {
    await claude.refresh();
    return;
  }
  const key = keys.get(ev.action.id);
  if (!key) return;
  const family = familyOf(key.kind);
  const press = pressForKey(key, resolveKeys(keysOf(family), states[family], family), states[family]);
  try {
    if (press.kind === "focus") await (family === "cli" ? pressCli(press.id) : focusAgent(press.id, settings.herdrAppPath));
    else if (press.kind === "next") await nextAgent(settings.herdrAppPath);
    else return;
    log.info(`pressed ${key.kind}: ${press.kind === "focus" ? press.id : press.kind}`);
  } catch (error) {
    log.error(`${family === "cli" ? "herdr agent focus" : "herdr-app"} failed: ${String(error)}`);
    await ev.action.showAlert();
  }
});

// The settings dropdown (sdpi-select datasource="getAgents") asks for the agent list of its key's family.
streamDeck.ui.onSendToPlugin((ev) => {
  const payload = ev.payload as { event?: string } | null;
  if (payload?.event !== "getAgents") return;
  const key = keys.get(ev.action.id);
  const family = key ? familyOf(key.kind) : "app";
  void streamDeck.ui.sendToPropertyInspector({ event: "getAgents", items: agentChoices(states[family], key?.settings.agent) });
});

streamDeck.settings.onDidReceiveGlobalSettings((ev) => applySettings(ev.settings as DeckSettings));

log.info("Herdr Deck plugin booting");
await streamDeck.connect();
applySettings((await streamDeck.settings.getGlobalSettings()) as DeckSettings);
log.info("Herdr Deck plugin connected");
