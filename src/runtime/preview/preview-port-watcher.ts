/**
 * PreviewPortWatcher — auto-detection daemon for dev servers that start
 * listening inside a conversation's netns (Secure User-Site Preview /
 * Port Exposure, Phase 2 — see tasks/preview-port-exposure.md §3.2).
 *
 * Shape mirrors EmbedWorker / HostMaintenanceDaemon: PID lockfile, kill
 * switch, interval-driven ticks, tick-safety (errors swallowed),
 * idempotent start/stop. It is wired into `startBackgroundTimers()` as a
 * sibling daemon.
 *
 * The watcher is SOURCE-AGNOSTIC: it polls an injected `PreviewPortSource`
 * (see preview-port-source.ts) for the current LISTEN sockets of each
 * watched conversation. The real source (`NetnsPortSource`) is capability
 * -gated and yields nothing on a fail-closed host (D2) — so on the current
 * env the watcher is a logged no-op. Everything below is fully testable
 * with a `StaticPortSource`.
 *
 * Detection rules (§3.2):
 *   - Debounce / stabilize: a port must be observed LISTENing for
 *     `stabilizeTicks` consecutive ticks before it emits, so a dev server
 *     flapping on restart doesn't fire spuriously.
 *   - Dedup by `(conversationId, port)`: a port emits AT MOST ONCE while
 *     it stays up. It re-arms only after it has fully disappeared (so a
 *     restart on the same port can re-notify).
 *   - Infra-port filter: the bridge gateway's well-known ports and any
 *     caller-supplied internal ports are never surfaced.
 *
 * On a stable, new, non-infra port the watcher invokes `onDetected` with
 * `{ userId, conversationId, port }` — REQUESTER-SCOPED: the event carries
 * the owning conversation's user (registered via `watch()`); nothing is
 * ever broadcast globally.
 */

import { logger } from "../../logger";

const log = logger.child("preview.port-watcher");

import type { PreviewPortSource } from "./preview-port-source";

// ── Defaults / env-var contract ──────────────────────────────────────

/** Default poll cadence — 2s. Responsive without hammering /proc. */
const DEFAULT_POLL_MS = 2_000;
/** Floor on the poll interval. */
const MIN_POLL_MS = 250;
/** Default consecutive-tick count a port must stay up before emitting. */
const DEFAULT_STABILIZE_TICKS = 2;
/** Floor on stabilizeTicks (1 = emit on first sighting). */
const MIN_STABILIZE_TICKS = 1;
/** Lockfile path. */
const DEFAULT_LOCKFILE_PATH = ".ezcorp/preview-port-watcher.pid";

/**
 * Infra ports never surfaced as a preview. The bridge gateway commonly
 * exposes DNS (53) + a metadata/health port range; the app + preview
 * origins themselves (3000/4000/4173/5173-as-app is NOT here — 5173 is a
 * vite dev server, a legitimate detection). Callers can extend this set
 * via `infraPorts`. Kept conservative: only ports that are structurally
 * NOT a user dev server.
 */
const DEFAULT_INFRA_PORTS: readonly number[] = [22, 53, 0];

function isDisabledByKillSwitch(): boolean {
  return process.env.EZCORP_DISABLE_PREVIEW_WATCHER === "1";
}

function getPollIntervalMs(): number {
  const raw = process.env.EZCORP_PREVIEW_WATCHER_POLL_MS;
  if (raw === undefined || raw === "") return DEFAULT_POLL_MS;
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) {
    log.warn("EZCORP_PREVIEW_WATCHER_POLL_MS invalid — using default", {
      raw,
      defaultMs: DEFAULT_POLL_MS,
    });
    return DEFAULT_POLL_MS;
  }
  return Math.max(MIN_POLL_MS, n);
}

// ── Exported types ────────────────────────────────────────────────────

/** A requester-scoped detection event. */
export interface PreviewDetectedEvent {
  /** The owning conversation's user — attribution is per-conversation. */
  userId: string;
  conversationId: string;
  /** The detected dev-server port. */
  port: number;
}

/** Per-watched-conversation registration. */
interface WatchedConversation {
  userId: string;
  /** port → consecutive-tick count it has been observed listening. */
  seen: Map<number, number>;
  /** ports already emitted this up-cycle (dedup). Cleared per-port when
   *  the port disappears so a restart re-notifies. */
  emitted: Set<number>;
}

export interface PreviewPortWatcherOptions {
  /** The enumeration source. REQUIRED — no production default is wired
   *  here so the daemon is impossible to stand up without an explicit
   *  source (the bootstrap injects `NetnsPortSource`). */
  source: PreviewPortSource;
  /** Called with each requester-scoped detection. */
  onDetected: (event: PreviewDetectedEvent) => void | Promise<void>;
  /** Poll interval (ms). Default from env or 2000ms. Clamped ≥250ms. */
  wakeIntervalMs?: number;
  /** Consecutive ticks a port must stay up before emitting. Default 2. */
  stabilizeTicks?: number;
  /** Extra infra ports to filter (merged with the built-in set). */
  infraPorts?: number[];
  /** Disable the PID lockfile (test-only). */
  skipLockfile?: boolean;
  /** Override the lockfile path for tests. */
  lockfilePath?: string;
}

// ── PreviewPortWatcher class ─────────────────────────────────────────

export class PreviewPortWatcher {
  private readonly source: PreviewPortSource;
  private readonly onDetected: (event: PreviewDetectedEvent) => void | Promise<void>;
  private readonly wakeIntervalMs: number;
  private readonly stabilizeTicks: number;
  private readonly infraPorts: Set<number>;
  private readonly skipLockfile: boolean;
  private readonly lockfilePath: string;

  private timer?: ReturnType<typeof setInterval>;
  private lockfileOwned = false;
  private _ticking = false;
  /** convId → registration. Only watched conversations are polled. */
  private readonly watched = new Map<string, WatchedConversation>();

  constructor(options: PreviewPortWatcherOptions) {
    this.source = options.source;
    this.onDetected = options.onDetected;
    this.wakeIntervalMs = Math.max(MIN_POLL_MS, options.wakeIntervalMs ?? getPollIntervalMs());
    this.stabilizeTicks = Math.max(MIN_STABILIZE_TICKS, options.stabilizeTicks ?? DEFAULT_STABILIZE_TICKS);
    this.infraPorts = new Set<number>([...DEFAULT_INFRA_PORTS, ...(options.infraPorts ?? [])]);
    this.skipLockfile = options.skipLockfile ?? false;
    this.lockfilePath = options.lockfilePath ?? DEFAULT_LOCKFILE_PATH;
  }

  /**
   * Register a conversation for port watching. Requester-scoped: the
   * `userId` is the owning user every detection is attributed to.
   * Idempotent — re-registering refreshes the userId but keeps the
   * observed-port state so a re-watch doesn't reset stabilization.
   */
  watch(conversationId: string, userId: string): void {
    if (!conversationId || !userId) return;
    const existing = this.watched.get(conversationId);
    if (existing) {
      existing.userId = userId;
      return;
    }
    this.watched.set(conversationId, { userId, seen: new Map(), emitted: new Set() });
  }

  /** Stop watching a conversation (reaped on conversation close / stop).
   *  Idempotent — unknown conversation is a no-op. */
  unwatch(conversationId: string): void {
    this.watched.delete(conversationId);
  }

  /** Number of conversations currently watched (test/observability). */
  watchedCount(): number {
    return this.watched.size;
  }

  /**
   * Start the daemon. Returns true on success, false when refused (kill
   * switch or lockfile sibling). Idempotent.
   */
  async start(): Promise<boolean> {
    if (this.timer) return true;

    if (isDisabledByKillSwitch()) {
      log.warn("PreviewPortWatcher disabled by EZCORP_DISABLE_PREVIEW_WATCHER=1");
      return false;
    }

    if (!this.skipLockfile) {
      const acquired = await acquireLockfile(this.lockfilePath);
      if (!acquired) {
        log.warn("PreviewPortWatcher refused to start (sibling alive)", {
          lockfile: this.lockfilePath,
        });
        return false;
      }
      this.lockfileOwned = true;
    }

    this.timer = setInterval(() => {
      void this.tickOnce().catch((err: unknown) =>
        log.warn("preview-port-watcher: tick-failed", { error: String(err) }),
      );
    }, this.wakeIntervalMs);
    if (typeof this.timer === "object" && this.timer !== null && "unref" in this.timer) {
      (this.timer as unknown as { unref: () => void }).unref();
    }
    return true;
  }

  /** Stop the daemon — clears the interval + releases the lockfile. Idempotent. */
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.lockfileOwned) {
      void releaseLockfile(this.lockfilePath).catch(() => {});
      this.lockfileOwned = false;
    }
  }

  /**
   * Single poll pass over every watched conversation. Public for tests —
   * production lets the interval drive it. Re-entrant-safe: an overlapping
   * fire (a slow source read) early-returns.
   */
  async tickOnce(): Promise<void> {
    if (this._ticking) return;
    this._ticking = true;
    try {
      for (const [conversationId, state] of this.watched) {
        let listeners;
        try {
          listeners = await this.source.listListeners(conversationId);
        } catch (err) {
          log.warn("preview-port-watcher: source read failed for conversation", {
            conversationId,
            error: String((err as Error)?.message ?? err),
          });
          continue;
        }

        // Set of ports currently up (post-filter) for this conversation.
        const currentPorts = new Set<number>();
        for (const { port } of listeners) {
          if (this.infraPorts.has(port)) continue; // infra-port filter
          currentPorts.add(port);
        }

        // Stabilize + dedup + emit.
        for (const port of currentPorts) {
          const count = (state.seen.get(port) ?? 0) + 1;
          state.seen.set(port, count);
          if (count >= this.stabilizeTicks && !state.emitted.has(port)) {
            state.emitted.add(port);
            await this.emit({ userId: state.userId, conversationId, port });
          }
        }

        // Re-arm ports that have fully disappeared so a restart on the
        // same port can re-notify; drop their stabilization counters.
        for (const port of [...state.seen.keys()]) {
          if (!currentPorts.has(port)) {
            state.seen.delete(port);
            state.emitted.delete(port);
          }
        }
      }
    } finally {
      this._ticking = false;
    }
  }

  private async emit(event: PreviewDetectedEvent): Promise<void> {
    log.info("preview:detected", {
      conversationId: event.conversationId,
      port: event.port,
    });
    try {
      await this.onDetected(event);
    } catch (err) {
      log.warn("preview-port-watcher: onDetected handler threw", {
        conversationId: event.conversationId,
        port: event.port,
        error: String((err as Error)?.message ?? err),
      });
    }
  }
}

// ── PID lockfile helpers ──────────────────────────────────────────────
//
// Inlined copy of the same primitives in embed-worker.ts /
// host-maintenance-daemon.ts / schedule-daemon.ts. The orchestrator
// brief for those daemons ruled out a shared extraction until the
// pattern stabilizes; this is the fourth caller, so the extraction is
// now worth a follow-up — tracked, not done here to keep Phase 2 scoped.

async function ensureDir(path: string): Promise<void> {
  const fs = await import("node:fs/promises");
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
  if (dir && dir !== ".") await fs.mkdir(dir, { recursive: true });
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    return code === "EPERM";
  }
}

async function acquireLockfile(path: string): Promise<boolean> {
  await ensureDir(path);
  const file = Bun.file(path);
  if (await file.exists()) {
    const text = (await file.text()).trim();
    const pid = parseInt(text, 10);
    if (Number.isFinite(pid) && isProcessAlive(pid)) {
      return false;
    }
  }
  await Bun.write(path, String(process.pid));
  return true;
}

async function releaseLockfile(path: string): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    await fs.unlink(path);
  } catch {
    // Already gone — fine.
  }
}

/**
 * Test-only export: lets tests drive the lockfile primitives + env/default
 * resolution directly. Mirrors `_embedWorkerInternals`.
 */
export const _previewPortWatcherInternals = {
  acquireLockfile,
  releaseLockfile,
  isProcessAlive,
  isDisabledByKillSwitch,
  getPollIntervalMs,
  DEFAULT_POLL_MS,
  MIN_POLL_MS,
  DEFAULT_STABILIZE_TICKS,
  MIN_STABILIZE_TICKS,
  DEFAULT_LOCKFILE_PATH,
  DEFAULT_INFRA_PORTS,
};
