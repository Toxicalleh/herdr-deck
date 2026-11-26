// Writes sample tiles to previews/ (no real data).
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentInfo } from "@herdr-deck/shared";
import { renderAgentTile, renderEmptyTile, renderErrorTile, renderOverviewTile, renderUsageTile, renderLoginTile } from "./index.js";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "previews");
await mkdir(outDir, { recursive: true });

const base: Omit<AgentInfo, "state" | "space" | "title"> = { id: "t1", address: "t1", machine: null, app: "claude-code", tab: "1", message: null, pinned: false };
const tiles: Record<string, string> = {
  "working.svg": renderAgentTile({ ...base, state: "working", space: "Frontend", title: "Dark mode" }),
  "blocked.svg": renderAgentTile({ ...base, state: "blocked", space: "Backend", title: "Fix auth bug" }),
  "blocked-flash.svg": renderAgentTile({ ...base, state: "blocked", space: "Backend", title: "Fix auth bug" }, { flash: true }),
  "done.svg": renderAgentTile({ ...base, state: "done", space: "Docs", title: "Update README" }),
  "idle.svg": renderAgentTile({ ...base, state: "idle", space: "Main", title: "Claude Code" }),
  "overview.svg": renderOverviewTile({ working: 2, blocked: 1, done: 2, idle: 3, unknown: 0, total: 8 }),
  "overview-calm.svg": renderOverviewTile({ working: 3, blocked: 0, done: 0, idle: 2, unknown: 0, total: 5 }),
  "empty.svg": renderEmptyTile(4),
  "cli-working.svg": renderAgentTile({ ...base, state: "working", space: "Infra", title: "deploy-script" }, { badge: "HERDR CLI" }),
  "cli-blocked.svg": renderAgentTile({ ...base, state: "blocked", space: "Tests", title: "flaky-e2e" }, { badge: "HERDR CLI" }),
  "claude-5h.svg": renderUsageTile({ badge: "CLAUDE", title: "5 HOURS", usedPercent: 20, resetsAt: Date.now() + 134 * 60000 }),
  "claude-week.svg": renderUsageTile({ badge: "CLAUDE", title: "THIS WEEK", usedPercent: 64, resetsAt: Date.now() + 3.2 * 86400000 }),
  "claude-low.svg": renderUsageTile({ badge: "CLAUDE", title: "5 HOURS", usedPercent: 93, resetsAt: Date.now() + 25 * 60000 }),
  "claude-login.svg": renderLoginTile(),
  "cli-overview.svg": renderOverviewTile({ working: 1, blocked: 0, done: 2, idle: 8, unknown: 0, total: 11 }, { badge: "HERDR CLI" }),
  "error.svg": renderErrorTile("ssh: connect to host my-server: Connection refused"),
};

for (const [name, svg] of Object.entries(tiles)) await writeFile(resolve(outDir, name), svg);
console.log(`wrote ${Object.keys(tiles).length} tiles to ${outDir}`);
