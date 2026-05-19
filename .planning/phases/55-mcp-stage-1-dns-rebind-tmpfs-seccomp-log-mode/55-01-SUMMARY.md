---
phase: 55-mcp-stage-1-dns-rebind-tmpfs-seccomp-log-mode
plan: 01
subsystem: security
tags: [mcp, dns-rebind, ssrf, audit, kill-switch, bun-dns]

# Dependency graph
requires:
  - phase: 07-mcp-isolation
    provides: per-MCP forward proxy with literal isInternalHost gate, MCP_HOST_BLOCKED audit action
  - phase: 54-security-backbone-hardening
    provides: audit-action-reuse-with-metadata-reason pattern (SEC-03 cap-exceeded denies on AUDIT_PERM_DENIED)
provides:
  - DNS-rebind close at MCP forward proxy CONNECT (Bun.dns.lookup + per-record isInternalHost recheck)
  - Reuse of MCP_HOST_BLOCKED audit action with metadata.reason="rebind" discriminator
  - Operator kill-switch EZCORP_MCP_STAGE1_DNS_RECHECK=0 with one-time MCP_NETNS_FALLBACK boot row
  - src/extensions/runtime/dns.ts mock-able seam (single chokepoint for future MCP-06 TOCTOU close)
  - Module-scope kill-switch boot-flag pattern at proxy scope (mirrors mcp-sandbox.ts Plan 02)
affects:
  - 55-02-tmpfs (Plan 02 — owns the second kill-switch + boot row; uses same MCP_NETNS_FALLBACK uniformly)
  - 55-03-seccomp-log (Plan 03 — owns the third kill-switch + docs/deployment.md kill-switch subsection; MUST list all three uniformly as emitting boot rows)
  - 58-mcp-stage-2 (consumes MCP_NETNS_FALLBACK signal; MCP-06 TOCTOU close lands in v1.5+)

# Tech tracking
tech-stack:
  added: [Bun.dns.lookup]
  patterns:
    - "Per-CONNECT DNS recheck against every A/AAAA record"
    - "Audit-action reuse with metadata.reason discriminator (rebind vs internal vs host vs quota:*)"
    - "Mock-able runtime seam (dns.ts mirrors internal-host.ts mocking posture)"
    - "Module-scope one-time kill-switch boot-row flag (parallel to mcp-sandbox.ts's killSwitchBootRowEmitted)"

key-files:
  created:
    - src/extensions/runtime/dns.ts
  modified:
    - src/extensions/mcp-proxy.ts
    - src/extensions/runtime/internal-host.ts
    - src/__tests__/mcp-proxy.test.ts

key-decisions:
  - "Direct insertAuditEntry call for kill-switch boot row, NOT auditBlocked extension — auditBlocked writes MCP_HOST_BLOCKED only; the boot row uses MCP_NETNS_FALLBACK so all three Stage 1 kill-switches surface uniformly in /audit."
  - "MOCK_INTERNAL_HOST_RESULT boolean refactored to MOCK_INTERNAL_HOST_PREDICATE function so rebind cases can return false for hostname and true for resolved IP — single-boolean was too coarse for case 1/2 of the new describe block."
  - "Test infra adds MOCK_DNS_CALL_COUNT counter so the literal-IP-pre-empts-recheck case can assert the lookup was NEVER consulted (not just check audit row absence)."
  - "Audit row written through insertAuditEntry with config.extensionId + config.userId (NOT 'system' sentinel) — the proxy has per-extension config and using those is more truthful than the placeholder. Plan suggested 'system' but config-threaded values are richer for /audit filtering."

patterns-established:
  - "DNS recheck pattern: literal-host gate, then DNS recheck loop (kill-switch-gated), then PDP. Per-record isInternalHost on the resolved set. Failure → 502 fail-closed + audit row, NEVER pass through to authorize."
  - "Kill-switch boot-row uniformity: every Stage 1 kill-switch emits a one-time MCP_NETNS_FALLBACK row on first activation after process boot with reason='kill-switch: <feature> disabled'. Plans 02 and 03 inherit this."

requirements-completed: [MCP-01]

# Metrics
duration: 4min
completed: 2026-05-11
---

# Phase 55 Plan 01: MCP-01 DNS-Rebind Close Summary

**Per-CONNECT Bun.dns.lookup with A/AAAA record recheck against isInternalHost; rebind→403, NXDOMAIN→502 fail-closed, all under EZCORP_MCP_STAGE1_DNS_RECHECK=0 kill-switch with one-time MCP_NETNS_FALLBACK boot row.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-11T13:55:34Z
- **Completed:** 2026-05-11T13:59:19Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- Closed MCP-01: an attacker-controlled DNS server can no longer map a legitimate-looking hostname to a private IP between manifest install and CONNECT; every CONNECT now resolves the hostname and walks every returned A/AAAA record through isInternalHost. Internal IP → 403 + auditBlocked("rebind", hostname).
- DNS lookup failure (NXDOMAIN, ServFail, network error) fails CLOSED with 502 Bad Gateway + rebind audit row. PDP is NEVER consulted on DNS failure — verified by Test 4 (engine.calls.length === 0 after NXDOMAIN).
- Operator kill-switch EZCORP_MCP_STAGE1_DNS_RECHECK=0 wired with module-scope one-time boot-row flag. First CONNECT after kill-switch activation emits exactly one MCP_NETNS_FALLBACK audit row with reason="kill-switch: dns-recheck disabled" — verified by Test 7 (auditCalls.length === 1, engine.calls.length === 2 across two CONNECTs).
- Reuse of MCP_HOST_BLOCKED audit action with metadata.reason="rebind" — taxonomy stable, SIEM filters on metadata.reason (Phase 54 SEC-03 precedent).
- src/extensions/runtime/dns.ts mock-able seam created — single chokepoint for the future MCP-06 TOCTOU close (v1.5+).
- internal-host.ts comment lines 30-31 refreshed: stale "Phase 7 adds the kernel-level netns gate" reference replaced with MCP-01 / MCP-06 reality.

## Task Commits

1. **Task 1: Wave 0 stubs — dns.ts seam + RED test describe block** — `d7a1582` (test)
2. **Task 2: GREEN — DNS recheck loop + kill-switch boot row in handleConnect()** — `443017a` (feat)

## Files Created/Modified

- `src/extensions/runtime/dns.ts` (NEW) — Thin Bun.dns.lookup wrapper; pure side-effect-free seam mirroring internal-host.ts mocking posture. Re-exports DnsLookupRecord type.
- `src/extensions/mcp-proxy.ts` (MODIFIED) — Added dnsLookup import, module-scope dnsRecheckKillSwitchBootRowEmitted flag, recheck loop in handleConnect() between literal-host gate and PDP, emitDnsRecheckKillSwitchBootRow() helper, and _resetDnsRecheckKillSwitchBootFlagForTests() test-only export.
- `src/extensions/runtime/internal-host.ts` (MODIFIED) — Comment lines 30-31 refreshed: "Phase 7 netns gate" → "Phase 55 proxy DNS recheck + MCP-06 deferred TOCTOU close".
- `src/__tests__/mcp-proxy.test.ts` (MODIFIED) — Migrated MOCK_INTERNAL_HOST_RESULT boolean → MOCK_INTERNAL_HOST_PREDICATE function; added DNS mock seam (MOCK_DNS_RESULT/MOCK_DNS_THROWS/MOCK_DNS_CALL_COUNT); appended "DNS rebind recheck" describe block with 7 GREEN test cases.

## Decisions Made

- **Kill-switch boot row uses `insertAuditEntry` directly, NOT `auditBlocked` extension.** `auditBlocked` is hard-wired to MCP_HOST_BLOCKED; the kill-switch boot row needs MCP_NETNS_FALLBACK so all three Stage 1 kill-switches (tmpfs, seccomp, DNS recheck) surface uniformly in /audit. New `emitDnsRecheckKillSwitchBootRow(config)` helper added next to `auditBlocked` to keep both audit-writers visually paired.
- **Boot-row uses `config.userId` + `config.extensionId`**, not the `"system"` sentinel suggested in the plan. The proxy already has per-extension config threaded through; using real values gives operators richer /audit filtering. Plan's "system" suggestion was for the case where no ctx exists — but `config` is available throughout `handleConnect()`.
- **MOCK_INTERNAL_HOST_RESULT boolean → MOCK_INTERNAL_HOST_PREDICATE function.** The rebind cases need the mock to return `false` for the hostname (literal gate stays open) AND `true` for the resolved IP (recheck catches it). A flat boolean can't express that; the predicate refactor is mechanical and updates 2 existing test sites.
- **MOCK_DNS_CALL_COUNT counter added** so Test 5 ("literal pre-empts recheck") asserts the lookup was NEVER consulted, not just that no audit row was written — a stronger negative-assertion that catches future refactors that move the literal check after the recheck.

## Deviations from Plan

None - plan executed exactly as written.

(The four entries under "Decisions Made" are within-scope clarifications the plan delegated to executor discretion via its "Pick whichever is cleaner; record the choice in SUMMARY.md" note on the kill-switch boot row helper shape, and the predicate-refactor was explicitly anticipated by the plan in Task 1 step 2.)

## Issues Encountered

- **Pre-existing uncommitted changes in main.** README.md, compose.prod.yml, docker-compose.yml, web/e2e/extensions.spec.ts, web/src/routes/(app)/extensions/+page.svelte, .planning/STATE.md, .planning/ROADMAP.md, AND src/__tests__/mcp-netns-fallback.test.ts + src/__tests__/mcp-sandbox.test.ts + src/extensions/mcp-netns.ts were all dirty in the working tree at plan start. Per <plan_context>, staged ONLY the four files I touched (dns.ts, mcp-proxy.ts, internal-host.ts, mcp-proxy.test.ts) per atomic commit. Used `git add <file>` exclusively — never `git add -A` or `git add .`.
- **Pre-existing mcp-netns-fallback.test.ts uncommitted change** references `_resetBwrapProbeCacheForTests` / `_setBwrapProbeOverridesForTests` / `probeBwrapAvailability` — those belong to Plan 02 (tmpfs/bwrap) and stayed unstaged by design.

## User Setup Required

None - no external service configuration required. The kill-switch env var `EZCORP_MCP_STAGE1_DNS_RECHECK=0` is operator-facing but documented in Plan 03 alongside the other two Stage 1 kill-switches (per the plan's explicit "docs deferred to Plan 03" directive).

## Next Phase Readiness

- **Plan 02 (tmpfs) ready to execute.** Wave 1 / Wave 2 separation per the phase DAG is clean — no shared files between Plan 01's surface area (mcp-proxy.ts, runtime/dns.ts, runtime/internal-host.ts) and Plan 02's expected surface (mcp-netns.ts, mcp-launcher.sh, Dockerfile).
- **Plan 03 (seccomp + docs) ready to execute.** Plan 03 MUST list all three Stage 1 kill-switches uniformly in docs/deployment.md as emitting boot rows (no Plan 01 exception — the implementation here emits the boot row).
- **MCP-06 (TOCTOU close) deferred to v1.5+** as documented. The dns.ts wrapper is the future single chokepoint for `Bun.connect({hostname: resolvedIp, servername: hostname})` SNI pinning.

## Self-Check: PASSED

Verified all claimed artifacts exist:
- src/extensions/runtime/dns.ts: FOUND (47 lines, exports `lookup` + `DnsLookupRecord` type)
- src/extensions/mcp-proxy.ts: dnsLookup import (line 57), module flag (line 72), recheck loop (lines 326-373), helper (lines 622-660), reset export (lines 666-670) — all FOUND
- src/extensions/runtime/internal-host.ts: "MCP-06" reference (line 33) FOUND
- src/__tests__/mcp-proxy.test.ts: `describe("DNS rebind recheck"` FOUND with 7 test cases
- Commit d7a1582: FOUND (test scaffolding)
- Commit 443017a: FOUND (feat impl)
- Test run: 29 pass / 0 fail across full mcp-proxy.test.ts; 7 pass / 0 fail when filtered to "DNS rebind recheck"

## Post-merge fix (2026-05-11)

**Regression:** Plan 55-02's worker bisect surfaced one collateral test
failure in `src/__tests__/mcp-netns-integration.test.ts` — the
"HTTPS_PROXY round-trip: namespace curl → proxy → audit (M2 fix-pass)"
case went PASS → FAIL at this plan's GREEN commit `443017a`.

**Root cause:** The integration test drives a CONNECT to
`api.foo.test:443`. `api.foo.test` is an RFC 6761 reserved TLD that
does NOT resolve, so the new DNS-rebind recheck loop (per Plan 55-01
must_have truth #3) fail-closes with 502 Bad Gateway BEFORE
`engine.authorize` is consulted. The test's
`expect(engine.calls.length).toBeGreaterThanOrEqual(1)` therefore
failed under the new locked semantics — by design, not by bug. The
source order (literal-host gate → DNS recheck → PDP authorize) and
fail-closed-on-NXDOMAIN behavior are exactly what Plan 55-01
specified and what `mcp-proxy.test.ts` Test 4 verifies.

**Fix:** Test-only. Added a `mock.module("../extensions/runtime/dns",
...)` block at the top of the integration test that returns a
deterministic public-IP record (`203.0.113.1` — TEST-NET-3 / RFC 5737,
unroutable but classified as public by `isInternalHost`). The recheck
passes the public-IP gate, the PDP is consulted, and the deny-all
engine produces the expected 403 + `ext:mcp:host-blocked` audit row
— restoring the original test intent without weakening the rebind
contract.

**Files modified:** `src/__tests__/mcp-netns-integration.test.ts` only.
**No source change** — Plan 55-01's `mcp-proxy.ts` recheck is correct
per its locked design.

**Verification:**
- `bun test src/__tests__/mcp-netns-integration.test.ts -t "HTTPS_PROXY round-trip"`
  → 1 pass / 0 fail.
- `bun test src/__tests__/mcp-netns-integration.test.ts` → 5 pass / 3
  skip (bwrap cases skip on NixOS) / 0 fail.
- `bun test src/__tests__/mcp-proxy.test.ts` → 29 pass / 0 fail (no
  regression in 55-01 in-scope suite).

**Commit:** `test(55-01): refresh HTTPS_PROXY round-trip for DNS-recheck semantics` (`ae87384`)

Deferred entry in `deferred-items.md` removed by the same fix-pass.

---
*Phase: 55-mcp-stage-1-dns-rebind-tmpfs-seccomp-log-mode*
*Completed: 2026-05-11 (post-merge fix: 2026-05-11)*
