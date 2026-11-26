// Agent model shared by the helper, renderer and Stream Deck plugin.
// Input is herdr-core's `hc events --json` stream: a first line with a full
// `terminals` snapshot, then JSON-RPC events that change one terminal.

export type AgentState = "working" | "blocked" | "done" | "idle" | "unknown";

/** A terminal as herdr-core reports it (only the fields we use). */
export type RawTerminal = {
  address: string;
  state?: string; // "live" | "finished"
  status?: { app?: string; state?: string; msg?: string } | null;
  turn?: number;
  title?: string | null;
  name?: string | null;
  cwd?: string | null;
  labels?: Record<string, string>;
  [key: string]: unknown;
};

export type AgentInfo = {
  /** Address herdr-app understands: `t3` here, `<machine>/t3` on another machine. */
  id: string;
  address: string;
  machine: string | null;
  app: string;
  state: AgentState;
  space: string;
  tab: string;
  title: string;
  message: string | null;
  pinned: boolean;
};

export type AgentSummary = Record<AgentState, number> & { total: number };

/** Most urgent first; used for the overview key and "jump to" order. */
export const STATE_PRIORITY: AgentState[] = ["blocked", "done", "working", "idle", "unknown"];

const KNOWN_STATES = new Set<AgentState>(["working", "blocked", "done", "idle", "unknown"]);

export type TerminalModel = Map<string, RawTerminal>;

export type StreamLine =
  | { kind: "snapshot"; terminals: RawTerminal[] }
  | { kind: "event"; terminal: string; type: string; data: Record<string, unknown> }
  | { kind: "error"; message: string }
  | { kind: "ignored" };

export function parseStreamLine(line: string): StreamLine {
  const trimmed = line.trim();
  if (!trimmed) return { kind: "ignored" };
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return { kind: "ignored" };
  }
  if (!value || typeof value !== "object") return { kind: "ignored" };
  const obj = value as Record<string, unknown>;

  if (Array.isArray(obj.terminals)) return { kind: "snapshot", terminals: obj.terminals as RawTerminal[] };

  if (obj.error && typeof obj.error === "object") {
    const err = obj.error as Record<string, unknown>;
    return { kind: "error", message: String(err.message ?? err.kind ?? "hc error") };
  }

  const params = obj.params as Record<string, unknown> | undefined;
  if (obj.method === "event" && params && typeof params.terminal === "string") {
    return {
      kind: "event",
      terminal: params.terminal,
      type: String(params.type ?? ""),
      data: (params.data as Record<string, unknown>) ?? {},
    };
  }
  return { kind: "ignored" };
}

export function modelFromSnapshot(terminals: RawTerminal[]): TerminalModel {
  return new Map(terminals.filter((t) => t && typeof t.address === "string").map((t) => [t.address, t]));
}

/**
 * Merge one event into the model. Returns false when the event is about a
 * terminal we don't know (a new one), which means the caller should resync.
 */
export function applyEvent(model: TerminalModel, terminal: string, data: Record<string, unknown>): boolean {
  const current = model.get(terminal);
  if (!current) return false;
  model.set(terminal, { ...current, ...data, address: terminal });
  return true;
}

function splitWhere(where: string | undefined): { space: string; tab: string } {
  if (!where) return { space: "", tab: "" };
  const index = where.lastIndexOf(" / ");
  if (index < 0) return { space: where, tab: "" };
  return { space: where.slice(0, index), tab: where.slice(index + 3) };
}

/** herdr shows "done" until someone looks at the agent; after that it's idle. */
export function effectiveState(terminal: RawTerminal): AgentState {
  const raw = terminal.status?.state;
  const state: AgentState = raw && KNOWN_STATES.has(raw as AgentState) ? (raw as AgentState) : "unknown";
  if (state === "done") {
    const seen = Number(terminal.labels?.["herdr.seen"]);
    const turn = Number(terminal.turn);
    if (Number.isFinite(seen) && Number.isFinite(turn) && seen >= turn) return "idle";
  }
  return state;
}

export function toAgent(terminal: RawTerminal, machine: string | null): AgentInfo {
  const { space, tab } = splitWhere(terminal.labels?.where);
  // A core connected to other machines lists their terminals as `server/t3`.
  const slash = terminal.address.lastIndexOf("/");
  const ownMachine = slash >= 0 ? terminal.address.slice(0, slash) : null;
  const address = slash >= 0 ? terminal.address.slice(slash + 1) : terminal.address;
  return {
    id: machine ? `${machine}/${terminal.address}` : terminal.address,
    address,
    machine: ownMachine ?? machine,
    app: terminal.status?.app ?? "agent",
    state: effectiveState(terminal),
    space,
    tab,
    title: (terminal.name || terminal.title || "").trim(),
    message: terminal.status?.msg?.trim() || null,
    pinned: terminal.labels?.["herdr.pinned"] === "1",
  };
}

/** Agents = live terminals whose program reports a status. Pinned first, then herdr's order. */
export function agentsFromModel(model: TerminalModel, machine: string | null): AgentInfo[] {
  const agents = [...model.values()]
    .filter((t) => t.state !== "finished" && t.status && typeof t.status === "object")
    .map((t) => toAgent(t, machine));
  return sortAgents(agents);
}

function addressNumber(address: string): number {
  const match = /(\d+)$/.exec(address);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function sortAgents(agents: AgentInfo[]): AgentInfo[] {
  return [...agents].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (a.machine ?? "").localeCompare(b.machine ?? "") ||
      addressNumber(a.address) - addressNumber(b.address),
  );
}

/**
 * The same agent can come from two sources (this PC's core lists `server/t3`,
 * and ssh to server lists `t3`). Keep the first one seen; machine names may differ
 * between sources, so match on terminal number + space/tab instead.
 */
export function dedupeAgents(agents: AgentInfo[]): AgentInfo[] {
  const seen = new Set<string>();
  return agents.filter((agent) => {
    const key = `${agent.address}|${agent.space}|${agent.tab}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarize(agents: AgentInfo[]): AgentSummary {
  const summary: AgentSummary = { working: 0, blocked: 0, done: 0, idle: 0, unknown: 0, total: agents.length };
  for (const agent of agents) summary[agent.state] += 1;
  return summary;
}

/** The agent most worth looking at: blocked, then done. Null if nothing needs you. */
export function mostUrgent(agents: AgentInfo[]): AgentInfo | null {
  for (const state of ["blocked", "done"] as AgentState[]) {
    const found = agents.find((agent) => agent.state === state);
    if (found) return found;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The herdr CLI (`herdr`, its own server): `herdr api snapshot` lines.

type CliSnapshot = {
  agents?: Array<Record<string, unknown>>;
  workspaces?: Array<{ workspace_id?: string; label?: string }>;
  tabs?: Array<{ tab_id?: string; label?: string }>;
};

/** Parse one `herdr api snapshot` line. Null if it isn't one. */
export function parseCliSnapshot(line: string): CliSnapshot | null {
  try {
    const value = JSON.parse(line) as { result?: { snapshot?: CliSnapshot }; snapshot?: CliSnapshot };
    const snapshot = value?.result?.snapshot ?? value?.snapshot;
    return snapshot && Array.isArray(snapshot.agents) ? snapshot : null;
  } catch {
    return null;
  }
}

/** Agents of the herdr CLI, in its own order (workspace, tab, pane). Ids are pane ids (`wH:p1`). */
export function cliAgentsFromSnapshot(snapshot: CliSnapshot, machine: string | null): AgentInfo[] {
  const workspaces = new Map((snapshot.workspaces ?? []).map((w) => [w.workspace_id, w.label ?? ""]));
  const tabs = new Map((snapshot.tabs ?? []).map((t) => [t.tab_id, t.label ?? ""]));
  return (snapshot.agents ?? [])
    .filter((a) => typeof a.pane_id === "string")
    .map((a) => {
      const raw = String(a.agent_status ?? "unknown");
      const state: AgentState = KNOWN_STATES.has(raw as AgentState) ? (raw as AgentState) : "unknown";
      const title = String(a.name ?? a.terminal_title_stripped ?? "").trim();
      return {
        id: machine ? `${machine}/${String(a.pane_id)}` : String(a.pane_id),
        address: String(a.pane_id),
        machine,
        app: String(a.agent ?? "agent"),
        state,
        space: workspaces.get(a.workspace_id as string) ?? String(a.workspace_id ?? ""),
        tab: tabs.get(a.tab_id as string) ?? "",
        title,
        message: null,
        pinned: false,
      };
    });
}

/** Terminals of herdr-core that are running the herdr CLI (to bring that window forward). */
export function herdrCliHosts(model: TerminalModel, machine: string | null): string[] {
  return [...model.values()]
    .filter((t) => t.state !== "finished" && (t.foreground as { name?: string } | undefined)?.name === "herdr")
    .map((t) => (machine ? `${machine}/${t.address}` : t.address));
}
