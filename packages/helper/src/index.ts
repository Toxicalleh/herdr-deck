import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { dedupeAgents, sortAgents, type AgentInfo } from "@herdr-deck/shared";
import { buildCliSources, buildSources, cliFocusCommand, type DeckSettings, type SourceConfig } from "./config.js";
import { AgentSource, type SourceState } from "./source.js";
import { friendlyError } from "./env.js";

export * from "./config.js";
export * from "./source.js";
export * from "./env.js";

export type DeckState = {
  agents: AgentInfo[];
  sources: SourceState[];
  /** Every source failed (or none configured): show an error tile. */
  error: string | null;
  /** At least one source has delivered a snapshot. */
  ready: boolean;
  /** herdr-core terminals running the herdr CLI. */
  cliHosts: string[];
};

/** All configured sources merged into one live list. Emits "change" with a DeckState. */
export class AgentHub extends EventEmitter {
  private sources: AgentSource[] = [];
  private key = "";

  /** "app": herdr-core (the Herdr app). "cli": the herdr CLI. */
  constructor(readonly family: "app" | "cli" = "app") {
    super();
  }

  configure(settings: DeckSettings): void {
    const configs: SourceConfig[] = this.family === "cli" ? buildCliSources(settings) : buildSources(settings);
    const key = JSON.stringify(configs);
    if (key === this.key) return;
    this.key = key;
    for (const source of this.sources) source.stop();
    this.sources = configs.map((config) => {
      const source = new AgentSource(config);
      source.on("change", () => this.emit("change", this.state()));
      return source;
    });
    for (const source of this.sources) source.start();
    this.emit("change", this.state());
  }

  stop(): void {
    for (const source of this.sources) source.stop();
    this.sources = [];
    this.key = "";
  }

  get running(): boolean {
    return this.sources.length > 0;
  }

  state(): DeckState {
    const sources = this.sources.map((s) => s.state);
    // Sources are in order (this PC first), so its copy of a shared agent wins.
    const merged = dedupeAgents(sources.flatMap((s) => s.agents));
    // The CLI already lists agents in its own order (workspace, tab, pane).
    const agents = this.family === "cli" ? merged : sortAgents(merged);
    const ready = sources.some((s) => s.connected);
    let error: string | null = null;
    if (sources.length === 0) error = "no source configured";
    else if (!ready) error = sources.find((s) => s.error)?.error ?? null;
    return { agents, sources, error, ready, cliHosts: [...new Set(sources.flatMap((s) => s.cliHosts))] };
  }
}

/** Ask herdr-app to show an agent (`<machine>/t3` or `t3`). */
export function focusAgent(id: string, herdrAppPath?: string): Promise<void> {
  return runHerdrApp(["do", "agent.focus", "--terminal", id], herdrAppPath);
}

/** Focus a herdr CLI pane (`wH:p1`) on the server. */
export function focusCliAgent(pane: string, settings: DeckSettings): Promise<void> {
  const { command, args } = cliFocusCommand(settings, pane);
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 10000 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(friendlyError("herdr", stderr.trim() || error.message, command === "ssh")));
      else resolve();
    });
  });
}

/** Bring the app pane showing a terminal forward (e.g. the one running the herdr CLI). */
export function focusAppTerminal(terminal: string, herdrAppPath?: string): Promise<void> {
  return runHerdrApp(["do", "pane.focus", "--terminal", terminal], herdrAppPath);
}

export function nextAgent(herdrAppPath?: string): Promise<void> {
  return runHerdrApp(["do", "agent.next"], herdrAppPath);
}

function runHerdrApp(args: string[], herdrAppPath?: string): Promise<void> {
  const command = herdrAppPath?.trim() || "herdr-app";
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, timeout: 8000 }, (error, _stdout, stderr) => {
      if (error) reject(new Error(friendlyError("herdr-app", stderr.trim() || error.message)));
      else resolve();
    });
  });
}
export * from "./claudeUsage.js";
