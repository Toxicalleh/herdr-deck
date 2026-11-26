import { test } from "node:test";
import assert from "node:assert/strict";
import type { DeckState } from "@herdr-deck/helper";
import type { AgentInfo } from "@herdr-deck/shared";
import { agentChoices, familyOf, imageForKey, pressForKey, resolveKeys, type KeyInfo } from "./deck.js";

const agent = (address: string, state: AgentInfo["state"]): AgentInfo => ({
  id: `box/${address}`, address, machine: "box", app: "claude-code", state, space: "S", tab: "1", title: address, message: null, pinned: false,
});

const state: DeckState = { agents: [agent("t3", "working"), agent("t9", "blocked"), agent("t11", "idle")], sources: [], error: null, ready: true, cliHosts: [] };

const keys: KeyInfo[] = [
  { id: "b", kind: "agent", device: "d", row: 0, column: 2, settings: {} },
  { id: "a", kind: "agent", device: "d", row: 0, column: 1, settings: {} },
  { id: "c", kind: "agent", device: "d", row: 1, column: 0, settings: { agent: "box/t3" } },
  { id: "o", kind: "overview", device: "d", row: 0, column: 0, settings: {} },
];

test("chosen agents stay put; auto keys take the rest in reading order", () => {
  const targets = resolveKeys(keys, state);
  assert.equal(targets.get("c")!.agent!.id, "box/t3");
  assert.equal(targets.get("a")!.agent!.id, "box/t9");
  assert.equal(targets.get("b")!.agent!.id, "box/t11");
  assert.equal(targets.has("o"), false);
});

test("a chosen agent that is gone shows NOT RUNNING", () => {
  const gone = resolveKeys([{ ...keys[2]!, settings: { agent: "box/t99" } }], state);
  assert.equal(gone.get("c")!.agent, null);
  const svg = Buffer.from(imageForKey(keys[2]!, gone, state, false).split(",")[1]!, "base64").toString();
  assert.match(svg, /NOT RUNNING/);
});

test("presses focus the agent; overview goes to the blocked one", () => {
  const targets = resolveKeys(keys, state);
  assert.deepEqual(pressForKey(keys[2]!, targets, state), { kind: "focus", id: "box/t3" });
  assert.deepEqual(pressForKey(keys[3]!, targets, state), { kind: "focus", id: "box/t9" });
  const calm: DeckState = { ...state, agents: [agent("t3", "working")] };
  assert.deepEqual(pressForKey(keys[3]!, resolveKeys(keys, calm), calm), { kind: "next" });
  assert.deepEqual(pressForKey(keys[0]!, resolveKeys(keys, calm), calm), { kind: "none" });
});

test("dropdown lists auto, every agent, and a gone choice", () => {
  const items = agentChoices(state, "box/t99");
  assert.deepEqual(items[0], { label: "Auto (next free agent)", value: "" });
  assert.equal(items[1]!.value, "box/t3");
  assert.equal(items[1]!.label, "S / 1 — t3 [box]");
  assert.equal(items.at(-1)!.label, "box/t99 (not running)");
});

test("offline shows the error tile", () => {
  const offline: DeckState = { agents: [], sources: [], error: "nope", ready: false, cliHosts: [] };
  const svg = Buffer.from(imageForKey(keys[0]!, resolveKeys(keys, offline), offline, false).split(",")[1]!, "base64").toString();
  assert.match(svg, /OFFLINE/);
});

test("cli keys only see the cli family and get the HERDR CLI band", () => {
  const cliKeys: KeyInfo[] = [
    { id: "x", kind: "cli-agent", device: "d", row: 0, column: 0, settings: {} },
    { id: "y", kind: "cli-overview", device: "d", row: 0, column: 1, settings: {} },
    keys[1]!,
  ];
  const cliState: DeckState = { ...state, agents: [{ ...agent("wK:p1", "idle"), id: "wK:p1" }], cliHosts: [] };
  const targets = resolveKeys(cliKeys, cliState, "cli");
  assert.equal(targets.get("x")!.agent!.id, "wK:p1");
  assert.equal(targets.has("a"), false);
  assert.equal(familyOf("cli-overview"), "cli");
  const svg = Buffer.from(imageForKey(cliKeys[0]!, targets, cliState, false).split(",")[1]!, "base64").toString();
  assert.match(svg, /HERDR CLI/);
  assert.deepEqual(pressForKey(cliKeys[1]!, targets, cliState), { kind: "none" });
});
