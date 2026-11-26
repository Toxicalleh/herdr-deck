// Things that differ per computer: where tools are installed, and error text people can act on.

import { homedir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * Stream Deck starts plugins with a bare PATH (on macOS just /usr/bin:/bin:/usr/sbin:/sbin),
 * so `hc`, `herdr`, `herdr-app` and Homebrew's tools aren't found. Append the usual install dirs.
 */
export function extendPath(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform, home = homedir()): string {
  const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
  const current = (env[key] ?? "").split(delimiter).filter(Boolean);
  const extra =
    platform === "win32"
      ? [join(home, ".local", "bin"), join(home, ".cargo", "bin")]
      : [join(home, ".local", "bin"), join(home, ".cargo", "bin"), join(home, "bin"), "/opt/homebrew/bin", "/usr/local/bin"];
  const seen = new Set(current);
  const path = [...current, ...extra.filter((dir) => !seen.has(dir))].join(delimiter);
  env[key] = path;
  return path;
}

/** Turn spawn/ssh errors into a short hint that fits on a key. */
export function friendlyError(command: string, message: string, remote = false): string {
  let text = message.trim();
  // herdr prints errors as JSON: {"error":{"code":"server_not_running","message":"…"}}
  if (text.startsWith("{")) {
    try {
      const error = (JSON.parse(text) as { error?: { code?: string; message?: string } }).error;
      if (error?.code === "server_not_running") return `${command} is not running${remote ? " on the server" : ""}`;
      if (error?.message) text = error.message;
    } catch {
      // not JSON after all
    }
  }
  if (/ENOENT/.test(text)) return `${command} not found: set its path in the key settings`;
  if (/Permission denied \(/.test(text)) return "ssh needs a key without password (see README)";
  if (/Host key verification failed/.test(text)) return "run ssh once by hand to accept the host key";
  if (/Could not resolve hostname/.test(text)) return "ssh: unknown host, check SSH target";
  if (remote && /(No such file|command not found|not found)/.test(text)) return `${command} not found on the server: set its path`;
  return text;
}
