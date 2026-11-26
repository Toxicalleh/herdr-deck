import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { renderAgentTile, renderOverviewTile, renderUsageTile } from "@herdr-deck/renderer";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(packageDir, "dist", "com.herdr-deck.sdPlugin");

await rm(outDir, { recursive: true, force: true });
await mkdir(resolve(outDir, "bin"), { recursive: true });
await cp(resolve(packageDir, "plugin", "manifest.json"), resolve(outDir, "manifest.json"));
await cp(resolve(packageDir, "plugin", "package.json"), resolve(outDir, "package.json"));
await cp(resolve(packageDir, "plugin", "ui"), resolve(outDir, "ui"), { recursive: true });

// Icons are rendered from the same tiles the keys show.
const imgs = resolve(outDir, "imgs");
await mkdir(imgs, { recursive: true });
const sample = { id: "t1", address: "t1", machine: null, app: "claude-code", tab: "1", message: null, pinned: false };
const agentIcon = renderAgentTile({ ...sample, state: "working", space: "Herdr", title: "agent" });
const overviewIcon = renderOverviewTile({ working: 2, blocked: 1, done: 1, idle: 2, unknown: 0, total: 6 });
await writeFile(resolve(imgs, "agent-icon.svg"), agentIcon);
await writeFile(resolve(imgs, "overview-icon.svg"), overviewIcon);
// Plugin and category icons must be PNG (made by scripts/png.sh from docs/images).
await cp(resolve(packageDir, "plugin", "imgs"), imgs, { recursive: true });
const cliAgentIcon = renderAgentTile({ ...sample, state: "working", space: "Herdr", title: "agent" }, { badge: "HERDR CLI" });
const cliOverviewIcon = renderOverviewTile({ working: 2, blocked: 1, done: 1, idle: 2, unknown: 0, total: 6 }, { badge: "HERDR CLI" });
await writeFile(resolve(imgs, "cli-agent-icon.svg"), cliAgentIcon);
await writeFile(resolve(imgs, "cli-overview-icon.svg"), cliOverviewIcon);
await writeFile(resolve(imgs, "claude-usage-icon.svg"), renderUsageTile({ badge: "CLAUDE", title: "5 HOURS", usedPercent: 20, resetsAt: null }));

await build({
  entryPoints: [resolve(packageDir, "src", "plugin.ts")],
  outfile: resolve(outDir, "bin", "plugin.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});

console.log(`built ${outDir}`);
