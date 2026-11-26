// Renders tiles from live herdr data into docs/live/ (same options as the helper CLI: --ssh, --machine, --local).
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentHub, type DeckSettings, type DeckState } from "@herdr-deck/helper";
import { summarize } from "@herdr-deck/shared";
import { renderAgentTile, renderErrorTile, renderOverviewTile } from "./index.js";

const args = process.argv.slice(2);
const settings: DeckSettings = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--ssh") settings.sshTarget = args[++i];
  else if (args[i] === "--machine") settings.machine = args[++i];
  else if (args[i] === "--local") settings.includeLocal = true;
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "live");
const hub = new AgentHub();

hub.on("change", async (state: DeckState) => {
  if (!state.ready && !state.error) return;
  hub.stop();
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  if (!state.ready) {
    await writeFile(resolve(outDir, "error.svg"), renderErrorTile(state.error ?? "offline"));
  } else {
    await writeFile(resolve(outDir, "overview.svg"), renderOverviewTile(summarize(state.agents)));
    for (const [i, agent] of state.agents.entries()) {
      await writeFile(resolve(outDir, `${String(i + 1).padStart(2, "0")}-${agent.address}.svg`), renderAgentTile(agent));
    }
  }
  console.log(`wrote ${state.agents.length + 1} tiles to ${outDir}`);
  process.exit(0);
});
hub.configure(settings);
