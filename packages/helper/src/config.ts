// Where agent statuses come from, built from the plugin's (global) settings.

export type DeckSettings = {
  /** ssh target of the machine that runs herdr-core, e.g. `me@my-server`. Empty: this computer only. */
  sshTarget?: string;
  /** That machine's name in herdr (`hc machine ls`), used to focus its agents. Default: the ssh host. */
  machine?: string;
  /** hc on the remote machine (run through its login shell). */
  remoteHc?: string;
  /** hc on this computer. */
  hcPath?: string;
  /** Also read this computer's herdr-core. Default: only when no sshTarget is set. */
  includeLocal?: boolean;
  /** herdr-app on this computer, used to jump to an agent when a key is pressed. */
  herdrAppPath?: string;
  /** The herdr CLI on the server (or here when no sshTarget). */
  cliHerdr?: string;
  /** Also read the herdr CLI on this computer. Default: on. */
  cliLocal?: boolean;
  /** The herdr CLI on this computer. Default: `herdr` on PATH. */
  localCliHerdr?: string;
};

export type SourceConfig = {
  /** "hc": herdr-core event stream (the app). "cli": herdr CLI snapshots. */
  kind: "hc" | "cli";
  /** Machine name for agent ids (null = this computer). */
  machine: string | null;
  label: string;
  command: string;
  args: string[];
  /** Run the command again this often (ms) after it exits cleanly, instead of streaming. */
  pollMs?: number;
  /** Written to the command's stdin (then closed). */
  stdin?: string;
};

export const DEFAULT_REMOTE_HC = "~/.local/bin/hc";
export const DEFAULT_CLI_HERDR = "~/.local/bin/herdr";

export function hostOf(sshTarget: string): string {
  const withoutUser = sshTarget.includes("@") ? sshTarget.slice(sshTarget.lastIndexOf("@") + 1) : sshTarget;
  return withoutUser.split(":")[0]!.trim();
}

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

export function buildSources(settings: DeckSettings): SourceConfig[] {
  const sources: SourceConfig[] = [];
  const sshTarget = clean(settings.sshTarget);
  const includeLocal = settings.includeLocal ?? !sshTarget;

  if (includeLocal) {
    sources.push({ kind: "hc", machine: null, label: "local", command: clean(settings.hcPath) || "hc", args: ["events", "--json"] });
  }

  if (sshTarget) {
    const remoteHc = clean(settings.remoteHc) || DEFAULT_REMOTE_HC;
    sources.push({
      kind: "hc",
      machine: clean(settings.machine) || hostOf(sshTarget),
      label: sshTarget,
      command: "ssh",
      args: [
        ...SSH_OPTIONS,
        sshTarget,
        `${remoteHc} events --json`,
      ],
    });
  }
  return sources;
}

export const SSH_OPTIONS = ["-T", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2"];

/**
 * Prints `herdr api snapshot` once a second. Unchanged snapshots are dropped on the plugin side.
 * It is POSIX sh, sent on stdin to `sh -s`, so it works whatever the server's login shell is
 * (fish has no `while :; do`) and needs no quoting (Windows ssh.exe mangles quotes).
 */
export function cliLoop(herdr: string): string {
  return `while :; do ${herdr} api snapshot </dev/null || exit 1; sleep 1; done\n`;
}

/** The herdr CLI sources: the server's over ssh, and this computer's own herdr. */
export function buildCliSources(settings: DeckSettings): SourceConfig[] {
  const sources: SourceConfig[] = [];
  const sshTarget = clean(settings.sshTarget);
  if (sshTarget) {
    const herdr = clean(settings.cliHerdr) || DEFAULT_CLI_HERDR;
    sources.push({
      kind: "cli",
      machine: clean(settings.machine) || hostOf(sshTarget),
      label: `herdr @ ${sshTarget}`,
      command: "ssh",
      args: [...SSH_OPTIONS, sshTarget, "sh -s"],
      stdin: cliLoop(herdr),
    });
  }
  if (settings.cliLocal ?? true) {
    const herdr = clean(settings.localCliHerdr) || (sshTarget ? "herdr" : clean(settings.cliHerdr) || "herdr");
    sources.push({ kind: "cli", machine: null, label: "local herdr", command: herdr, args: ["api", "snapshot"], pollMs: 1000 });
  }
  return sources;
}

/** Command that focuses a herdr CLI agent: `server/wH:p1` over ssh, a bare `wH:p1` on this computer. */
export function cliFocusCommand(settings: DeckSettings, id: string): { command: string; args: string[] } {
  const slash = id.lastIndexOf("/");
  const pane = id.slice(slash + 1);
  const sshTarget = clean(settings.sshTarget);
  if (slash < 0 || !sshTarget) {
    const herdr = clean(settings.localCliHerdr) || (sshTarget ? "herdr" : clean(settings.cliHerdr) || "herdr");
    return { command: herdr, args: ["agent", "focus", pane] };
  }
  const herdr = clean(settings.cliHerdr) || DEFAULT_CLI_HERDR;
  return { command: "ssh", args: [...SSH_OPTIONS, sshTarget, `${herdr} agent focus '${pane.replace(/'/g, "")}'`] };
}
