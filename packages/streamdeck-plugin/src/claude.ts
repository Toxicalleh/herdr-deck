// Claude usage keys: one shared poll of the Claude Code login's usage, drawn on every Claude key.

import { fetchClaudeUsage, type ClaudeSource, type ClaudeUsage, type DeckSettings } from "@herdr-deck/helper";
import { renderEmptyTile, renderErrorTile, renderLoginTile, renderUsageTile, svgDataUrl } from "@herdr-deck/renderer";

export const CLAUDE_USAGE_ACTION = "com.herdr-deck.claude-usage";

export type UsageWindowChoice = "5h" | "weekly" | "lowest";
export type ClaudeKeySettings = { window?: UsageWindowChoice };
export type ClaudeGlobalSettings = DeckSettings & { claudeSource?: ClaudeSource };

const BADGE = "CLAUDE";
const POLL_MS = 60_000;
const MIN_REFRESH_MS = 10_000;

/** The image for one Claude key. `last` is the last good reading, kept when Claude rate-limits us. */
export function claudeImage(usage: ClaudeUsage | null, last: ClaudeUsage | null, choice: UsageWindowChoice = "5h", settings: ClaudeGlobalSettings = {}, now = Date.now()): string {
  const shown = usage?.ok ? usage : usage && usage.reason !== "limited" ? usage : last ?? usage;
  if (!shown) return svgDataUrl(renderEmptyTile("CHECKING…", BADGE));
  if (!shown.ok) {
    if (shown.reason === "login") {
      const where = settings.claudeSource === "pc" || !settings.sshTarget?.trim() ? "on this PC" : "on the server";
      return svgDataUrl(renderLoginTile(BADGE, where));
    }
    return svgDataUrl(renderErrorTile(shown.message, BADGE));
  }
  const windows = [
    { key: "5h" as const, title: "5 HOURS", info: shown.fiveHour },
    { key: "weekly" as const, title: "THIS WEEK", info: shown.weekly },
  ].filter((w) => w.info);
  const pick =
    choice === "lowest"
      ? [...windows].sort((a, b) => b.info!.usedPercent - a.info!.usedPercent)[0]
      : windows.find((w) => w.key === choice) ?? windows[0];
  if (!pick) return svgDataUrl(renderErrorTile("no usage limits", BADGE));
  return svgDataUrl(renderUsageTile({ badge: BADGE, title: pick.title, usedPercent: pick.info!.usedPercent, resetsAt: pick.info!.resetsAt, now }));
}

type Handle = { setImage(image?: string): Promise<void> };
type Log = { info(m: string): void; warn(m: string): void };

export class ClaudeKeys {
  private keys = new Map<string, { handle: Handle; settings: ClaudeKeySettings }>();
  private usage: ClaudeUsage | null = null;
  private lastGood: ClaudeUsage | null = null;
  private settings: ClaudeGlobalSettings = {};
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;
  private lastFetch = 0;

  constructor(private readonly log: Log) {}

  setSettings(settings: ClaudeGlobalSettings): void {
    const changed = settings.sshTarget !== this.settings.sshTarget || settings.claudeSource !== this.settings.claudeSource;
    this.settings = settings;
    if (changed && this.keys.size) void this.refresh(true);
  }

  add(id: string, handle: Handle, settings: ClaudeKeySettings): void {
    this.keys.set(id, { handle, settings });
    this.draw(id);
    if (!this.timer) {
      this.timer = setInterval(() => void this.refresh(true), POLL_MS);
      void this.refresh(true);
    }
  }

  remove(id: string): void {
    this.keys.delete(id);
    if (!this.keys.size && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  has(id: string): boolean {
    return this.keys.has(id);
  }

  updateKey(id: string, settings: ClaudeKeySettings): void {
    const key = this.keys.get(id);
    if (!key) return;
    key.settings = settings;
    this.draw(id);
  }

  /** Fetch now (a key press). Skipped if we fetched in the last 10 s. */
  refresh(force = false): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!force && Date.now() - this.lastFetch < MIN_REFRESH_MS) return Promise.resolve();
    this.inFlight = (async () => {
      try {
        const usage = await fetchClaudeUsage(this.settings);
        this.lastFetch = Date.now();
        if (usage.ok) {
          if (!this.usage?.ok) this.log.info(`claude usage: ok via ${usage.source}`);
          this.lastGood = usage;
        } else if (this.usage?.ok !== false || this.usage.reason !== usage.reason) {
          this.log.warn(`claude usage: ${usage.reason}: ${usage.message}`);
        }
        this.usage = usage;
      } finally {
        this.inFlight = null;
      }
      for (const id of this.keys.keys()) this.draw(id);
    })();
    return this.inFlight;
  }

  private draw(id: string): void {
    const key = this.keys.get(id);
    if (!key) return;
    const image = claudeImage(this.usage, this.lastGood, key.settings.window ?? "5h", this.settings);
    void key.handle.setImage(image).catch((error) => this.log.warn(`setImage failed: ${String(error)}`));
  }
}
