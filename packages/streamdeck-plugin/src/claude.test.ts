import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCredentials, parseUsage, type ClaudeUsage } from "@herdr-deck/helper";
import { formatResetIn } from "@herdr-deck/renderer";
import { claudeImage } from "./claude.js";

const decode = (url: string) => Buffer.from(url.split(",")[1]!, "base64").toString();
const now = Date.parse("2026-11-23T08:00:00Z");
const ok: ClaudeUsage = { ok: true, source: "server", fetchedAt: now, fiveHour: { usedPercent: 20, resetsAt: now + 134 * 60000 }, weekly: { usedPercent: 64, resetsAt: now + 3 * 86400000 } };

test("parses the Claude Code login file and the usage answer", () => {
  assert.deepEqual(parseCredentials(JSON.stringify({ claudeAiOauth: { accessToken: "x", expiresAt: 5 } })), { accessToken: "x", expiresAt: 5 });
  assert.equal(parseCredentials("{}"), null);
  assert.equal(parseCredentials("not json"), null);
  const usage = parseUsage({ five_hour: { utilization: 19, resets_at: "2026-11-23T11:00:00.011+00:00" }, seven_day: null });
  assert.equal(usage.fiveHour!.usedPercent, 19);
  assert.equal(usage.fiveHour!.resetsAt, Date.parse("2026-11-23T11:00:00.011Z"));
  assert.equal(usage.weekly, null);
});

test("Claude key shows the chosen window, the lower one, or a login tile", () => {
  const fiveHour = decode(claudeImage(ok, ok, "5h", {}, now));
  assert.match(fiveHour, /5 HOURS/);
  assert.match(fiveHour, />80%</);
  assert.match(fiveHour, /resets in 2h 14m/);
  assert.match(decode(claudeImage(ok, ok, "weekly", {}, now)), />36%</);
  assert.match(decode(claudeImage(ok, ok, "lowest", {}, now)), /THIS WEEK/);
  const login: ClaudeUsage = { ok: false, reason: "login", message: "x", fetchedAt: now };
  assert.match(decode(claudeImage(login, ok, "5h", { sshTarget: "box" }, now)), /LOG IN[\s\S]*on the server/);
  // Rate limited: keep showing the last good numbers.
  const limited: ClaudeUsage = { ok: false, reason: "limited", message: "x", fetchedAt: now };
  assert.match(decode(claudeImage(limited, ok, "5h", {}, now)), />80%</);
  assert.equal(formatResetIn(now + 45 * 60000, now), "45m");
});
