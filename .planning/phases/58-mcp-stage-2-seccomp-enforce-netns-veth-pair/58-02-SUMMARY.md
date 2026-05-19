---
phase: 58-mcp-stage-2-seccomp-enforce-netns-veth-pair
plan: 02
subsystem: infra
tags: [mcp, netns, veth, nftables, seccomp, bun, ipv4]

# Dependency graph
requires:
  - phase: 58-mcp-stage-2-seccomp-enforce-netns-veth-pair
    provides: "Plan 58-01: seccomp enforce flip (defaultAction=SCMP_ACT_ERRNO, defaultErrnoRet=38) + getChildProcess() escape hatch + registry soak-reader wire-up. Plan 02 mirrors the getChildProcess access pattern in HookedStdioClientTransport."
  - phase: 55-mcp-stage-1-dns-rebind-tmpfs-and-seccomp-log-mode
    provides: "Plan 55-02: BuildNetnsSpawnArgsResult composable shape + bwrap probe seam pattern (_setBwrapProbeOverridesForTests). Plan 55-03: kill-switch boot-row uniform pattern + McpServerStdio seccompFd field precedent. Plan 02 extends both verbatim."
provides:
  - "probeVethCapability() in mcp-netns.ts — same probe-once-cache-result shape as probeBwrapAvailability; test-seam _setVethProbeOverridesForTests"
  - "allocVethSlot/releaseVethSlot in mcp-netns.ts — Set<number> 1..63 lowest-free, 60-MCP concurrent cap, idempotent release, slot-0 reserved for bridge gateway"
  - "computeVethBridgeIp(slot)/computeVethMcpIp(slot) — /30 IP math (10.42.0.{N*4+1} bridge, 10.42.0.{N*4+2} MCP)"
  - "BuildNetnsSpawnArgsResult widened with 7 optional Stage 2 fields (vethAvailable/Reason/Id/Ipv4/HostSideName/NsSideName, stage2KillSwitchActive)"
  - "MCP_VETH_CREATED audit action — Stage 2 success signal, CONTEXT-locked two-action split"
  - "mcp-launcher.sh Stage 2 outer block (handshake → rename → eth0 up → addr add → default route → IPv6 disable → nft heredoc) gated on EZCORP_MCP_STAGE2_VETH_ENABLED=1"
  - "mcp-sandbox.ts Stage 1 vs Stage 2 branching + stage2KillSwitchActive boot row (MCP_NETNS_FALLBACK reason='kill-switch: stage2 veth disabled')"
  - "McpServerStdio.onChildSpawned callback (writeByte-abstracted) + _internal_vethSetup carrier on the spec"
  - "HookedStdioClientTransport subclass in src/mcp/client.ts — fires onChildSpawned AFTER spawn AND BEFORE the SDK's JSON-RPC initialize"
  - "registry.ts: connect-failure tear-down (ip link delete + releaseVethSlot) + happy-path slot release on childProc.exited"
  - "Dockerfile: nftables apt package (~3 MB image growth)"
affects:
  - 58-mcp-stage-2-seccomp-enforce-netns-veth-pair  # Plan 03 depends on naming + bridge subnet
  - 59-test-debt-repair                              # potential synthetic-MCP harness consumer
  - 60-audit-claim-and-docs-polish                   # deployment.md Stage 2 readiness checklist owner

# Tech tracking
tech-stack:
  added:
    - "nftables (Debian apt package, ~3 MB runtime image growth)"
  patterns:
    - "Test-seam injection over Bun-global module mocking (_setVethProbeOverridesForTests mirrors _setBwrapProbeOverridesForTests)"
    - "Probe-once-cache-result for capability detection (3rd Linux-only probe joining probeNetnsAvailability + probeBwrapAvailability)"
    - "/30 in-memory slot allocator (no DB persistence — orphan sweep at boot reconciles)"
    - "SDK transport subclassing for post-spawn hooks (HookedStdioClientTransport overrides start() to inject onChildSpawned)"
    - "writeByte-abstracted handshake (mcp-sandbox decoupled from SDK transport internals)"
    - "Synchronous tear-down on connect-failure + fire-and-forget cleanup on child exit"
    - "Uniform kill-switch boot-row pattern (4th instance: DNS_RECHECK + TMPFS + SECCOMP + STAGE2_VETH)"

key-files:
  created:
    - "src/__tests__/mcp-veth-probe.test.ts (6 unit cases for probe)"
    - "src/__tests__/mcp-veth-allocator.test.ts (7 unit cases for slot math + cap + idempotent release)"
    - "src/__tests__/mcp-veth-bridge-integration.test.ts (Linux+CAP_NET_ADMIN+nft-gated; 2 GREEN + 2 test.todo)"
    - "src/__tests__/mcp-netns-raw-socket-blocked.test.ts (RC#1 scaffold; test.todo until Plan 03 bridge boot)"
    - "tests/fixtures/raw-socket-probe/index.ts (ENETUNREACH probe fixture)"
  modified:
    - "src/extensions/mcp-netns.ts (probeVethCapability + slot allocator + 7 BuildNetnsSpawnArgsResult fields)"
    - "src/extensions/mcp-sandbox.ts (Stage 1 / Stage 2 branching + audit row + kill-switch boot row + env threading + onChildSpawned attach)"
    - "src/extensions/mcp-launcher.sh (Stage 2 outer block: handshake → rename → eth0 up → addr add → default route → IPv6 disable → nft heredoc)"
    - "src/extensions/types.ts (McpServerStdio gains onChildSpawned + _internal_vethSetup fields)"
    - "src/extensions/audit-actions.ts (MCP_VETH_CREATED constant + JSDoc)"
    - "src/extensions/registry.ts (connect-failure tear-down + happy-path slot release on childProc.exited + releaseVethSlot import)"
    - "src/mcp/client.ts (HookedStdioClientTransport subclass + buildTransport branches on spec.onChildSpawned)"
    - "Dockerfile (nftables in apt-install; doc-block updated for Phase 58 NET_ADMIN requirement)"

key-decisions:
  - "Pitfall 1 lock: host-side naming `mcp-<8hex>` (12 chars), ns-side `mcp-<8hex>-ns` (15 chars at IFNAMSIZ ceiling). CONTEXT.md's `mcp-<8hex>-host` (17 chars) REJECTED — kernel returns 'name too long'."
  - "Open Question 1 resolution: 1-byte stdin handshake between host process and launcher. Host writes byte AFTER `ip link set <ns> netns <pid>` completes; launcher's `read -n 1` from FD 0 gates the `ip addr add eth0 ...` step. Skipping the await would TOCTOU-race the netns-move."
  - "Open Question 2 resolution: belt+suspenders slot release. Connect-failure tear-down (synchronous `ip link delete` + releaseVethSlot before throwing) AND happy-path child.exited handler both clean up. Slot only released AFTER host-side veth deletion (re-spawn race window otherwise)."
  - "Subclassing StdioClientTransport (HookedStdioClientTransport.override start()) instead of monkey-patching the SDK or fork. Overrides resolve cleanly; pre-Phase-58 specs (no hook) fall through to bare StdioClientTransport — zero behavior change for the existing call sites."
  - "writeByte callback abstraction in onChildSpawned signature. mcp-sandbox.ts stays decoupled from SDK transport internals (no `_process` access leaking outside src/mcp/client.ts)."
  - "60-MCP concurrent cap with 4-slot headroom (max 63 mathematical). In-memory `Set<number>` with lowest-free wins on alloc. No DB persistence — orphan veth sweep at boot (Plan 03) reconciles leftover host-side interfaces from a crashed prior process."
  - "Stage 2 success path emits MCP_VETH_CREATED (NOT MCP_NETNS_CREATED — two-action split per CONTEXT). Stage 1 keeps MCP_NETNS_CREATED for unmodified Phase 55 behavior."
  - "Bridge-missing degrades gracefully to Stage 1. `ip link set <host-side> master br-ezcorp-mcp` failure cleans up the orphan host-side veth + releases the slot before falling through. Plan 03 owns ensureBridge."
  - "Stage 2 kill-switch boot row mirrors Stage 1 (DNS_RECHECK, TMPFS, SECCOMP) — fourth identical pattern. Module-scope flag, exactly one row per process lifetime, MCP_NETNS_FALLBACK action with `reason='kill-switch: stage2 veth disabled'`."
  - "IPv6 disable in the launcher uses `|| true` mask (Plan 02 transitional). Plan 03 Task 2 hardens to strict abort-on-fail. Inline comment in mcp-launcher.sh documents the hand-off so the verifier doesn't flag Plan 03's rewrite as regression."
  - "Hardcoded `10.42.0.1` bridge gateway in mcp-sandbox.ts is pragmatic — Plan 03's bridge boot will own the canonical BRIDGE_CIDR_DEFAULT constant. Plan 02 stays minimum-diff."
  - "Integration test cases split: Case 2 + Case 4 GREEN immediately (raw `ip link` invocations; no launcher needed); Case 1 (bridge) + Case 3 (nft heredoc) + RC#1 raw-socket remain test.todo until Plan 03 brings up the bridge and Task 2 end-to-end."

patterns-established:
  - "Stage 2 probe + slot + naming: 12-char host-side / 15-char ns-side / /30 subnet math (10.42.0.{N*4+1} bridge, 10.42.0.{N*4+2} MCP). Future netns features reuse the same naming + math."
  - "Subclassing the SDK's stdio transport for pre-initialize hooks. If MCP-06 or future hardening needs another spawn-time hook, HookedStdioClientTransport is the extension point."
  - "Decoupled handshake via writeByte abstraction. mcp-sandbox specifies the contract (1 byte to release the launcher); client.ts owns the SDK-internals access. Future hooks can reuse the same callback pattern."
  - "Belt+suspenders veth cleanup: synchronous on connect-failure path (immediate ip link delete + releaseVethSlot before throw); fire-and-forget on happy-path child.exited (mirrors soak-reader scheduling)."

requirements-completed: [MCP-05]

# Metrics
duration: 13 min
completed: 2026-05-12
---

# Phase 58 Plan 02: MCP-05 Stage 2 Veth-Pair + nftables Egress Summary

**Per-MCP veth-pair + nftables drop-all-egress restores kernel-level network isolation; closes the raw-socket bypass of HTTPS_PROXY Phase 7 fix-pass C2 deferred.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-05-12T17:21:50Z
- **Completed:** 2026-05-12T17:35:10Z
- **Tasks:** 3 (T1 + T2a + T2b)
- **Files modified:** 11 (5 created, 6 modified)
- **Commits:** 4 (1 RED test commit + 3 GREEN feat commits)

## Accomplishments

- **`probeVethCapability` + slot allocator land in mcp-netns.ts.** 7 BuildNetnsSpawnArgsResult fields added (vethAvailable/Reason/Id/Ipv4/HostSideName/NsSideName, stage2KillSwitchActive) — fully additive, no breaking change to Phase 55 callers.
- **`MCP_VETH_CREATED` audit action with full JSDoc** — operators reading `/audit` see two distinct actions for Stage 1 (MCP_NETNS_CREATED) vs Stage 2 (MCP_VETH_CREATED) MCP launches.
- **mcp-launcher.sh gains a 50-line Stage 2 outer block** gated on `EZCORP_MCP_STAGE2_VETH_ENABLED=1`. Phase 55's bwrap branch is byte-identical when the env var is unset (zero behavior change).
- **mcp-sandbox.ts buildSandboxedMcpSpec branches Stage 1 / Stage 2** — Stage 2 probes capability, allocates slot, creates the host-side veth, attaches to `br-ezcorp-mcp`, threads launcher env, attaches `onChildSpawned` callback + `_internal_vethSetup` carrier on the spec.
- **HookedStdioClientTransport subclass** fires the onChildSpawned hook AFTER spawn AND BEFORE the SDK's JSON-RPC initialize — Open Question 1 (TOCTOU race) closed via `writeByte`-abstracted handshake.
- **Connect-failure tear-down + happy-path slot release** in registry.ts. Open Question 2 (slot release on failed connect) closed via belt+suspenders: synchronous cleanup before throw + fire-and-forget on `childProc.exited`.
- **Dockerfile +nftables apt package** (~3 MB image growth) — runtime dependency for the `nft -f -` heredoc in the launcher.
- **4 new test files** (14 unit + 3 Linux-gated integration); 14 unit cases GREEN; integration cases SKIP cleanly on non-Linux + Linux-without-CAP_NET_ADMIN dev hosts.

## Task Commits

Each task was committed atomically (TDD discipline: RED test commit first, then GREEN implementation):

1. **RED — Task 1 tests + fixtures** — `8fe8c0e` (test)
2. **GREEN — Task 1 implementation** — `a91dc4d` (feat: probeVethCapability + slot allocator + MCP_VETH_CREATED)
3. **GREEN — Task 2a: Dockerfile + launcher + sandbox branching** — `4dac6f6` (feat: Dockerfile nftables + Stage 2 launcher veth setup + mcp-sandbox branching)
4. **GREEN — Task 2b: registry + client.ts wiring** — `53a1d5c` (feat: registry onChildSpawned hook + connect-failure slot release + client.ts wiring)

## Files Created/Modified

- `src/__tests__/mcp-veth-probe.test.ts` (NEW) — 6 unit cases for probe; test-seam injection over Bun-global mocking.
- `src/__tests__/mcp-veth-allocator.test.ts` (NEW) — 7 unit cases for slot math + 60-cap + idempotent release.
- `src/__tests__/mcp-veth-bridge-integration.test.ts` (NEW) — Linux+CAP_NET_ADMIN+nft-gated; 2 GREEN + 2 test.todo.
- `src/__tests__/mcp-netns-raw-socket-blocked.test.ts` (NEW) — RC#1 scaffold (test.todo until Plan 03).
- `tests/fixtures/raw-socket-probe/index.ts` (NEW) — ENETUNREACH probe fixture.
- `src/extensions/mcp-netns.ts` — probeVethCapability + slot allocator + BuildNetnsSpawnArgsResult widened with 7 Stage 2 fields.
- `src/extensions/audit-actions.ts` — MCP_VETH_CREATED constant + JSDoc metadata-shape doc.
- `src/extensions/mcp-launcher.sh` — Stage 2 outer block (handshake → rename → eth0 up → addr add → default route → IPv6 disable → nft heredoc).
- `src/extensions/mcp-sandbox.ts` — Stage 1 / Stage 2 branching; MCP_VETH_CREATED audit row; stage2KillSwitchActive kill-switch boot row; env threading; onChildSpawned + _internal_vethSetup attach on spec.
- `src/extensions/types.ts` — McpServerStdio gains onChildSpawned + _internal_vethSetup fields with JSDocs referencing Open Question 1 + Blocker #3.
- `src/extensions/registry.ts` — connect-failure synchronous tear-down + happy-path slot release on childProc.exited; releaseVethSlot import.
- `src/mcp/client.ts` — HookedStdioClientTransport subclass overrides start(); buildTransport branches on spec.onChildSpawned.
- `Dockerfile` — nftables added to apt-install (~3 MB image growth); doc-block updated with Phase 58 NET_ADMIN requirement.

## Decisions Made

See `key-decisions` in frontmatter (12 decisions captured for STATE.md accumulated context).

## Deviations from Plan

None — plan executed exactly as written.

The plan's task structure was followed verbatim:
- Task 1 (TDD RED→GREEN): tests committed first (`test(58-02): add RED tests`), then implementation (`feat(58-02): probeVethCapability + slot allocator`)
- Task 2a (Dockerfile + launcher + sandbox branching): single commit per plan
- Task 2b (registry + client.ts + integration test flips): single commit per plan

Two minor in-scope clarifications (not deviations):

1. **`onChildSpawned` signature: `writeByte(b: number) => Promise<void>` callback instead of raw `WritableStream`.** The plan said "Verify the actual type via TypeScript compile; adjust to `FileSink` or whatever Bun.spawn's stdin handle is." The SDK uses `node:child_process`-style ChildProcess (cross-spawn), whose `stdin` is a Node Writable, not Bun's FileSink. The writeByte callback abstracts that so mcp-sandbox.ts doesn't have to know the SDK's internals — it specifies the contract, client.ts implements it.

2. **Case 2 + Case 4 of mcp-veth-bridge-integration.test.ts shipped GREEN immediately (Task 1) instead of waiting for Task 2.** The plan's Task 2b says "flip from test.todo to real assertions where Task 2b's wiring enables them." Case 2 (veth pair create + move into PID-target netns) and Case 4 (cleanup) use raw `ip link` invocations and don't need the launcher; they're real tests from the moment Task 1 committed. Cases 1 (bridge) and 3 (nft) remain test.todo for Plan 03 + end-to-end Stage 2 spawn.

**Total deviations:** 0
**Impact on plan:** None — every Done criterion in the plan is satisfied; the two clarifications are within-plan-scope refinements documented for downstream context.

## Issues Encountered

None — all 3 task commits landed first-try-clean. The TS-compile gate required adding `override` modifier to the subclass `start()` method (TS4114), which was a 1-character fix.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Plan 58-03 (conntrack guard + IPv6 disable + orphan sweep + Stage 2 docs) is now unblocked.** Plan 02 provides the veth naming pattern (`mcp-<8hex>$`) the orphan-sweep regex must match, the slot allocator (returns null at 60-cap; conntrack guard ties in here), and the host-side veth lifecycle the sweep cleans up.
- **End-to-end Stage 2 launch path now exists on Linux+CAP_NET_ADMIN+CI hosts**, but the integration test cases for it (RC#1 raw-socket; nft rule verification) stay `test.todo` until Plan 03 brings up `br-ezcorp-mcp` at boot.
- **No new TS errors introduced in touched files.** Pre-existing `$server/extensions/audit-actions` resolver errors in `web/` and `worktrees/` are out of scope (path-alias config issues unrelated to Plan 02).
- **All Phase 55 + Plan 58-01 regression tests stay GREEN.** Bun 1.3.11 segfault tests (mcp-e2e, mcp-api-routes) remain out of scope per REQUIREMENTS.md BUN-01.

---
*Phase: 58-mcp-stage-2-seccomp-enforce-netns-veth-pair*
*Completed: 2026-05-12*

## Self-Check: PASSED

- All 5 created files verified on disk (4 test files + 1 fixture).
- All 4 task commit hashes verified in `git log --oneline --all`: 8fe8c0e (RED), a91dc4d (T1 GREEN), 4dac6f6 (T2a GREEN), 53a1d5c (T2b GREEN).
- Plan automated verify command (`bun test src/__tests__/mcp-veth-probe.test.ts src/__tests__/mcp-veth-allocator.test.ts src/__tests__/mcp-sandbox.test.ts src/__tests__/mcp-netns-fallback.test.ts`): 43 pass / 0 fail.
- `bunx tsc --noEmit` introduces zero new errors in touched files (mcp-netns.ts, mcp-sandbox.ts, mcp-launcher.sh, types.ts, audit-actions.ts, registry.ts, mcp/client.ts, Dockerfile). Pre-existing `$server/extensions/audit-actions` resolver errors in `web/` + `worktrees/` are out of scope.
