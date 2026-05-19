# Milestones

## v1.4 Trust Hardening & v1.3 Closeout (Shipped: 2026-05-13)

**Phases completed:** 9 phases (54–62), 45 plans, 46 summaries
**Timeline:** ~3 days (2026-05-10 → 2026-05-13)
**Git range:** `33b6eb3` (Phase 54 start) → `d0a395e` (v1.4 closeout repair docs)
**Requirements:** 23/23 satisfied per `.planning/milestones/v1.4-MILESTONE-AUDIT.md` (audit verdict: `tech_debt` — no blockers; documented carry-forward items)

**Delivered:** Closed six v1.3 security-review findings (5 LOW CCs + Claim-1 MEDIUM caveat), hardened MCP extension isolation with DNS-rebind defense + tmpfs + seccomp enforce + netns veth-pair, shipped per-capability TTL UI, completed Phase 49 deferred mobile UX work (BottomSheet + pg_trgm marketplace search + agent-picker save/pin + chip drag-reorder), repaired ~110 stale-locator e2e specs across three sub-phases, retro-claim audit for already-landed v1.4 commits + four-scope-modal doc correction.

**Key accomplishments:**
1. **Security Backbone Hardening (Phase 54)** — PDP fail-closed when conversation-override lookup fails with a TTL cache absorbing PGlite warm-up flakes (SEC-01); structured `logger.error` on audit-write failures (SEC-02); per-conversation `MAX_CALL_DEPTH` cap via module-scope Map (SEC-03); distinct `PERMISSION_REAPPROVED` audit action (SEC-04); `^localhost$` regex anchored in internal-host (SEC-05); `engine: getPermissionEngine()` injected into appendMessage ctx so PDP gates the reverse-RPC (SEC-06 / Claim-1).
2. **MCP Stage 1 + Stage 2 isolation (Phases 55, 58)** — Outbound CONNECT in mcp-proxy resolves hostname via `Bun.dns.lookup` and re-checks every A/AAAA against `isInternalHost` (MCP-01, closes DNS-rebind); private 64 MB tmpfs `/tmp` inside MCP mount namespace (MCP-02); bubblewrap + seccomp BPF `SCMP_ACT_LOG` in observability mode (MCP-03); flip to `SCMP_ACT_ERRNO` enforce after 7-day soak with `defaultErrnoRet=38` (MCP-04); per-extension veth-pair on `br-ezcorp-mcp` bridge + nftables egress drop + conntrack ceiling probe + IPv6 disabled (MCP-05, closes raw-socket bypass).
3. **Per-Capability TTL UI (Phase 56)** — User-chosen TTL override at re-approve persists on `settings` JSONB (zero migration via additive `ttlOverrideMs?: number`); host-maintenance sweep honors override before `TTL_CONFIG[kind]` fallback; banner shows current TTL via `Intl.RelativeTimeFormat` (TTL-01).
4. **Phase 49 Mobile UX Deferred (Phase 57)** — Shared `BottomSheet.svelte` + `useBreakpoint` composable wrap all 9 pickers at viewport `<lg` (UX-01); marketplace search uses pg_trgm GIN + `ts_rank_cd` hybrid with 6h `gin_clean_pending_list` (UX-02); save-search + pinned-agents in agent picker via settings KV (UX-03); drag-reorderable extension chips on agent edit via svelte-dnd-action (UX-04).
5. **Test Debt Repair (Phases 59, 61, 62)** — `api-mocks.ts` audit + 14 additive v1.3 endpoint handlers (TEST-01); ~110 stale-locator Playwright specs hardened via data-testid (TEST-02); 3 chat-side `test.fixme` flows flipped active (TEST-03); 10 pre-existing backend failures triaged real-bug vs stale-assertion vs Bun-upstream (TEST-04); `MEMORY_INJECTION_ELIGIBILITY_CHANGED.metadata.projectIds` assertion (TEST-05).
6. **Audit-Claim & Docs Polish (Phase 60)** — PROJECT.md "Already-landed v1.4 commits" table extended with `b652f2b` (compaction-key rename) and `763d718` (wrangler-pin / CVE-2023-3348) with per-commit invariant checks (CLAIM-01); `docs/permissions/four-scope-modal.md` L29 corrected to reflect persistent-until-restart session-scope semantics + atomic 5-site rename "Allow this time" → "Allow until restart" (DOCS-01).
7. **2026-05-13 v1.4-closeout repair pass** — independent backend test-debt audit closed 65 newly-passing tests across 7 atomic commits; backend bun:test pool moved from `7811 pass / 71 fail / 22 failing files` → `7950 pass / 9 fail / 6 failing files`. See `.planning/milestones/v1.4-MILESTONE-AUDIT.md` re-audit addendum.

**Tech debt carried forward to next milestone:**
1. **MCP-integration test trio (BUN-01 reclassified)** — `af1-mcp-sandbox-regression` (4 cases), `mcp-api-routes` (1), `mcp-e2e` (1). Previously deferred as Bun-1.3.11 segfaults; on the current Bun they no longer segfault but surface as functional MCP stdio spawn-envelope / refresh / tool-execution failures. Same root surface as the cwd-fix from the closeout repair pass but inside the MCP client wrapper. Carry-forward.
2. **Wrapper false-positives at `scripts/test.sh PARALLEL=6`** — `agent-configs-handler`, `agent-input-form`, `security/sb1-storage-rpc-security` all pass 100% in isolation. Closes when Phase-59-04 verdict #4 (`mock-cleanup.ts MODULE_PATHS` widening) lands.
3. **Infrastructure-only human-verification items** — bwrap-on-NixOS (Phase 55 MCP-02), iOS home-indicator visual clearance (Phase 57 UX-01), 24h CAP_NET_ADMIN conntrack soak (Phase 58 MCP-05). Each has unit/integration proxy coverage; absolute criterion needs operator/device.
4. **v1.5 Playwright auth-fixture infra** — unblocks SEC-06 e2e + UX-01..04 e2e flows currently held at `test.fixme`.
5. **agent-detail.spec.ts:178** — pre-existing strict-mode collision between `getByRole('button', {name:'Chat'})` and `aria-label="Remove Current Chat Model"`. Documented in `62-02-SUMMARY.md` as out-of-scope deferred.
6. **REQUIREMENTS.md / ROADMAP.md narrative drift** — TEST-02 detail row only cites 62-01..62-04 commits; ROADMAP inline checkboxes for some Phase 62 plans show `[ ]` despite landing. Display-only drift; per-phase status entries are accurate.

---

## v1.3 Security & Permissions (Shipped: 2026-05-09)

**Phases completed:** 11 phases (49–53 + Unified Permissions 1–7 + Capability Expiry A–D + Post-perm Cleanup + Lessons Keeper v1+v1.5 + Multi-select chat turns + v1.3 Closeout PR)

**Timeline:** ~3 days (2026-05-06 to 2026-05-09)
**Commits:** 184 (since 2026-05-06) | **LOC:** +90,483 / −6,589 across 599 files
**Requirements:** No v1.3-REQUIREMENTS.md (milestone backfilled 2026-05-08); audit verified all phases shipped against observable git evidence (41/41 commits resolved, 12/12 key artifacts present)
**Tech debt carried forward:** 3 categories (see below)

**Delivered:** Security backbone for the extension ecosystem — unified permission engine with PDP, capability expiry sweeps, MCP isolation via netns + bearer-token proxy, audit visibility surface, Phase 49 navigation/agent UX carryover from v1.2, and bundled extension ports proving the SDK is dogfood-complete.

**Key accomplishments:**
1. **Unified Permission System (Phases 1–7)** — central PDP at `src/extensions/permission-engine.ts`, in-sandbox `fetch` wrapper with per-host enforcement, host-mediated `ezcorp/fs.*` reverse-RPC for filesystem access, cross-extension capability intersection on `ezcorp/invoke`, `manifest.lock.json` integrity gate for bundled extensions, four-scope permission modal (session/conversation/project/forever), and MCP isolation via `unshare` + bearer-token proxy + per-host PDP gate.
2. **Capability Expiry Milestone (A–D)** — TTL config + always-allow value-shape migration, `runSweep` core with race mitigation + audit/event emission, `HostMaintenanceDaemon` with PID lockfile + hourly tick + env-var kill switch, and the user-facing PermissionGate expired branch + ExpiredGrantsBanner + ExpiredReapproveModal flow.
3. **Bundled Extension Ports (Phase 53 + 53.6 + Stage 2)** — migrated `lessons-distiller` + `memory-extractor` onto Phase 51 SDK helpers, deleted legacy `src/memory/extraction.ts`, fixed boot-spawn so subprocess actually starts at host boot, and hardened the reverse-RPC gate to consult `conversation_extensions` wiring for event-driven invocations (not `currentConversationId`).
4. **Audit & Visibility (Phase 50) + Library Audit UI (Phase 52)** — capability event pills in chat, per-conversation audit drill-down, per-extension audit page, global `/audit` admin page with 24h stats strip, settings panel for "Audit & Visibility", and the Library Built-ins / Installed split with audit drill-down at the per-extension level.
5. **Navigation & Agent Management (Phase 49 — v1.2 carryover)** — mobile-responsive sidebar drawer, agent fuzzy search with Web Worker offload, marketplace category browsing, and the visual extension attach picker. Closed all 5 carried EATT/NAVM IDs.
6. **SDK Capabilities + Cron Daemon (Phase 51)** — schedule daemon for `ctx.schedule` with PID lockfile, jitter on catch-up fires, missed-run policies, crash-mid-fire reaping, TZ-aware cron. Pattern reused later by capability-expiry's host-maintenance daemon.
7. **v1.3 Closeout PR** — closed 4 of 5 outstanding roadmap items + 8 of 11 triaged pre-existing test failures: PGlite `:memory:` semantic fix, Vite preview Bun runner, reapprove auth-model documentation, tool-call-hydration mock, c2-session-revocation mock pollution, and a JWT `jti` claim that closed a latent same-second `sessions.token_hash` collision in production code paths.

**Late-stage scope reductions (acknowledged at closeout):**
- v1.3-REQUIREMENTS.md never created — milestone was backfilled 2026-05-08 from observable shipped state per the roadmap's own preamble. Audit relied on git + filesystem evidence instead of a formal requirements traceability table.
- Phase 53 work overlapped with active session work; coordination handled via real-time merge + rebase rather than synchronous handoff.
- Multi-select chat turns spec in `tasks/todo.md` was discovered to be already-shipped (commit `335a200`, 2026-04-30) during the v1.3 closeout investigation.

**Tech debt carried forward (v1.4+ work):**
1. **Capability expiry v1.5 follow-ups** — per-capability TTL on settings-page banner (currently hardcodes 90d default); restoring install-time narrowed choices on re-approve (currently re-grants full manifest value).
2. **Bun 1.3.11 segfaults** — 3 MCP regression tests (af1-mcp-sandbox-regression, mcp-api-routes, mcp-e2e) blocked on upstream Bun fix. Revisit on next Bun upgrade.
3. **~8 unrelated pre-existing test failures** observed during v1.3 closeout (executor-attachment-resolver-wiring, executor-task-tracking-autowire, memory-validation, mock-cleanup-coverage, queries-lessons, scope-enforcement, spawn-assignment-handler, api-tool-invoke.server) — verified NOT introduced by v1.3, NOT in original triage. To file in fresh v1.4 triage doc.
4. **GSD framework decoupled from observable reality** — `.planning/phases/` only has v1.2 dirs (31–48); v1.3 work bypassed per-phase SUMMARY/VERIFICATION/VALIDATION artifacts. For v1.4+, decide: adopt GSD per-phase artifacts or accept that `/gsd:audit-milestone` requires manual execution.

**Reference:** `.planning/milestones/v1.3-MILESTONE-AUDIT.md` (full audit report with phase-by-phase verdict, integration smoke results, and tech-debt breakdown).

---

## v1.2 Textbox Shortcuts & Better Extensions (Shipped: 2026-05-06)

**Phases completed:** 17 phases, 58 plans

**Timeline:** ~7 weeks (2026-03-16 to 2026-05-06)
**Commits:** 512 (since 2026-03-16, no merges) | **LOC:** delta not measured
**Requirements:** v1.2 audit deferred items closed via gap-closure phases (45/46/47); 5 EATT/NAVM IDs explicitly carried to v1.3 (Phase 49)
**Tech debt carried forward:** 3 items (see below)

**Delivered:** Layered chat productivity surface — @-mention shortcuts, inline extension invocation, scoped agent sub-conversations — plus a modular built-in tool system, full diff rendering, support/scale readiness, and the in-app Ez concierge.

**Key accomplishments:**
1. @-Mention system — autocomplete popover, ARIA combobox, unified search API across agents/extensions/files/commands/features
2. Inline extension invocation + sub-conversations + agent composition with cycle detection
3. Modular built-in tool system — shell/grep/glob, surgical edit, permission gates with Claude Code-style modes
4. Diff rendering pipeline — fenced-block detection, side-by-side/unified toggle, slide-out summary panel
5. Launch & support readiness — branded error pages, password reset, session management, admin analytics dashboard, auto-generated API docs
6. Scale readiness — external Postgres via DATABASE_URL, PWA manifest, mobile UX, WCAG 2.1 AA compliance
7. Ez Button — in-app concierge with locked builtin mode, seven-tool allowlist, dedicated per-user conversation, draft-prefill flow for project/agent creation

**Late-stage scope reductions (acknowledged at closeout):**
- Phase 48 ezContext / page-context protocol REMOVED (commits a4de90f, fc07608, 6729ee3, 1294b28, 7ae8d91). Ez button + panel + mode + tools + drafts all stay; `fill_form` and `navigate_to` are intentionally non-functional pending v1.3 redesign. Phase 48 re-verified 2026-05-06 at 6/6 under revised scope.
- Phase 35 (Navigation & Agent Management) deferred to v1.3 as Phase 49.

**Tech debt carried forward (v1.3 work):**
1. **Ez page-context redesign** — `fill_form` / `navigate_to` non-functional pending tool-driven approach (replaces removed `<EzContext>` static-provider model).
2. **Phase 35: Navigation & Agent Management** — deferred from v1.2 scope. Mobile-responsive layout, agent fuzzy search, marketplace category browsing, extension attach picker.
3. **Multi-select chat turns bulk actions** — shift+click range selection + bulk Copy/Exclude. Spec in `tasks/todo.md`.

---

## v1.1 Polish & Extensions (Shipped: 2026-03-15)

**Phases completed:** 19 phases, 58 plans, 6 tasks

**Timeline:** 2 days (2026-03-14 to 2026-03-15)
**Commits:** 98 | **LOC:** ~62,095 (TypeScript + Svelte)
**Requirements:** 61/61 satisfied | **Tech debt:** 5 non-critical items

**Delivered:** Elevated MVP to polished product with rich extension packages, OAuth provider auth, pi-mono migration, complete SDK/CLI tooling, security hardening, and refined UX across the platform.

**Key accomplishments:**
1. Rich extension system — multi-component manifests, git install, dependency resolution, cross-extension composition, TypeScript config
2. OAuth provider auth — PKCE flows for OpenAI/Gemini, BYOK fallback for Anthropic, provider connection dashboard
3. Pi-Mono migration — replaced hand-rolled LLM/agent code with pi-ai and pi-agent-core packages
4. Polished UX — dark/light mode, keyboard shortcuts, streaming indicators, message toolbar, command palette, toast notifications
5. Extension SDK & docs — CLI tooling (init/dev/test/publish), getting started guide, API reference, showcase examples
6. Security hardening — rate limiting, Zod validation, API keys with scopes, resource quotas, marketplace moderation, scope enforcement

---

## v1.0 MVP (Shipped: 2026-03-10)

**Phases completed:** 11 phases, 42 plans
**Timeline:** 3 days (2026-03-08 to 2026-03-10)
**Commits:** 232 | **LOC:** ~46,125 (TypeScript + Svelte)
**Git range:** feat(01-01) to feat(11-03)

**Delivered:** Full-stack AI platform with streaming chat, persistent memory, smart model routing, agent creation, extensions, team sharing, and a public marketplace — the complete user-to-builder loop.

**Key accomplishments:**
1. Streaming multi-model chat with conversation persistence, branching, search, and export
2. Automatic memory extraction with hybrid retrieval (vector + keyword) and context injection
3. Knowledge base with file upload, RAG chunking, and citation display
4. Smart model routing with BYOK, circuit breakers, fallback chains, and tier-based selection
5. Dual-path agent creation (natural language + structured editor) with persona chat
6. Agent extensions via MCP with sandbox testing, observability, and permission model
7. Team sharing with auth, RBAC, and agent sharing across organizations
8. Public marketplace with publishing, discovery, installation, ratings, and versioning

**Tech debt carried forward:** 1 item (projectId interpolation in retrieval.ts — low risk)

---

