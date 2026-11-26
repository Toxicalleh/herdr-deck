import { test } from "node:test";
import assert from "node:assert/strict";
import { delimiter } from "node:path";
import { extendPath, friendlyError } from "./env.js";

test("extendPath appends the usual tool dirs once, keeping the user's order", () => {
  const env: NodeJS.ProcessEnv = { PATH: ["/usr/bin", "/opt/homebrew/bin"].join(delimiter) };
  const path = extendPath(env, "darwin", "/Users/me").split(delimiter);
  assert.deepEqual(path.slice(0, 2), ["/usr/bin", "/opt/homebrew/bin"]);
  assert.ok(path.includes("/Users/me/.local/bin"));
  assert.equal(path.filter((p) => p === "/opt/homebrew/bin").length, 1);
});

test("friendlyError gives hints people can act on", () => {
  assert.equal(friendlyError("hc", "spawn hc ENOENT"), "hc not found: set its path in the key settings");
  assert.match(friendlyError("hc", "me@box: Permission denied (publickey)."), /ssh needs a key/);
  assert.match(friendlyError("hc", "bash: line 1: /home/me/.local/bin/hc: No such file or directory", true), /not found on the server/);
  assert.equal(friendlyError("hc", "something else"), "something else");
  assert.equal(friendlyError("herdr", '{"error":{"code":"server_not_running","message":"no herdr server is running"}}', true), "herdr is not running on the server");
});
