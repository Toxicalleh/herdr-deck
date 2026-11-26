import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentInfo } from "@herdr-deck/shared";
import { renderAgentTile, renderErrorTile, renderOverviewTile, truncate } from "./index.js";

const agent: AgentInfo = {
  id: "box/t3", address: "t3", machine: "box", app: "claude-code", state: "blocked",
  space: "Data <science>", tab: "1", title: "A very long title that will be cut", message: null, pinned: false,
};

test("agent tile escapes and truncates text", () => {
  const svg = renderAgentTile(agent);
  assert.match(svg, /DATA &lt;SCIEN…/);
  assert.match(svg, /NEEDS YOU/);
  assert.doesNotMatch(svg, /<science>/);
});

test("blocked tile flashes", () => {
  assert.notEqual(renderAgentTile(agent, { flash: true }), renderAgentTile(agent));
  const idle = { ...agent, state: "idle" as const };
  assert.equal(renderAgentTile(idle, { flash: true }), renderAgentTile(idle));
});

test("overview shows blocked count first", () => {
  const svg = renderOverviewTile({ working: 2, blocked: 1, done: 0, idle: 3, unknown: 0, total: 6 });
  assert.match(svg, />1</);
  assert.match(svg, /NEEDS YOU/);
});

test("helpers", () => {
  assert.equal(truncate("abcdef", 4), "abc…");
  assert.match(renderErrorTile("ssh: connect to host box port 22: Connection refused"), /OFFLINE/);
});
