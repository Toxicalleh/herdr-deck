// herdr-deck helper CLI: check the data source without Stream Deck.
//   node dist/cli.js status [--ssh user@host] [--machine name] [--remote-hc path] [--local]
//   node dist/cli.js watch  [same options]
//   node dist/cli.js claude [--ssh user@host]   Claude plan usage from the Claude Code login
//   add --cli to read the herdr CLI (`herdr api snapshot`) instead of the app's herdr-core

import { summarize } from "@herdr-deck/shared";
import { AgentHub, extendPath, fetchClaudeUsage, type DeckSettings, type DeckState } from "./index.js";

extendPath();

function parseArgs(argv: string[]): { command: string; settings: DeckSettings; cli: boolean } {
  const [command = "status", ...rest] = argv;
  const settings: DeckSettings = {};
  let cli = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = () => rest[++i] ?? "";
    if (arg === "--ssh") settings.sshTarget = next();
    else if (arg === "--machine") settings.machine = next();
    else if (arg === "--remote-hc") settings.remoteHc = next();
    else if (arg === "--hc") settings.hcPath = next();
    else if (arg === "--local") settings.includeLocal = true;
    else if (arg === "--cli") cli = true;
    else if (arg === "--herdr") settings.cliHerdr = next();
  }
  return { command, settings, cli };
}

function line(state: DeckState): string {
  const s = summarize(state.agents);
  const head = state.error ? `error: ${state.error}` : `${s.total} agents · ${s.working} working · ${s.blocked} blocked · ${s.done} done · ${s.idle} idle`;
  const rows = state.agents.map((a) => `  ${a.state.padEnd(8)} ${a.id.padEnd(14)} ${a.space} / ${a.tab}  — ${a.title}`);
  return [head, ...rows].join("\n");
}

const { command, settings, cli } = parseArgs(process.argv.slice(2));

if (command === "claude") {
  const usage = await fetchClaudeUsage(settings);
  console.log(JSON.stringify(usage, null, 2));
  process.exit(usage.ok ? 0 : 1);
}

const hub = new AgentHub(cli ? "cli" : "app");

if (command === "status") {
  const timeout = setTimeout(() => {
    console.error(JSON.stringify(hub.state(), null, 2));
    hub.stop();
    process.exit(1);
  }, 15000);
  hub.on("change", (state: DeckState) => {
    const settled = state.sources.every((s) => s.connected || s.error);
    if (!settled || (!state.ready && !state.error)) return;
    clearTimeout(timeout);
    console.log(JSON.stringify(state, null, 2));
    hub.stop();
    process.exit(state.ready ? 0 : 1);
  });
} else if (command === "watch") {
  hub.on("change", (state: DeckState) => console.log(`\n[${new Date().toLocaleTimeString()}] ${line(state)}`));
  process.on("SIGINT", () => {
    hub.stop();
    process.exit(0);
  });
} else {
  console.error(`unknown command: ${command} (use status or watch)`);
  process.exit(2);
}

hub.configure(settings);
