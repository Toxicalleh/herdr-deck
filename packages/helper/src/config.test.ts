import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCliSources, buildSources, cliFocusCommand, hostOf } from "./config.js";

test("local only by default", () => {
  const sources = buildSources({});
  assert.equal(sources.length, 1);
  assert.deepEqual([sources[0]!.machine, sources[0]!.command, sources[0]!.args], [null, "hc", ["events", "--json"]]);
});

test("ssh source names the machine after the host and skips local", () => {
  const sources = buildSources({ sshTarget: "me@my-server" });
  assert.equal(sources.length, 1);
  assert.equal(sources[0]!.machine, "my-server");
  assert.equal(sources[0]!.command, "ssh");
  assert.equal(sources[0]!.args.at(-1), "~/.local/bin/hc events --json");
  assert.equal(sources[0]!.args.at(-2), "me@my-server");
});

test("explicit machine name and local", () => {
  const sources = buildSources({ sshTarget: "box", machine: "linux", includeLocal: true });
  assert.deepEqual(sources.map((s) => s.machine), [null, "linux"]);
  assert.equal(hostOf("me@host.local"), "host.local");
});

test("cli source polls herdr api snapshot over ssh", () => {
  const [cli] = buildCliSources({ sshTarget: "me@server.example.com", machine: "server" });
  assert.equal(cli!.kind, "cli");
  assert.equal(cli!.machine, "server");
  assert.equal(cli!.args.at(-1), "sh -s");
  assert.match(cli!.stdin!, /~\/\.local\/bin\/herdr api snapshot <\/dev\/null/);
  assert.deepEqual(cliFocusCommand({ sshTarget: "box" }, "server/wH:p1").args.slice(-2), ["box", "~/.local/bin/herdr agent focus 'wH:p1'"]);
  // A bare pane id is on this PC.
  assert.deepEqual(cliFocusCommand({ sshTarget: "box" }, "wA:p1"), { command: "herdr", args: ["agent", "focus", "wA:p1"] });
  const sources = buildCliSources({ sshTarget: "box" });
  assert.deepEqual(sources.map((s) => [s.label, s.command, s.pollMs]), [["herdr @ box", "ssh", undefined], ["local herdr", "herdr", 1000]]);
  assert.equal(buildCliSources({ sshTarget: "box", cliLocal: false }).length, 1);
  assert.deepEqual(cliFocusCommand({}, "wH:p1"), { command: "herdr", args: ["agent", "focus", "wH:p1"] });
});
