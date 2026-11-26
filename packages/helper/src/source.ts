// One live `hc events --json` stream (local or over ssh), kept running and
// turned into a list of agents. Restarts itself when the stream ends.

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import { agentsFromModel, applyEvent, cliAgentsFromSnapshot, herdrCliHosts, modelFromSnapshot, parseCliSnapshot, parseStreamLine, type AgentInfo, type TerminalModel } from "@herdr-deck/shared";
import type { SourceConfig } from "./config.js";
import { friendlyError } from "./env.js";

export type SourceState = {
  label: string;
  machine: string | null;
  connected: boolean;
  error: string | null;
  agents: AgentInfo[];
  /** herdr-core terminals running the herdr CLI (hc sources only). */
  cliHosts: string[];
};

const MIN_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const EMIT_DEBOUNCE_MS = 80;

export class AgentSource extends EventEmitter {
  private child: ChildProcess | null = null;
  private model: TerminalModel = new Map();
  private stopped = true;
  private backoff = MIN_BACKOFF_MS;
  private restartTimer: NodeJS.Timeout | null = null;
  private emitTimer: NodeJS.Timeout | null = null;
  private stderrTail = "";
  private gotSnapshot = false;
  private lastCliLine = "";
  state: SourceState;

  constructor(readonly config: SourceConfig) {
    super();
    this.state = { label: config.label, machine: config.machine, connected: false, error: null, agents: [], cliHosts: [] };
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.launch();
  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.restartTimer = this.emitTimer = null;
    this.kill();
  }

  private kill(): void {
    const child = this.child;
    this.child = null;
    if (child && child.exitCode === null) child.kill();
  }

  private launch(fresh = true): void {
    this.gotSnapshot = false;
    if (fresh) this.lastCliLine = "";
    this.stderrTail = "";
    let child: ChildProcess;
    try {
      child = spawn(this.config.command, this.config.args, { stdio: [this.config.stdin ? "pipe" : "ignore", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      this.fail(friendlyError(this.tool, String(error)));
      return;
    }
    this.child = child;
    if (this.config.stdin && child.stdin) {
      child.stdin.on("error", () => {}); // the process may exit before reading it all
      child.stdin.end(this.config.stdin);
    }

    child.on("error", (error) => {
      if (this.child !== child) return;
      this.child = null;
      this.fail(friendlyError(this.tool, error.message));
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      this.stderrTail = (this.stderrTail + chunk.toString()).slice(-400);
    });
    child.on("exit", (code) => {
      if (this.child !== child) return; // replaced by a resync
      this.child = null;
      if (this.config.pollMs && code === 0 && this.gotSnapshot) {
        // Polled source: run it again shortly.
        this.restartTimer = setTimeout(() => {
          this.restartTimer = null;
          if (!this.stopped) this.launch(false);
        }, this.config.pollMs);
        return;
      }
      const detail = this.stderrTail.trim().split("\n").pop() || `exited with code ${code}`;
      const hint = friendlyError(this.tool, detail, this.config.command === "ssh");
      this.fail(this.gotSnapshot ? `stream ended: ${hint}` : hint);
    });

    const lines = createInterface({ input: child.stdout! });
    lines.on("line", (line) => {
      if (this.child !== child) return;
      this.handleLine(line);
    });
  }

  private handleLine(line: string): void {
    if (this.config.kind === "cli") {
      if (line === this.lastCliLine) {
        this.gotSnapshot = true;
        return;
      }
      const snapshot = parseCliSnapshot(line);
      if (!snapshot) return;
      this.lastCliLine = line;
      this.gotSnapshot = true;
      this.backoff = MIN_BACKOFF_MS;
      this.state = { ...this.state, connected: true, error: null, agents: cliAgentsFromSnapshot(snapshot, this.config.machine) };
      this.emit("change", this.state);
      return;
    }
    const parsed = parseStreamLine(line);
    switch (parsed.kind) {
      case "snapshot":
        this.model = modelFromSnapshot(parsed.terminals);
        this.gotSnapshot = true;
        this.backoff = MIN_BACKOFF_MS;
        this.state = { ...this.state, connected: true, error: null };
        this.scheduleEmit(0);
        break;
      case "event":
        if (!applyEvent(this.model, parsed.terminal, parsed.data)) {
          // A terminal we haven't seen: restart the stream for a fresh snapshot.
          this.resync();
          return;
        }
        this.scheduleEmit(EMIT_DEBOUNCE_MS);
        break;
      case "error":
        this.stderrTail = parsed.message;
        break;
    }
  }

  /** The tool this source runs (also when it runs over ssh), for error messages. */
  private get tool(): string {
    return this.config.kind === "cli" ? "herdr" : "hc";
  }

  private resync(): void {
    this.kill();
    if (!this.stopped) this.launch();
  }

  private fail(message: string): void {
    this.state = { ...this.state, connected: false, error: message, agents: [], cliHosts: [] };
    this.emit("change", this.state);
    if (this.stopped) return;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopped) this.launch();
    }, this.backoff);
    this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff * 2);
  }

  private scheduleEmit(delay: number): void {
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.state = { ...this.state, agents: agentsFromModel(this.model, this.config.machine), cliHosts: herdrCliHosts(this.model, this.config.machine) };
      this.emit("change", this.state);
    }, delay);
  }
}
