import { test } from "node:test";
import assert from "node:assert/strict";
import { agentsFromModel, applyEvent, dedupeAgents, modelFromSnapshot, mostUrgent, parseStreamLine, summarize, type RawTerminal } from "./index.js";

const terminals: RawTerminal[] = [
  { address: "t2", state: "live", status: null, turn: 0, title: "bash", labels: { where: "Main / 1" } },
  { address: "t3", state: "live", status: { app: "claude-code", state: "working", msg: "Editing" }, turn: 10, title: "Herdr deck", labels: { where: "Main / Main", "herdr.seen": "10" } },
  { address: "t9", state: "live", status: { app: "claude-code", state: "done" }, turn: 2, title: "Docs", labels: { where: "Data science / 1", "herdr.seen": "1" } },
  { address: "t14", state: "live", status: { app: "claude-code", state: "done" }, turn: 11, title: "Seen", labels: { where: "Data mining / 2", "herdr.seen": "11" } },
  { address: "t15", state: "finished", status: { app: "claude-code", state: "idle" }, turn: 1, labels: {} },
  { address: "t17", state: "live", status: { app: "codex", state: "blocked" }, turn: 4, title: "Needs input", labels: { where: "3D / 1", "herdr.pinned": "1" } },
];

test("parses snapshot and event lines", () => {
  const snap = parseStreamLine(JSON.stringify({ seq: 1, terminals }));
  assert.equal(snap.kind, "snapshot");
  const ev = parseStreamLine('{"jsonrpc":"2.0","method":"event","params":{"data":{"turn":3},"seq":2,"terminal":"t9","type":"turn"}}');
  assert.deepEqual(ev, { kind: "event", terminal: "t9", type: "turn", data: { turn: 3 } });
  assert.equal(parseStreamLine("not json").kind, "ignored");
  assert.equal(parseStreamLine('{"error":{"message":"boom"}}').kind, "error");
});

test("builds agents: only live terminals with a status, pinned first, seen done becomes idle", () => {
  const agents = agentsFromModel(modelFromSnapshot(terminals), "my-server");
  assert.deepEqual(agents.map((a) => [a.id, a.state]), [
    ["my-server/t17", "blocked"],
    ["my-server/t3", "working"],
    ["my-server/t9", "done"],
    ["my-server/t14", "idle"],
  ]);
  assert.equal(agents[1]!.space, "Main");
  assert.equal(agents[1]!.tab, "Main");
  assert.equal(agents[1]!.message, "Editing");
});

test("applies events and reports unknown terminals", () => {
  const model = modelFromSnapshot(terminals);
  assert.equal(applyEvent(model, "t3", { status: { app: "claude-code", state: "blocked" } }), true);
  assert.equal(agentsFromModel(model, null).find((a) => a.id === "t3")!.state, "blocked");
  assert.equal(applyEvent(model, "t99", { turn: 1 }), false);
});

test("a PC core that lists server/tN dedupes against the ssh source", () => {
  // Shape of `hc events` on the Windows PC: own pwsh shells + the server's agents.
  const pc: RawTerminal[] = [
    { address: "t4", state: "live", status: null, turn: 1, labels: { where: "3dprinting / 1" } },
    { address: "server/t3", state: "live", status: { app: "claude-code", state: "done" }, turn: 16, labels: { where: "Main / Main" } },
    { address: "server/t9", state: "live", status: { app: "claude-code", state: "working" }, turn: 1, labels: { where: "Data science project / 1" } },
  ];
  const server: RawTerminal[] = [
    { address: "t3", state: "live", status: { app: "claude-code", state: "done" }, turn: 16, labels: { where: "Main / Main" } },
    { address: "t9", state: "live", status: { app: "claude-code", state: "working" }, turn: 1, labels: { where: "Data science project / 1" } },
    { address: "t11", state: "live", status: { app: "claude-code", state: "idle" }, turn: 2, labels: { where: "Data mining / 1" } },
  ];
  const local = agentsFromModel(modelFromSnapshot(pc), null);
  assert.deepEqual(local.map((a) => [a.id, a.machine, a.address]), [["server/t3", "server", "t3"], ["server/t9", "server", "t9"]]);
  const merged = dedupeAgents([...local, ...agentsFromModel(modelFromSnapshot(server), "server.example.com")]);
  assert.deepEqual(merged.map((a) => a.id), ["server/t3", "server/t9", "server.example.com/t11"]);
});

test("summary and most urgent", () => {
  const agents = agentsFromModel(modelFromSnapshot(terminals), null);
  const s = summarize(agents);
  assert.equal(s.total, 4);
  assert.equal(s.blocked, 1);
  assert.equal(mostUrgent(agents)!.id, "t17");
});

test("herdr CLI snapshot becomes agents with workspace/tab labels", async () => {
  const { parseCliSnapshot, cliAgentsFromSnapshot, herdrCliHosts } = await import("./index.js");
  const line = JSON.stringify({ id: "x", result: { type: "snapshot", snapshot: {
    agents: [
      { agent: "claude", agent_status: "working", pane_id: "wK:p1", tab_id: "wK:t1", workspace_id: "wK", name: "my-project", terminal_title_stripped: "Boxplots" },
      { agent: "claude", agent_status: "weird", pane_id: "wH:p2", tab_id: "wH:t1", workspace_id: "wH", terminal_title_stripped: "Claude Code" },
    ],
    workspaces: [{ workspace_id: "wK", label: "Data" }, { workspace_id: "wH", label: "Main" }],
    tabs: [{ tab_id: "wK:t1", label: "1" }, { tab_id: "wH:t1", label: "2" }],
  } } });
  const snapshot = parseCliSnapshot(line)!;
  const agents = cliAgentsFromSnapshot(snapshot, "server");
  assert.deepEqual(agents.map((a) => [a.id, a.state, a.space, a.tab, a.title]), [
    ["server/wK:p1", "working", "Data", "1", "my-project"],
    ["server/wH:p2", "unknown", "Main", "2", "Claude Code"],
  ]);
  assert.equal(cliAgentsFromSnapshot(snapshot, null)[0]!.id, "wK:p1");
  assert.equal(parseCliSnapshot("{}"), null);
  const model = modelFromSnapshot([{ address: "t2", state: "live", foreground: { name: "herdr" } }, { address: "t3", state: "live", foreground: { name: "claude" } }]);
  assert.deepEqual(herdrCliHosts(model, "server"), ["server/t2"]);
});
