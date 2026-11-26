// Claude plan usage (5-hour and weekly limits), read with the Claude Code login.
// Same idea as codex-usage-deck: no login of our own, we use the CLI's login file
// (`claude` then `/login`). That file is on this PC, or on the server over ssh.
// The usage endpoint is the one Claude Code's /usage uses; it is not documented.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DeckSettings } from "./config.js";
import { SSH_OPTIONS } from "./config.js";

export type UsageWindowInfo = {
  /** 0–100 */
  usedPercent: number;
  /** ms since epoch, or null */
  resetsAt: number | null;
};

export type ClaudeUsage =
  | { ok: true; fiveHour: UsageWindowInfo | null; weekly: UsageWindowInfo | null; source: "pc" | "server"; fetchedAt: number }
  | { ok: false; reason: "login" | "network" | "limited" | "error"; message: string; fetchedAt: number };

export type ClaudeCredentials = { accessToken: string; expiresAt: number | null };

export const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CREDENTIALS_REMOTE = "~/.claude/.credentials.json";

export function parseCredentials(text: string): ClaudeCredentials | null {
  try {
    const oauth = (JSON.parse(text) as { claudeAiOauth?: { accessToken?: unknown; expiresAt?: unknown } }).claudeAiOauth;
    if (!oauth || typeof oauth.accessToken !== "string" || !oauth.accessToken) return null;
    return { accessToken: oauth.accessToken, expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : null };
  } catch {
    return null;
  }
}

function expired(creds: ClaudeCredentials, now = Date.now()): boolean {
  return creds.expiresAt !== null && creds.expiresAt <= now + 30_000;
}

async function localCredentials(): Promise<ClaudeCredentials | null> {
  const dir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
  try {
    return parseCredentials(await readFile(join(dir, ".credentials.json"), "utf8"));
  } catch {
    // On macOS Claude Code keeps the login in the Keychain instead of a file.
    return process.platform === "darwin" ? keychainCredentials() : null;
  }
}

/** macOS: the same JSON, stored by Claude Code as the "Claude Code-credentials" Keychain item. */
function keychainCredentials(): Promise<ClaudeCredentials | null> {
  return new Promise((resolve) => {
    execFile("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], { timeout: 15000, maxBuffer: 1 << 20 }, (error, stdout) => {
      resolve(error ? null : parseCredentials(stdout.trim()));
    });
  });
}

/** Read the login file on the server. The command has no quotes (Windows ssh.exe). */
function serverCredentials(sshTarget: string): Promise<ClaudeCredentials | null> {
  return new Promise((resolve) => {
    execFile("ssh", [...SSH_OPTIONS, sshTarget, `cat ${CREDENTIALS_REMOTE}`], { windowsHide: true, timeout: 15000, maxBuffer: 1 << 20 }, (error, stdout) => {
      resolve(error ? null : parseCredentials(stdout));
    });
  });
}

function windowFrom(value: unknown): UsageWindowInfo | null {
  const w = value as { utilization?: unknown; resets_at?: unknown } | null;
  if (!w || typeof w.utilization !== "number") return null;
  const reset = typeof w.resets_at === "string" ? Date.parse(w.resets_at) : NaN;
  return { usedPercent: Math.max(0, Math.min(100, w.utilization)), resetsAt: Number.isFinite(reset) ? reset : null };
}

export function parseUsage(payload: unknown): { fiveHour: UsageWindowInfo | null; weekly: UsageWindowInfo | null } {
  const p = (payload ?? {}) as { five_hour?: unknown; seven_day?: unknown };
  return { fiveHour: windowFrom(p.five_hour), weekly: windowFrom(p.seven_day) };
}

/**
 * Where to read the login from. "auto": this PC if it has a valid login, else the server.
 */
export type ClaudeSource = "auto" | "pc" | "server";

export async function fetchClaudeUsage(settings: DeckSettings & { claudeSource?: ClaudeSource }, fetchImpl: typeof fetch = fetch): Promise<ClaudeUsage> {
  const fetchedAt = Date.now();
  const mode = settings.claudeSource ?? "auto";
  const sshTarget = (settings.sshTarget ?? "").trim();

  let creds: ClaudeCredentials | null = null;
  let source: "pc" | "server" = "pc";
  if (mode !== "server") {
    const local = await localCredentials();
    if (local && !expired(local)) creds = local;
  }
  if (!creds && mode !== "pc" && sshTarget) {
    const remote = await serverCredentials(sshTarget);
    if (remote && !expired(remote)) {
      creds = remote;
      source = "server";
    }
  }
  if (!creds) {
    const where = mode === "pc" || !sshTarget ? "this PC" : mode === "server" ? "the server" : "this PC or the server";
    return { ok: false, reason: "login", message: `No valid Claude Code login on ${where}. Run claude, then /login.`, fetchedAt };
  }

  let response: Response;
  try {
    response = await fetchImpl(USAGE_URL, {
      headers: { Authorization: `Bearer ${creds.accessToken}`, "anthropic-beta": "oauth-2025-04-20", Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    return { ok: false, reason: "network", message: error instanceof Error ? error.message : String(error), fetchedAt };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "login", message: `Claude said HTTP ${response.status}. Run claude, then /login.`, fetchedAt };
  if (response.status === 429) return { ok: false, reason: "limited", message: "Too many usage requests, trying again later.", fetchedAt };
  if (!response.ok) return { ok: false, reason: "error", message: `Claude usage: HTTP ${response.status}`, fetchedAt };
  const { fiveHour, weekly } = parseUsage(await response.json().catch(() => null));
  if (!fiveHour && !weekly) return { ok: false, reason: "error", message: "No usage limits in the answer.", fetchedAt };
  return { ok: true, fiveHour, weekly, source, fetchedAt };
}
