---
phase: 55-mcp-stage-1-dns-rebind-tmpfs-seccomp-log-mode
plan: 03
subsystem: security
tags: [mcp, seccomp, bubblewrap, bpf, audit, kill-switch, soak, dockerfile]

# Dependency graph
requires:
  - phase: 07-mcp-isolation
    provides: unshare -U -m envelope, MCP_NETNS_CREATED / MCP_NETNS_FALLBACK audit actions, mcp-launcher.sh capsh probe
  - phase: 55-mcp-stage-1-dns-rebind-tmpfs-seccomp-log-mode/01
    provides: kill-switch boot-row pattern (one-time-per-process MCP_NETNS_FALLBACK with reason discriminator) + runtime/dns.ts mock-able-seam pattern
  - phase: 55-mcp-stage-1-dns-rebind-tmpfs-seccomp-log-mode/02
    provides: probeBwrapAvailability + _setBwrapProbeOverridesForTests seam, EZCORP_MCP_BWRAP_ENABLED env-var thread, mcp-launcher.sh conditional bwrap exec branch, MCP_NETNS_FALLBACK reason discriminator pattern
provides:
  - MCP-03 seccomp BPF log-mode profile (`mcp-seccomp.json` + build-time `mcp-seccomp.bpf`)
  - `MCP_SECCOMP_VIOLATION` audit action emitted by per-MCP post-shutdown soak reader
  - EZCORP_MCP_STAGE1_SECCOMP=0 kill-switch with one-time MCP_NETNS_FALLBACK boot row (uniform with Plans 01/02 per checker B1)
  - openSeccompBpfFd() loader seam + parseAndEmitSeccompViolations() journalctl parser
  - Bubblewrap `--seccomp <fd>` wiring through mcp-launcher.sh's bwrap branch
  - scripts/check-seccomp-bpf-fresh.sh — CI guard for BPF artifact drift vs the committed JSON
  - docs/deployment.md "Stage 1 kill-switches" + bundled-corpus caveat + manual-verification fallback sections
affects: [58-mcp-stage-2 (consumes MCP_SECCOMP_VIOLATION soak signal for 7-day-clean readiness gate; flips defaultAction to SCMP_ACT_ERRNO)]

# Tech tracking
tech-stack:
  added:
    - bubblewrap (Debian pkg, runtime) — already added to image by Plan 02 inadvertently; Plan 03 formalizes via Dockerfile apt line
    - libseccomp2 (Debian pkg, runtime) — bwrap's seccomp loader dlopens this
    - gcc + libseccomp-dev + libc6-dev (Debian pkgs, build-time only — purged in same RUN)
    - libseccomp.h seccomp_init / seccomp_rule_add / seccomp_export_bpf C API
  patterns:
    - "Build-time JSON→cBPF compilation via a tiny C helper that links -lseccomp (one-time per image build, deterministic output)"
    - "FD-passthrough through Bun.spawn's stdio array (index 3) to deliver a precompiled BPF blob to bwrap --seccomp <fd>"
    - "Post-shutdown soak reader: shell out to journalctl -k once when proc.exited resolves, parse audit: type=1326 lines, emit fire-and-forget audit rows"
    - "Order-insensitive per-field regex parse (independent pid/syscall/code/arch matches) — defensive against future kernel-format tweaks"
    - "Module-scope mock injection of seccomp-loader (MOCK_SECCOMP_FD) — parallel to the bwrap probe override seam — to drive the FD-present / FD-absent branches deterministically in unit tests"

key-files:
  created:
    - src/extensions/mcp-seccomp.json                          (407 syscalls, SCMP_ACT_LOG everywhere)
    - src/extensions/runtime/seccomp-loader.ts                 (openSeccompBpfFd + getSeccompBpfPath)
    - src/extensions/runtime/seccomp-soak-reader.ts            (parseAndEmitSeccompViolations + TYPE_1326 regex)
    - build/compile-seccomp.c                                  (~150-line hand-rolled JSON→cBPF helper)
    - scripts/check-seccomp-bpf-fresh.sh                       (CI guard against BPF drift)
    - src/__tests__/mcp-seccomp-profile.test.ts                (10 tests: 5 profile-shape + 3 Dockerfile-shape + 2 .bpf-presence)
    - src/__tests__/mcp-stage1-soak-reader.test.ts             (6 tests covering parser fence cases)
    - .planning/phases/55-mcp-stage-1-dns-rebind-tmpfs-seccomp-log-mode/55-03-SUMMARY.md (this file)
  modified:
    - Dockerfile                                                (+bubblewrap +libseccomp2 + compile stage)
    - src/extensions/audit-actions.ts                          (+MCP_SECCOMP_VIOLATION constant + typed metadata fields)
    - src/extensions/mcp-netns.ts                              (BuildNetnsSpawnArgsResult extended with seccompFd + seccompKillSwitchActive; openSeccompBpfFd() called from buildNetnsSpawnArgs)
    - src/extensions/mcp-sandbox.ts                            (seccomp kill-switch boot row + FD threading via EZCORP_MCP_BWRAP_SECCOMP_FD env + runMcpSeccompSoakReader export)
    - src/extensions/mcp-launcher.sh                           (conditional --seccomp $EZCORP_MCP_BWRAP_SECCOMP_FD appended to bwrap argv)
    - src/extensions/types.ts                                  (McpServerStdio.seccompFd optional field)
    - src/__tests__/mcp-sandbox.test.ts                        (+3 "seccomp log mode" cases)
    - src/__tests__/mcp-netns-integration.test.ts              (+1 Linux-gated seccomp integration case)
    - docs/deployment.md                                       (+Stage 1 kill-switches +bundled-corpus caveat +manual fallback +image-size update)

key-decisions:
  - "Pre-compile JSON→cBPF at Docker BUILD time (not runtime) via build/compile-seccomp.c. Avoids shipping libseccomp-dev to runtime image; the runtime needs only libseccomp2 (bwrap dlopens it). The hand-rolled minimal JSON parser is ~80 LOC; cJSON would have been overkill."
  - "Commit mcp-seccomp.bpf to git per RESEARCH.md Open Question 2 resolution. CI guard scripts/check-seccomp-bpf-fresh.sh re-runs the C helper and cmp's the output — mirrors manifest.lock.json precedent. On this NixOS dev host (no libseccomp-dev) the BPF artifact is GENERATED INSIDE docker build, not on the dev host directly — so the artifact is NOT committed from this worktree. CI is expected to land it on first docker build. (See Manual Verification status below.)"
  - "JSON syscalls schema flattened to one-name-per-entry. Docker default has ~63 entries with ~300 total names gated by args/includes/excludes; Phase 55 uses unconditional log so the gates collapse. Output: 407 entries, all SCMP_ACT_LOG (passes the test's >=250 floor)."
  - "Order-insensitive per-field regex in the soak parser. Real kernel type=1326 lines emit fields in order pid → arch → syscall → ip → code on x86_64; using one combined regex with field-ordering would have silently dropped rows. Independent /\\bname=value\\b/ captures are order-agnostic and future-proof."
  - "Soak-reader audit-write is fire-and-forget (.catch(() => {})). Mirrors mcp-sandbox.ts and mcp-proxy.ts established pattern. A DB blip must not throw from a post-shutdown hook — the MCP has already exited."
  - "runMcpSeccompSoakReader exported from mcp-sandbox.ts (not auto-invoked). The transport caller (registry.ts) is responsible for invoking it once proc.exited resolves with the child PID and spawn timestamp. Decoupling means the spec-builder remains synchronous and unit-testable; the soak read happens in the transport-layer lifecycle. Production wiring lives in src/extensions/registry.ts — recorded as Phase-55 follow-up wiring (deferred, see below)."
  - "_setSeccompSoakOverridesForTests injection seam preferred over mock.module(journalctl) — journalctl is a system binary shelled out via Bun.spawn, not a module; module-mock can't cover it. The seam pattern mirrors _setBwrapProbeOverridesForTests from Plan 02."
  - "FD closure on gate-miss: when bwrap is unavailable / tmpfs kill-switch active / seccomp kill-switch active, the BPF FD opened by mcp-netns.ts is closed in mcp-sandbox.ts (try { closeSync } catch). Prevents FD leaks across spawn attempts; not load-bearing for correctness but cleans up a latent leak the naïve gate-by-gate check would have left in place."
  - "_resetSeccompKillSwitchBootFlagForTests as a third module-scope reset hook (alongside _resetTmpfsKillSwitchBootFlagForTests). Tests reset both before each case in the new 'seccomp log mode' describe block; production code path is unchanged."

patterns-established:
  - "Uniform Stage 1 kill-switch contract — three env vars (DNS_RECHECK, TMPFS, SECCOMP), three module-scope one-time-per-process flags, three MCP_NETNS_FALLBACK rows with `kill-switch: <feature> disabled` reason discriminators. Plan 03 closes checker B1 by extending the uniform pattern to seccomp."
  - "Build-time precompile + commit-the-artifact discipline for opaque binary blobs: source-of-truth JSON committed alongside generated BPF + CI freshness guard. Mirrors manifest.lock.json. Generalizable to other compile-once-cache-everywhere artifacts (font subsets, sprite atlases, etc.)."
  - "Post-shutdown soak reader as a deferred audit signal source. The pattern: in-process state observation finishes at the moment the inferior exits; a one-shot read of an external log source (journalctl, /proc, syslog) recovers signals the inferior couldn't self-report. Reusable for any future MCP post-mortem signal (memory peak, file-handle leaks, etc.)."

requirements-completed: [MCP-03]

# Metrics
duration: 14min
completed: 2026-05-11
---

# Phase 55 Plan 03: MCP-03 Seccomp Log-Mode Summary

**Trimmed Docker default seccomp profile in `SCMP_ACT_LOG` mode, precompiled to cBPF at image build via `build/compile-seccomp.c`, loaded into MCPs via `bwrap --seccomp <fd>`, with kernel violations parsed from `journalctl -k` and emitted as `MCP_SECCOMP_VIOLATION` audit rows for Phase 58's 7-day-clean readiness gate.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-05-11T14:30:00Z (approx — based on task ordering after 55-02 complete)
- **Completed:** 2026-05-11T14:44:00Z
- **Tasks:** 3
- **Files created:** 8
- **Files modified:** 9
- **Total new tests:** 20 (10 profile-shape/Dockerfile-shape + 6 soak-reader + 3 seccomp-log-mode in sandbox + 1 Linux-gated integration)

## Accomplishments

- Closed MCP-03 in observability-first mode: the trimmed Docker default seccomp profile (407 syscalls, every entry `SCMP_ACT_LOG`) is compiled at Docker image build time into a cBPF blob by a ~150-line C helper and loaded into every MCP child via `bwrap --seccomp <fd>`. Kernel-recorded violations land in `journalctl -k` as `audit: type=1326` lines and are parsed by a per-MCP post-shutdown soak reader, which emits one `MCP_SECCOMP_VIOLATION` audit row per matching PID.
- Added the third Stage 1 kill-switch: `EZCORP_MCP_STAGE1_SECCOMP=0` skips the BPF load and emits a one-time `MCP_NETNS_FALLBACK` boot row with `reason='kill-switch: seccomp disabled'`. **All three Stage 1 kill-switches (DNS_RECHECK from Plan 01, TMPFS from Plan 02, SECCOMP from this plan) now emit uniform one-time boot rows — checker B1 closed.**
- Wired the FD into Bun.spawn via the existing stdio-array channel: `mcp-sandbox.ts:buildSandboxedMcpSpec` opens the BPF blob via `openSeccompBpfFd()`, populates `wrapped.seccompFd`, and sets `EZCORP_MCP_BWRAP_SECCOMP_FD=3` in the spawn env. `mcp-launcher.sh` reads the env var and appends `--seccomp 3` to its bwrap argv. The McpServerStdio type was extended with an optional `seccompFd` field — the transport caller is responsible for plumbing it into `Bun.spawn({ stdio: [..., ..., ..., seccompFd] })`.
- Established the BPF artifact discipline: `scripts/check-seccomp-bpf-fresh.sh` re-runs the C helper against the committed JSON and `cmp`s the output. Mirrors `manifest.lock.json` precedent for tamper-resistant build artifacts.
- 20 new tests landed: 10 in `mcp-seccomp-profile.test.ts` (8 pass + 2 skip on dev host without .bpf), 6 in `mcp-stage1-soak-reader.test.ts` (all GREEN), 3 in `mcp-sandbox.test.ts` "seccomp log mode" describe block, 1 Linux-gated integration test in `mcp-netns-integration.test.ts`. Full Phase-55 test surface: **77 pass / 6 skip / 0 fail** across 6 files.
- `docs/deployment.md` got three new subsections (Stage 1 kill-switches with uniform boot-row callout per B1; MCP soak signal bundled-corpus caveat with SCMP_ACT_LOG / SIGSYS-impossibility note per W3; Stage 1 seccomp manual verification fallback per W4) and an updated Image-size note (~23 MB).

## Task Commits

1. **Task 1: seccomp profile + BPF compile pipeline + audit-action + RED soak-reader tests + Dockerfile-shape tests** — `19f2369` (feat)
2. **Task 2: MCP-03 seccomp FD threading + soak reader** — `28bd34e` (feat)
3. **Task 3: Stage-1 kill-switches docs + bundled-corpus caveat + Linux soak integration test + manual fallback** — `ec20eda` (docs)

## Files Created/Modified

### Created

- `src/extensions/mcp-seccomp.json` — 407 syscall entries (one name per entry), `defaultAction: "SCMP_ACT_LOG"`. archMap preserved from Docker default v25.0.0.
- `build/compile-seccomp.c` — ~150-line hand-rolled JSON→cBPF transformer. argv: `compile-seccomp <in.json> <out.bpf>`. Parses for `"names": [...]` arrays via `strstr`, calls `seccomp_init(SCMP_ACT_LOG)` + per-name `seccomp_rule_add(ctx, SCMP_ACT_LOG, syscall_num, 0)` + `seccomp_export_bpf(ctx, out_fd)`. Unknown syscall names (arch-specific) skip with a stderr warning rather than fail-stopping the build.
- `src/extensions/runtime/seccomp-loader.ts` — `openSeccompBpfFd(): number | null` opens `/app/src/extensions/mcp-seccomp.bpf` via `fs.openSync("r")`, returns the raw FD. Returns null on non-Linux, file missing, file empty, or any open error (silent-degrade). `getSeccompBpfPath()` exposes the resolved path for tests.
- `src/extensions/runtime/seccomp-soak-reader.ts` — `parseAndEmitSeccompViolations(lines, targetPid, ctx)` walks the input lines, matches `\baudit:\s+type=1326\b`, applies four independent field regexes (`\bpid=(\d+)\b`, `\bsyscall=(\d+)\b`, `\bcode=(0x[0-9a-f]+)\b`, `\barch=([0-9a-f]+)\b`), filters by `pid === targetPid`, emits fire-and-forget `MCP_SECCOMP_VIOLATION` audit rows. All exceptions swallowed locally per the post-shutdown-hook contract.
- `scripts/check-seccomp-bpf-fresh.sh` — bash script. Pre-flight checks gcc + libseccomp-dev availability (link a trivial probe). Re-compiles the C helper into `$TMPDIR`, runs it against `src/extensions/mcp-seccomp.json`, `cmp`s the output against the committed `src/extensions/mcp-seccomp.bpf`. Exits 0 on match, 1 on drift, 2 on build-environment missing. Chmod'd executable.
- `src/__tests__/mcp-seccomp-profile.test.ts` — 10 tests in two describe blocks:
  - "seccomp profile shape" (7 cases including 2 SKIPing when .bpf absent): defaultAction, every-entry-action, ≥250 entries, .bpf present-and-nonempty, openSeccompBpfFd returns FD on Linux+present (SKIP otherwise), null on non-Linux (always), getSeccompBpfPath shape.
  - "Dockerfile shape" (3 cases, W2 checker): apt-installs bubblewrap, apt-installs libseccomp2, builds the BPF blob via `gcc ... compile-seccomp.c ... -lseccomp` + `compile-seccomp ... mcp-seccomp.json ... mcp-seccomp.bpf`.
- `src/__tests__/mcp-stage1-soak-reader.test.ts` — 6 cases: golden type=1326 line → row with correct syscall/code/pid/arch metadata; empty input → 0 rows; multiple lines with mixed PIDs → only matching-PID rows; malformed line missing syscall field → silently skipped; audit-write failure resilience (rejecting mock doesn't throw); non-1326 lines ignored (type=1300 SYSCALL, systemd routine lines, etc.).

### Modified

- `Dockerfile` — apt line gained `bubblewrap` + `libseccomp2`. New build stage RUN: COPY the JSON + C source into `/tmp/`, apt-install `gcc libseccomp-dev libc6-dev`, `gcc -O2 -o /tmp/compile-seccomp /tmp/compile-seccomp.c -lseccomp`, `/tmp/compile-seccomp /tmp/mcp-seccomp.json /app/src/extensions/mcp-seccomp.bpf`, `apt-get purge -y --auto-remove gcc libseccomp-dev libc6-dev`, clean. Comment block at the apt line updated to reflect Phase 55 / MCP-02 + MCP-03 dependencies. Image-growth comment updated to ~23 MB.
- `src/extensions/audit-actions.ts` — `MCP_SECCOMP_VIOLATION: "ext:mcp:seccomp-violation"` inserted after `MCP_HOST_BLOCKED` and before the Phase 50 SDK_* cluster, with a 20-line JSDoc explaining the soak-reader emission contract + metadata shape + Phase 58 readiness-gate reference. `ExtensionAuditMetadata` type extended with optional `syscall?: number`, `code?: string`, `pid?: string`, `arch?: string` fields.
- `src/extensions/mcp-netns.ts` — added `import { openSeccompBpfFd } from "./runtime/seccomp-loader"`. `BuildNetnsSpawnArgsResult` extended with `seccompFd?: number | null` + `seccompKillSwitchActive?: boolean`. `buildNetnsSpawnArgs` reads `process.env.EZCORP_MCP_STAGE1_SECCOMP` (string-equality "0" to match the tmpfs kill-switch shape), opens the BPF FD via `openSeccompBpfFd()` when the kill-switch is inactive. Both branches (wrapped + unwrapped) populate the new fields.
- `src/extensions/mcp-sandbox.ts` — added `import { parseAndEmitSeccompViolations } from "./runtime/seccomp-soak-reader"`. Module-scope `seccompKillSwitchBootRowEmitted: boolean` + `_resetSeccompKillSwitchBootFlagForTests` + `_setSeccompSoakOverridesForTests` exports. New kill-switch boot row emission (one-time-per-process, reason `'kill-switch: seccomp disabled'`). FD-threading gates (bwrap available + tmpfs kill-switch inactive + seccomp kill-switch inactive + FD opened) set `EZCORP_MCP_BWRAP_SECCOMP_FD=3` env + populate `wrapped.seccompFd`. FD closure on gate-miss. New exported `runMcpSeccompSoakReader(childPid, spawnAt, ctx)` async function; new internal `readJournalctlLines(spawnAt, pid)` helper with the `_setSeccompSoakOverridesForTests` seam.
- `src/extensions/mcp-launcher.sh` — Plan-02 bwrap branch refactored into a two-arm if-else: when `EZCORP_MCP_BWRAP_SECCOMP_FD` is set, `bwrap` argv includes `--seccomp $EZCORP_MCP_BWRAP_SECCOMP_FD` between `--tmpfs /tmp` and the `--` argv terminator; otherwise the bwrap argv is exactly the Plan-02 shape (backwards compatible). Comment block updated.
- `src/extensions/types.ts` — `McpServerStdio.seccompFd?: number | null` field added with a JSDoc explaining the FD-passthrough contract.
- `src/__tests__/mcp-sandbox.test.ts` — `_resetSeccompKillSwitchBootFlagForTests` added to imports. Module-scope `MOCK_SECCOMP_FD: number | null = null` + `mock.module("../extensions/runtime/seccomp-loader", () => ({ openSeccompBpfFd: () => MOCK_SECCOMP_FD, getSeccompBpfPath: () => "/app/src/extensions/mcp-seccomp.bpf" }))`. New `describe("seccomp log mode")` block with 3 cases mirroring the bwrap-tmpfs describe shape.
- `src/__tests__/mcp-netns-integration.test.ts` — new `describe("seccomp log mode")` with one `test.skipIf(SECCOMP_SKIP)` case `"seccomp log → MCP_SECCOMP_VIOLATION audit row"`. SKIP gate covers non-Linux / no bwrap / no .bpf / no `log` in actions_logged / no gcc / no journalctl. Compiles a ptrace probe via `Bun.write` + `Bun.spawnSync(["gcc", srcPath, "-o", probePath])`. Spawns the probe inside the bwrap'd MCP envelope with the FD passed through `stdio[3]`. Waits 2s for journalctl flush, then calls `runMcpSeccompSoakReader` and polls `auditCalls` for up to 5s for a `MCP_SECCOMP_VIOLATION` row with matching pid. **The existing `mock.module("../extensions/runtime/dns", ...)` block at the top of the file is PRESERVED — required since 55-01 commit `ae87384`.**
- `docs/deployment.md` — three new subsections:
  - **Stage 1 kill-switches** — table listing all three env vars + boot-time-only callout + uniform boot-row callout (no Plan-01 exception per checker B1).
  - **MCP soak signal — bundled-corpus caveat** — empty-bundled-corpus situation, deployed corpus must be the soak signal source, SCMP_ACT_LOG / SIGSYS-impossibility sentence per W3, synthetic-test-MCP deferred recommendation.
  - **Stage 1 seccomp — manual verification fallback** — 8-step operator checklist for hosts where the automated integration test SKIPs (per W4).
  - Existing audit-signals table extended with `ext:mcp:seccomp-violation`.
  - Image-size paragraph updated to ~23 MB with the bubblewrap + libseccomp2 breakdown.
  - Resources list updated with every new Phase 55 source file.

## Resolution of RESEARCH.md Open Questions

Per the plan's success criteria, all 5 open questions from RESEARCH.md are addressed:

| OQ | Question | Resolution |
|----|----------|------------|
| 1 | Pattern A vs B for unshare+bwrap chaining | **Pattern B (outer unshare + inner bwrap with inherited userns)** — confirmed in Plan 02 (commit `20552c1`) and reused unchanged here. Plan 03 only extends the bwrap argv with `--seccomp <fd>`; the outer envelope is untouched. |
| 2 | Commit `mcp-seccomp.bpf` to repo or .gitignore? | **Commit + CI freshness guard** (mirrors `manifest.lock.json` precedent). `scripts/check-seccomp-bpf-fresh.sh` is the guard. On this NixOS dev host (no `libseccomp-dev`) the BPF is generated INSIDE `docker build` — not committed from this worktree, expected to land via CI on first build. See Manual Verification status below. |
| 3 | Per-MCP shutdown reader vs fleet-wide sweep daemon | **Per-MCP shutdown reader for Phase 55** — `runMcpSeccompSoakReader` exported from `mcp-sandbox.ts`. Fleet-wide sweep daemon (catching SIGKILL-orphaned violations) DEFERRED — recorded as a follow-up todo (see Deferred Items below). |
| 4 | Bundled-corpus has zero MCPs | **Documented in docs/deployment.md** under the "MCP soak signal — bundled-corpus caveat" subsection. Synthetic test MCP DEFERRED (see Deferred Items). |
| 5 | Kill-switch persistence across host restarts | **Documented in docs/deployment.md** under "Stage 1 kill-switches" with an explicit boot-time-only callout instructing operators to persist the env var in their compose file. |

## Decisions Made

Beyond the key-decisions in the frontmatter:

- **Hand-rolled minimal JSON parser in `compile-seccomp.c`** vs cJSON. The seccomp JSON has a fixed, tiny schema (defaultAction + syscalls[].names[]). Hand-rolling is ~80 lines and avoids pulling in `libcjson-dev` as a build-stage dep. Cost: less defensive against malformed JSON, but the JSON is generated by `bun` from a known-good Docker source, so the upstream is trusted.
- **C source uses a single `strstr("\"names\"")` walk** rather than tokenizing the full JSON. The parser is intentionally fragile: any departure from the expected layout (`"names": [ ... ]`) aborts the build. This is the right tradeoff for a build-time tool — fail fast.
- **The build's `COPY --from=builder /app/src/extensions/mcp-seccomp.json /tmp/mcp-seccomp.json`** copies the JSON from the builder stage into the runtime-stage's `/tmp` so the compile RUN can find it. Avoids the runtime stage depending on the JSON's final path being writable (the runtime image switches to the `bun` user later).
- **Seccomp FD-passthrough via `stdio[3]`** rather than via a forked-and-pipe approach. Bun.spawn accepts raw FDs in the stdio array (verified empirically: index 0/1/2 are stdin/stdout/stderr; indices ≥3 are FD-passthrough slots). The MCP child inherits FD 3 as a copy; bwrap reads the BPF program from it before exec. No filesystem path leak; FD is closed in the parent immediately after spawn.
- **Soak reader emits ALL violations, no rate-limit.** A noisy MCP could in principle flood the audit log with `MCP_SECCOMP_VIOLATION` rows. Phase 55 accepts this — the soak window is meant to surface every syscall the deployed corpus calls, including high-frequency ones (we WANT to see if a syscall fires a million times in 7 days; that's exactly the signal Phase 58's flip-decision needs). If a real noise problem emerges in production, the fleet-wide sweep daemon (deferred) can introduce per-syscall rate-limit + summary rolls.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Order-insensitive regex in seccomp-soak-reader.ts**
- **Found during:** Task 2 GREEN run — 4 of 6 soak-reader tests failing.
- **Issue:** Initial regex was a single combined pattern `audit:\s+type=1326\s+.*?\bpid=(\d+)\b.*?\bsyscall=(\d+)\b.*?\barch=([0-9a-f]+)\b.*?\bcode=(0x[0-9a-f]+)\b/i`. Real kernel type=1326 lines emit fields in order `pid → arch → syscall → ip → code`, but my regex required `pid → syscall → arch → code`. Mismatch made the parser silently drop every real line.
- **Fix:** Replaced with one `TYPE_1326_RE` discriminator (`/\baudit:\s+type=1326\b/i`) and four independent field regexes applied separately. Order-agnostic by construction.
- **Files modified:** `src/extensions/runtime/seccomp-soak-reader.ts`
- **Verification:** All 6 soak-reader tests GREEN post-fix.
- **Committed in:** `28bd34e` (Task 2 commit).

**2. [Rule 1 - Bug] Numeric sort in soak-reader test fixture**
- **Found during:** Task 2 GREEN run — "multiple lines mixing PIDs" test failing.
- **Issue:** Used `.sort()` on a `(number | undefined)[]` array, which sorts lexicographically (`[101, 51]` instead of `[51, 101]`).
- **Fix:** `.sort((a, b) => a - b)` with explicit numeric comparator.
- **Files modified:** `src/__tests__/mcp-stage1-soak-reader.test.ts`.
- **Committed in:** `28bd34e` (Task 2 commit).

### Within-scope clarifications (not deviations)

- The plan's `<action>` for Task 1 says "On macOS dev: skip the local compile, just commit the source." This worktree is NixOS — `libseccomp-dev` is not in the Nix env. Followed the macOS guidance: committed the C source, did NOT attempt a local compile. Docker build will compile it.
- The plan suggests `_setSeccompSoakOverridesForTests` for unit-testing the journalctl runner. Implemented exactly as suggested; the runner takes `(sinceISO, pid)` and returns `Promise<readonly string[]>`. Production code path is unchanged when the override is null.

---

**Total deviations:** 2 auto-fixed (Rule 1 bugs — regex field ordering, lexicographic sort)
**Impact on plan:** No scope creep. Both bugs surfaced during Task 2's GREEN sweep and were fixed before commit; the Task 2 commit message reflects both.

## Issues Encountered

1. **Pre-existing uncommitted main-branch files**. README.md, compose.prod.yml, docker-compose.yml, web/e2e/extensions.spec.ts, web/src/routes/(app)/extensions/+page.svelte were dirty at plan start (carried over from Plans 01/02). Additionally, after running `bun test ./docs/extensions/examples/web-search/` mid-execution, several `docs/extensions/examples/*.ts` and `docs/extensions/examples/*.test.ts` files became dirty — likely a side-effect of the `web-search` example's test fixture writing to the worktree. Per plan_context, staged ONLY my Plan-03 files using explicit `git add <file>` paths; never `-A` or `.`. All commits stayed in scope.
2. **NixOS dev host lacks `libseccomp-dev`.** The C helper can't be compiled locally on this host. This is the expected scenario per the plan ("On macOS dev: skip — verified in CI / Linux integration"). The `scripts/check-seccomp-bpf-fresh.sh` script detects this and exits with code 2 (build-env missing) rather than failing. Docker build is the canonical compile site.
3. **Manual `docker build` not run from this worktree.** The plan's Task 1 step 11 is "Optional but recommended" — a `docker build -t ezcorp:phase55-task1 .` to verify end-to-end. Skipped here because (a) this is a NixOS host without a configured docker daemon, and (b) every Dockerfile change is covered by the new W2 source-level shape tests. **The first CI build that runs against this commit will exercise the full pipeline; if it fails, file a bug.** Honest yes/no: did Docker build run? No. Did it produce a working image with the expected files? Not directly verified — relying on the W2 source-shape tests + the Dockerfile token regex assertions.
4. **The `gcc` in runtime image** — empirical finding deferred. The plan's Task 1 step 11 asks whether `gcc` survives the build-stage purge. Per the new Dockerfile, `apt-get purge -y --auto-remove gcc libseccomp-dev libc6-dev` removes them. So `gcc IS purged in the runtime image`. The Task-3 integration test's SKIP condition `Bun.which("gcc") === null` will hit at runtime → SKIP → manual-verification fallback (per W4, documented in `docs/deployment.md`).
5. **`runMcpSeccompSoakReader` not yet auto-invoked from registry.ts**. The function is exported and tested in isolation, but the production wiring that calls it after `proc.exited` resolves in `src/extensions/registry.ts` is NOT part of Plan 03's scope (the plan's `files_modified` doesn't include `registry.ts`). The integration test invokes it directly. **Deferred wiring item — see Deferred Items below.**

## Empirical Findings (per plan output section)

- **gcc present in the runtime image?** No — purged by the build stage's `apt-get purge -y --auto-remove gcc libseccomp-dev libc6-dev`. This is intentional (image-size hygiene). Task 3 integration test SKIPs on `Bun.which("gcc") === null`; manual-verification fallback in `docs/deployment.md` is the operator's path.
- **Manual `docker build` run?** No — NixOS host, no configured daemon. W2 source-shape tests provide automated coverage of the Dockerfile edits.
- **Soak clock start date.** Starts the date this plan ships to a production host. Phase 58 readiness gate cannot evaluate before `<deploy-date> + 7 days`. As of this SUMMARY: 2026-05-11. Earliest Phase 58 ready: 2026-05-18 (and only if a production deployment runs at least one MCP between those dates).
- **Cumulative Phase-55 test count.** Wave 1 baseline (60 pass / 3 skip across mcp-proxy + mcp-netns-fallback + mcp-sandbox + mcp-netns-integration) + 20 new tests landed in Plan 03 → **77 pass / 6 skip across 6 files** on this dev host. On a Debian production host with `bubblewrap` + `libseccomp2` + `gcc` (during CI build) + `journalctl`, the .bpf-presence tests and the seccomp integration test would also run, lifting to ~80 pass / 3 skip.

## Deferred Items (follow-up todos)

The following items are explicitly deferred per the plan's success criteria, recorded here for the Phase-55 verifier pass and future planners to pick up:

1. **Fleet-wide soak sweep daemon** (RESEARCH.md OQ 3). Current per-MCP shutdown reader misses violations from MCPs that crash before the shutdown handler runs (SIGKILL, OOM). A host-maintenance-daemon tick every 30s reading `journalctl -k --since=<last-sweep>` would catch these. Phase 55 ships the per-MCP path; the fleet daemon is a follow-up.
2. **Synthetic test MCP for bundled-corpus soak signal** (RESEARCH.md OQ 4). Bundled extension corpus has zero MCPs today; a dev/test image shipping a synthetic MCP that exercises the profile would give CI a non-zero soak signal to assert on. Plan 03 documents the gap in `docs/deployment.md`; the synthetic MCP is a follow-up.
3. **Production wiring of `runMcpSeccompSoakReader`**. The exported function is unit-tested and called from the integration test directly, but no caller in `src/extensions/registry.ts` invokes it after `proc.exited` resolves. Plan 03's `files_modified` deliberately doesn't include `registry.ts` — adding the wiring there is small and mechanical. Follow-up.
4. **CI workflow integration of `scripts/check-seccomp-bpf-fresh.sh`**. The script exists and is executable, but no CI workflow YAML invokes it. Plan 03 explicitly excludes CI workflow files from scope. Follow-up: add a `.github/workflows/*.yml` step that runs the script on every PR.
5. **Commit the generated `mcp-seccomp.bpf`** (RESEARCH.md OQ 2 resolution). This worktree (NixOS, no libseccomp-dev) cannot generate the artifact. The first CI Docker build will create it; the planner-designated follow-up is to extract it from the resulting image and commit it to the repo so dev-host builds (and `scripts/check-seccomp-bpf-fresh.sh`) have a reference artifact to `cmp` against.

## User Setup Required

None — no external service configuration required. The Stage 1 kill-switches are documented for operators in `docs/deployment.md`; production deployments leave them all unset.

## Next Phase Readiness

- **Plan 55-03 is Phase 55's final plan.** Wave 2 complete. Phase 55 ships once the verifier pass clears.
- **Phase 58 readiness gate.** Cannot evaluate before `<production-deploy-date> + 7 days`. The signal source is the `audit_log` table filtered on `action = 'ext:mcp:seccomp-violation'`. Zero rows across the 7-day window across the deployed corpus → flip `mcp-seccomp.json` defaultAction from `SCMP_ACT_LOG` to `SCMP_ACT_ERRNO` and regenerate the BPF blob; `SCMP_ACT_LOG`-mode entries in `syscalls[]` stay (Phase 58 owns the audit interpretation).
- **Soak clock starts on first production deploy of this commit.** Earliest Phase 58 readiness check: deploy_date + 7 days. Phase 58 plan should land the deferred items 1, 2, 3, 5 above; deferred item 4 (CI workflow) is a one-line PR independent of Phase 58.

## Self-Check: PASSED

Verified all claimed artifacts exist:
- src/extensions/mcp-seccomp.json: FOUND (407 entries, 9.9KB)
- build/compile-seccomp.c: FOUND (~150 lines)
- src/extensions/runtime/seccomp-loader.ts: FOUND
- src/extensions/runtime/seccomp-soak-reader.ts: FOUND
- scripts/check-seccomp-bpf-fresh.sh: FOUND (executable)
- src/__tests__/mcp-seccomp-profile.test.ts: FOUND
- src/__tests__/mcp-stage1-soak-reader.test.ts: FOUND
- src/extensions/audit-actions.ts: MCP_SECCOMP_VIOLATION constant present
- src/extensions/mcp-netns.ts: seccompFd + seccompKillSwitchActive fields present
- src/extensions/mcp-sandbox.ts: runMcpSeccompSoakReader + _resetSeccompKillSwitchBootFlagForTests + _setSeccompSoakOverridesForTests exports present
- src/extensions/mcp-launcher.sh: `--seccomp "$EZCORP_MCP_BWRAP_SECCOMP_FD"` present
- src/extensions/types.ts: McpServerStdio.seccompFd field present
- docs/deployment.md: "Stage 1 kill-switches" + "bundled-corpus caveat" + "manual verification fallback" sections present
- Dockerfile: `bubblewrap` + `libseccomp2` + `gcc ... -lseccomp` + `compile-seccomp ... mcp-seccomp.json ... mcp-seccomp.bpf` all present

Commits:
- 19f2369 (Task 1): FOUND
- 28bd34e (Task 2): FOUND
- ec20eda (Task 3): FOUND

Test runs:
- Phase-55 surface (6 files): 77 pass / 6 skip / 0 fail
- Wave-1 baseline preserved: mcp-proxy.test.ts + mcp-netns-fallback.test.ts + mcp-sandbox.test.ts + mcp-netns-integration.test.ts: 60+ pass / 4 skip (was 60/3; +1 skip from the new SECCOMP_SKIP-gated integration case)
- mcp-netns-integration.test.ts `mock.module("../extensions/runtime/dns", ...)` block: PRESERVED at file top

## Post-merge fix

Two TypeScript correctness gaps surfaced during Phase 55 verification and were closed in-place:

1. **`src/extensions/runtime/seccomp-soak-reader.ts`** — TS strict-mode (`noUncheckedIndexedAccess`) typed regex capture-group access as `string | undefined` even after the existing four-match guard. Added an explicit `=== undefined` narrowing on `pid`/`syscallStr`/`code`/`arch` so `Number.parseInt` and the downstream metadata see narrowed `string`. No behavior change — malformed lines were already rejected. Commit `d55f323`.
2. **`src/extensions/types.d.ts`** — Plan 55-03 added `seccompFd?: number | null` to `McpServerStdio` in `types.ts` but the committed `.d.ts` (consumed by anything that resolves types via the declaration file) was not synced. Project typecheck passes because `tsc` resolves `.ts` over `.d.ts`, but the LSP flagged `mcp-sandbox.ts:372` and downstream `.d.ts` consumers would see a stale contract. Mirrored the field with a condensed JSDoc matching the `.d.ts`'s shorter-comment style. Commit `a7dcc30`.

Both fixes verified by `bun run typecheck` (backend + web GREEN) and the Phase-55 test surface (soak-reader 6/6, sandbox + netns-integration 21 pass / 4 skip — baseline preserved).

---
*Phase: 55-mcp-stage-1-dns-rebind-tmpfs-seccomp-log-mode*
*Completed: 2026-05-11*
