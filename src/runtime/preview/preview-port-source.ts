/**
 * Pluggable port-enumeration source for the preview port watcher
 * (Secure User-Site Preview / Port Exposure, Phase 2 — see
 * tasks/preview-port-exposure.md §3.2).
 *
 * The watcher is decoupled from HOW listening sockets are discovered so
 * the whole detection framework is unit/integration testable with an
 * injected source. This mirrors how Phase 1 built the netns scaffolding
 * (alloc/reap + capability detection) without the live veth pair: the
 * interface + wiring are complete and tested; the live syscall read is
 * the Phase 3 deliverable.
 *
 * Two concrete sources ship here:
 *
 *   1. `NetnsPortSource` — the real, capability-gated source. When
 *      `previewCapabilities().dynamic` is TRUE it would enter each
 *      conversation's netns and parse `/proc/net/tcp{,6}` for LISTEN
 *      sockets. On every host that fails-closed for dynamic previews
 *      (the current env — D2), it yields NOTHING (no silent capability;
 *      the watcher logs the no-op). The actual `/proc/net/tcp`-in-netns
 *      read is explicitly Phase 3 and is marked with `PHASE3_STUB`.
 *
 *   2. `StaticPortSource` — a deterministic in-memory source used by
 *      tests (and conceivably a future manual-registration path). It
 *      returns whatever listeners were programmed for a conversation.
 *
 * D2 (LOCKED): dynamic previews fail closed on hosts without netns /
 * CAP_NET_ADMIN. The capability gate lives in `NetnsPortSource` so the
 * watcher daemon stays source-agnostic.
 */

import { logger } from "../../logger";
import { previewCapabilities } from "./preview-netns";

const log = logger.child("preview.port-source");

/** A single listening socket discovered inside a conversation's netns. */
export interface PreviewListener {
  /** The TCP port the dev server is LISTENing on. */
  port: number;
}

/**
 * The enumeration contract the watcher polls. `listListeners` returns
 * the CURRENT set of LISTEN sockets attributable to `conversationId`
 * (i.e. bound inside that conversation's netns). It must be cheap +
 * synchronous-or-async and MUST NOT throw for an unknown conversation
 * (return an empty array). Attribution is by construction — the source
 * only ever sees sockets in the conversation's own namespace.
 */
export interface PreviewPortSource {
  listListeners(conversationId: string): PreviewListener[] | Promise<PreviewListener[]>;
}

/**
 * The real, capability-gated enumeration source.
 *
 * When `previewCapabilities().dynamic` is false (the current host, and
 * every host without netns + CAP_NET_ADMIN — D2 fail-closed) this yields
 * NOTHING. The watcher treats an always-empty source as a logged no-op:
 * detection is simply disabled, exactly like Phase 1 disabled dynamic
 * alloc. No cross-user attribution ever leans on a degraded fallback.
 *
 * When dynamic IS available (Phase 3 deployment posture), `readNetnsListeners`
 * enters the conversation's netns and parses `/proc/net/tcp{,6}` for
 * `st == 0x0A` (TCP_LISTEN) rows. That live syscall read is the Phase 3
 * deliverable; here it is a clearly-marked stub so the interface + the
 * capability gate are complete and fully tested today.
 */
export class NetnsPortSource implements PreviewPortSource {
  /** Logged-once guard so the disabled-source no-op doesn't spam. */
  private loggedDisabled = false;

  constructor(
    /** Injected for tests: override the capability probe. Defaults to the
     *  real `previewCapabilities()`. */
    private readonly capabilities: () => { dynamic: boolean; reason: string | null } = previewCapabilities,
    /** Injected for tests: override the live netns read. Defaults to the
     *  PHASE3_STUB (always empty). Production wires the real reader in
     *  Phase 3 — until then dynamic is fail-closed-disabled anyway, so the
     *  stub is never reached on a capability-available host that lacks it. */
    private readonly readNetnsListeners: (conversationId: string) => PreviewListener[] = NetnsPortSource.phase3StubReader,
  ) {}

  listListeners(conversationId: string): PreviewListener[] {
    const caps = this.capabilities();
    if (!caps.dynamic) {
      if (!this.loggedDisabled) {
        this.loggedDisabled = true;
        // No silent capability degradation (project policy): announce
        // that auto-detection is off because dynamic previews are
        // fail-closed on this host.
        log.info("preview port detection disabled — dynamic previews unavailable (fail-closed)", {
          reason: caps.reason ?? "unknown",
        });
      }
      return [];
    }
    return this.readNetnsListeners(conversationId);
  }

  /**
   * PHASE3_STUB — the live `/proc/net/tcp{,6}`-in-netns read.
   *
   * Phase 3 will: resolve the conversation's netns (getPreviewNetns),
   * `nsenter`/`setns` into it, read `/proc/net/tcp` + `/proc/net/tcp6`,
   * keep rows where the connection state column equals `0A` (TCP_LISTEN),
   * decode the local-address port, and return the de-duplicated port set.
   * Inside an isolated netns even `0.0.0.0` binds are safe to surface —
   * they're unreachable except via the proxy.
   *
   * Until that posture change ships, dynamic is fail-closed-disabled (D2)
   * so `listListeners` never calls this on a real host. Returning [] keeps
   * the type honest and the framework testable.
   */
  static phase3StubReader(_conversationId: string): PreviewListener[] {
    return [];
  }
}

/**
 * Deterministic in-memory source for tests + any future manual path.
 * `set(conversationId, ports)` programs the listeners a subsequent
 * `listListeners` returns; `clear()` resets everything.
 */
export class StaticPortSource implements PreviewPortSource {
  private readonly map = new Map<string, PreviewListener[]>();

  set(conversationId: string, ports: number[]): void {
    this.map.set(conversationId, ports.map((port) => ({ port })));
  }

  clear(conversationId?: string): void {
    if (conversationId === undefined) this.map.clear();
    else this.map.delete(conversationId);
  }

  listListeners(conversationId: string): PreviewListener[] {
    return this.map.get(conversationId) ?? [];
  }
}
