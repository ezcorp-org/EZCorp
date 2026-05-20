# EZCorp - AI Platform

## What This Is

A self-hosted AI platform where anyone can chat with AI models using persistent memory, build agent personas and extensions, and share them through a marketplace or within teams. As of v1.3, the platform has a unified permission engine (PDP) that gates every capability call, automatic capability expiry with user-facing re-approval, and end-to-end audit visibility across in-chat pills, per-conversation drill-downs, per-extension audit pages, and a global admin `/audit` page. Built-in features (lessons distiller, memory extractor) run as bundled extensions on the same SDK that third-party authors use, proving the SDK is dogfood-complete. Built on pi-ai and pi-agent-core for battle-tested multi-provider streaming.

## Core Value

Anyone can sit down, chat with persistent memory, find agent apps others built, and create their own — the full loop from user to builder in one product, with full visibility and control over what every extension can do.

## Current State

**Shipped:** v1.4 Trust Hardening & v1.3 Closeout (2026-05-13).

v1.4 closed six v1.3 security-review findings (5 LOW CCs + Claim-1), hardened MCP extension isolation end-to-end (DNS-rebind defense via `Bun.dns.lookup` recheck + private tmpfs `/tmp` + seccomp BPF flipped from `SCMP_ACT_LOG` to `SCMP_ACT_ERRNO` enforce after 7-day soak + per-extension veth-pair on `br-ezcorp-mcp` with nftables egress drop and conntrack/IPv6 guards), shipped per-capability TTL UI on settings, completed Phase 49 deferred mobile UX (shared `BottomSheet` wrapping all 9 pickers, pg_trgm marketplace search, agent-picker save/pin, drag-reorder extension chips), repaired ~110 stale-locator e2e specs across three test-debt phases (59, 61, 62), and retro-claimed already-landed v1.4 commits + corrected the four-scope-modal doc. Independent closeout repair pass (2026-05-13) took backend bun:test pool from 71 failures across 22 files to 9 failures across 6 files (65 newly-passing tests across 7 atomic commits).

**Shipped earlier:** v1.3 Security & Permissions (2026-05-09). The platform's complete security backbone — unified permission engine, capability expiry sweeps, MCP isolation, audit infrastructure (`audit_log` + `sdk_capability_calls`), PermissionGate / ExpiredGrantsBanner / ExpiredReapproveModal flow. First-party built-ins (lessons distiller, memory extractor) ship as bundled extensions on the public SDK.

## Current Milestone: v1.5 Hybrid Chat Search

**Goal:** Make every past chat findable instantly — add semantic (pgvector) recall alongside the existing lexical (Postgres FTS) precision, surfaced through the sidebar search box and a new Cmd+K palette.

**Target features:**

- **Hybrid search backend** — chunked pgvector embeddings over chat messages, combined with existing FTS via Reciprocal Rank Fusion (RRF). Reuses the local Transformers.js embedder (`all-MiniLM-L6-v2`, 384-dim) and pgvector extension already wired for `memories` and `knowledge_base_chunks`.
- **Sidebar mode toggle** — extend `ConversationList.svelte` search with a Hybrid / Keyword / Semantic toggle (Hybrid default). Preserve current `ts_headline` snippet highlighting for lexical hits; emit plain ±window snippets for semantic-only hits.
- **Cmd+K command palette** — global search overlay accessible from anywhere; routes to the same hybrid endpoint, jumps to matching message on selection.
- **Embed-on-write + backfill** — durable embed-on-write (outbox pattern) for new messages; one-shot backfill script for existing conversations; skip system / tool roles.

**Explicitly NOT in v1.5 (deferred to v1.6+):**

- **Filters (date / agent / model / project), saved searches, dedicated `/search` page, in-conversation Ctrl+F bar** — covered by sidebar + Cmd+K for v1; revisit once base ranking is validated.
- **Chat-as-RAG (use past chats as context in new chat)** — exposes the index as a memory source; separate scope and trust review.
- **Carry-forward v1.4 debt** (MCP-integration test trio, Playwright auth fixture, `mock-cleanup.ts MODULE_PATHS` widening, operator/device verifications, `agent-detail.spec.ts:178`) — stays carry-forward; v1.5 is pure feature focus.

<details>
<summary>Previous milestone — v1.4 Trust Hardening & v1.3 Closeout (archived)</summary>

**Goal:** Close the trust-boundary gaps surfaced in v1.3 release-readiness, harden MCP isolation, and ship the spec'd-but-not-yet-built backlog items so v1.3 graduates from "shipped" to "trust-grade for non-trusted users."

**Target features:**

- **Security hardening** — Close 5 LOW cross-cutting findings (CC1–CC5) from `tasks/v1.3-security-review.md` + Claim-1 messageToolbar PDP audit-bypass; harden MCP isolation Phase-8 (DNS-rebinding bypass of `isInternalHost`, bearer-token env-leak via `/proc/<pid>/environ`, `/tmp` tmpfs overlay, seccomp profile, netns restoration via veth-pair).
- **Capability expiry v1.5** — Per-capability TTL on settings-page banner (currently 90d hardcoded). Note: install-time narrowed-choice restore on re-approve was already shipped via v1.3-closeout HIGH 2 fix.
- **Phase 49 mobile UX deferred items** — bottom-sheet pattern for mobile pickers; pg_trgm-backed full-text marketplace search; saved-search / pinned-agent UX in agent picker; reorderable extension chips on agent edit.
- **Test debt repair** — Chat-page e2e infrastructure repair (unblocks 103 stale-locator specs + flips 3 `test.fixme` chat-side flows in `web/e2e/v1.3-permission-backbone.spec.ts`); triage ~8 pre-existing backend failures + `agent-configs-handler` + `agent-input-form`; close remaining gaps in `tasks/v1.4-e2e-coverage-100.md`.
- **Vulnerability response** — Patch/upgrade/mitigate the moderate-severity Dependabot finding at `security/dependabot/1` (pushed 2026-05-09).
- **Doc & polish** — `docs/permissions/four-scope-modal.md` "Allow this time" wording fix (claims one-call; engine code shows `session` scope is persistent-until-restart).
- **Audit-claim already-shipped commits** — `cae5c06`, `14b16ca`, `f6c3790`, `7cc5efc`, `b652f2b` (functionally v1.4 work, landed before milestone tracking).

**Explicitly NOT in v1.4 (deferred to v1.5):**

- **Ez page-context redesign** — `fill_form` / `navigate_to` functional via tool-driven model. Deferred 3 milestones; needs design phase before code. v1.3 shipped "coming soon" treatment (commit `9058ea9`) as the interim user-facing answer.
- **`ctx.llm.stream()` full streaming with backpressure** — stub-only in v1.3. Lower urgency than trust work.
- **Bun 1.3.11 segfault recovery** — deferred-upstream; reclassified 2026-05-13 (no longer segfaults; surfaces as functional MCP-integration failures). 3 MCP tests carried forward.

</details>

### Already-landed v1.4 commits (parallel session, before milestone tracking)

The following 6 commits landed on main during the v1.3 audit window via a parallel session. They're functionally v1.4 work but are now in main; **the v1.4 audit claims them via [`.planning/v1.4-retro-claim-audit.md`](v1.4-retro-claim-audit.md)**:

| Commit | Message | Audit |
|---|---|---|
| `cae5c06` | feat(extensions): hard-fail install on `*_API_KEY` env grants | [invariants](v1.4-retro-claim-audit.md#cae5c06) |
| `14b16ca` | feat(extensions): user-configurable memory compaction interval | [invariants](v1.4-retro-claim-audit.md#14b16ca) |
| `f6c3790` | feat(ez-actions): generic `!EZ:<extName>:<tool>` dispatch | [invariants](v1.4-retro-claim-audit.md#f6c3790) |
| `7cc5efc` | fix(extensions): close v1.4 install-gate integration gap | [invariants](v1.4-retro-claim-audit.md#7cc5efc) |
| `b652f2b` | fix(extensions): rename `compactionIntervalHours` to snake_case | [invariants](v1.4-retro-claim-audit.md#b652f2b) |
| `763d718` | chore(worker): pin wrangler to ^4.90.0 (closes dependabot CVE-2023-3348) | [invariants](v1.4-retro-claim-audit.md#763d718) |

(SHAs are post-rewrite — see backup ref `refs/backup/main-before-rewrite-2026-05-09` for pre-rewrite history if needed.)

## Requirements

### Validated

- ✓ Streaming multi-model LLM chat (Claude, OpenAI, Gemini) with conversation persistence — v1.0
- ✓ Conversation history, search, branching, custom instructions, and export — v1.0
- ✓ Automatic memory extraction with hybrid retrieval and context injection — v1.0
- ✓ Knowledge base with file upload, RAG chunking, and citation display — v1.0
- ✓ Smart model routing with BYOK, circuit breakers, and fallback chains — v1.0
- ✓ Dual-path agent creation (natural language + structured editor) — v1.0
- ✓ Agent extensions via MCP with sandbox testing and observability — v1.0
- ✓ Team sharing with auth, RBAC, and agent sharing — v1.0
- ✓ Public marketplace with publishing, discovery, installation, ratings, versioning — v1.0
- ✓ Self-hosted deployment with Docker — v1.0
- ✓ Multi-component extension manifests with git install, dependencies, and composition — v1.1
- ✓ Extension security — path traversal fix, integrity verification, environment isolation, resource limits — v1.1
- ✓ OAuth provider auth (OpenAI, Gemini) with BYOK fallback and provider dashboard — v1.1
- ✓ Pi-Mono migration — pi-ai streaming, pi-agent-core agent loop, pi-ai model registry — v1.1
- ✓ Dark/light mode, keyboard shortcuts, streaming indicators, message toolbar, responsive layout — v1.1
- ✓ Toast notifications, empty states, command palette, extension observability waterfall — v1.1
- ✓ Extension SDK & CLI (init/dev/test/publish) with TypeScript type definitions — v1.1
- ✓ Extension documentation — getting started guide, API reference, showcase examples — v1.1
- ✓ API security — rate limiting, Zod validation, API keys with scopes, resource quotas — v1.1
- ✓ Marketplace moderation (flagging workflow, listing deletion) and agent sharing — v1.1
- ✓ Reliability — WebSocket reconnection, embedding degraded mode, health endpoint — v1.1
- ✓ TypeScript extension config — defineExtension/loadManifest, all loaders/tests/docs migrated — v1.1
- ✓ Integration hardening — scope enforcement on all API routes, admin guards, cookie rename — v1.1
- ✓ Project rename from Pi to EZCorp — v1.1
- ✓ @-mention system with autocomplete popover, ARIA combobox, unified search across agents/extensions/files/commands/features — v1.2
- ✓ Inline extension tool calls (@ext:{name}) with hydration, tool-call cards, sub-conversation composition — v1.2
- ✓ Sub-conversations (@agent:{name}) with cycle detection and scoped composition — v1.2
- ✓ Modular built-in tool system (shell/grep/glob/edit) with Claude Code-style permission gates — v1.2
- ✓ Code & file diff rendering in chat with side-by-side/unified toggle and slide-out summary panel — v1.2
- ✓ Launch & support readiness — password reset, error pages, onboarding, analytics, auto-generated API docs, session management — v1.2
- ✓ Scale readiness — external Postgres via DATABASE_URL, PWA manifest, mobile UX baseline, WCAG 2.1 AA compliance — v1.2
- ✓ Ez Button — in-app concierge with locked builtin mode, seven-tool allowlist, dedicated per-user conversation, draft-prefill flow — v1.2
- ✓ SDK capability surfaces (`ctx.llm`, `ctx.memory`, `ctx.lessons`, `ctx.schedule`, `ctx.events`) with credential brokering and per-call audit — v1.3
- ✓ Unified permission engine (PDP) at `src/extensions/permission-engine.ts` with in-sandbox `fetch` wrapper, host-mediated `ezcorp/fs.*` reverse-RPC, cross-extension capability intersection on `ezcorp/invoke`, and `manifest.lock.json` integrity gate for bundled extensions — v1.3
- ✓ Four-scope permission modal (session / conversation / project / forever) — v1.3
- ✓ MCP isolation — netns + forward proxy + bearer-token auth + per-host PDP gate via `unshare` + `prlimit` — v1.3
- ✓ Capability expiry — TTL config + always-allow value-shape migration, `runSweep` + `applySweepResult` + manual CLI + race mitigation + audit/event emission, `HostMaintenanceDaemon` with PID lockfile + hourly tick + env-var kill switch, PermissionGate expired branch + ExpiredGrantsBanner + ExpiredReapproveModal + reapprove API — v1.3
- ✓ Audit infrastructure — `redactForAudit` helper at write boundary, `sdk_capability_calls` table for per-call records, `lessons_audit_log` table, per-capability retention sweep, per-extension/per-conversation/global audit drill-downs, in-chat capability event pills with default-on/default-off gating per source — v1.3
- ✓ Library UI — Built-ins / Installed tabs on `/extensions` with audit drill-down at the per-extension level, settings panel for "Audit & Visibility" — v1.3
- ✓ Bundled extension ports — `lessons-distiller` and `memory-extractor` ported onto SDK helpers; legacy `src/runtime/lessons/distiller.ts` and `src/memory/extraction.ts` deleted; `!EZ:distill` route now forwards to the bundled `distill_now` tool. Phase 53.6 boot-spawn fix + reverse-RPC gate hardening landed in closeout. — v1.3
- ✓ Navigation & agent management (Phase 49 carryover from v1.2) — mobile-responsive sidebar drawer, agent fuzzy search with Web Worker offload, marketplace category browsing, visual extension attach picker — v1.3
- ✓ JWT `jti` claim — prevents same-second `sessions.token_hash` UNIQUE collisions; closes a latent prod bug — v1.3
- ✓ PGlite `:memory:` semantic clarity + Vite preview Bun runtime fix + reapprove auth-model documentation — v1.3
- ✓ Multi-select chat turns — shift+click range select, cmd/ctrl-click toggle, bulk Copy/Exclude/Save Memory, e2e coverage (already shipped 2026-04-30, formally closed in v1.3) — v1.3
- ✓ Security backbone hardening — PDP fail-closed on conversation-override lookup failure + TTL cache for PGlite warm-up (SEC-01); structured `logger.error` on audit-write failure (SEC-02); per-conversation `MAX_CALL_DEPTH` via module-scope Map (SEC-03); distinct `PERMISSION_REAPPROVED` action (SEC-04); `^localhost$` regex anchored (SEC-05); PDP wired into appendMessage reverse-RPC ctx (SEC-06 / Claim-1) — v1.4
- ✓ MCP Stage 1 + Stage 2 isolation — DNS-rebind defense via `Bun.dns.lookup` recheck in mcp-proxy (MCP-01); private 64 MB tmpfs `/tmp` in MCP mount namespace (MCP-02); bubblewrap + seccomp BPF in `SCMP_ACT_LOG` mode shipping observability-first (MCP-03); flip to `SCMP_ACT_ERRNO` enforce with `defaultErrnoRet=38` after 7-day soak (MCP-04); per-extension veth-pair on `br-ezcorp-mcp` bridge + nftables egress drop + conntrack/IPv6 guards (MCP-05) — v1.4
- ✓ Per-capability TTL UI — user-chosen TTL override at re-approve persists on `settings` JSONB (additive `ttlOverrideMs?: number`, zero migration); sweep honors override before `TTL_CONFIG[kind]` fallback; banner via `Intl.RelativeTimeFormat` (TTL-01) — v1.4
- ✓ Phase 49 mobile UX deferred items — shared `BottomSheet.svelte` wrapping all 9 pickers at viewport `<lg` (UX-01); marketplace search uses pg_trgm GIN + `ts_rank_cd` hybrid with 6h `gin_clean_pending_list` (UX-02); save-search + pinned-agents in agent picker via settings KV (UX-03); drag-reorder extension chips on agent edit via svelte-dnd-action (UX-04) — v1.4
- ✓ Test debt repair — `api-mocks.ts` audit + 14 additive v1.3 handlers (TEST-01); ~110 stale-locator Playwright specs hardened via data-testid across Phases 59/61/62 (TEST-02); 3 chat-side `test.fixme` flipped active (TEST-03); 10 pre-existing backend failures triaged with verdicts (TEST-04); `MEMORY_INJECTION_ELIGIBILITY_CHANGED.metadata.projectIds` assertion (TEST-05). Plus 2026-05-13 closeout repair pass: −65 backend failures, −16 failing files — v1.4
- ✓ Audit-claim & docs polish — PROJECT.md "Already-landed v1.4 commits" table extended with `b652f2b` + `763d718` per-commit invariant checks (CLAIM-01); `docs/permissions/four-scope-modal.md` corrected + atomic 5-site rename "Allow this time" → "Allow until restart" (DOCS-01) — v1.4

### Active

<!-- v1.5 Hybrid Chat Search — detailed REQ-IDs land in REQUIREMENTS.md after roadmap creation. -->

- [ ] Hybrid chat search backend (pgvector + FTS + RRF) — v1.5
- [ ] Sidebar search mode toggle (Hybrid / Keyword / Semantic) — v1.5
- [ ] Cmd+K command palette overlay — v1.5
- [ ] Embed-on-write outbox + one-shot backfill — v1.5

### Out of Scope

- Mobile native app — web-first, responsive design covers mobile
- Building a proprietary LLM — model agnostic, leverage existing providers
- Enterprise SSO/SAML — not needed for current release
- Real-time collaboration (multiple users editing same agent) — defer to later
- Visual workflow canvas — Flowise/n8n territory, different mental model
- Custom LLM fine-tuning — tiny audience, massive infrastructure scope
- A2A protocol — still evolving, designed for future compatibility
- Monetization / billing — platform economics are separate from core functionality
- Extension auto-updates without consent — self-hosted users need control
- OAuth proxy / undocumented API wrapping — violates provider ToS
- Ez page-context redesign (`fill_form` / `navigate_to` made functional via tool-driven model) — deferred to v1.4; v1.3 is already a foundation milestone, adding ez-context redesign would balloon scope
- `ctx.llm.embed()` SDK surface — memory recall consistency requires single host-side embedder; extensions cannot pick their embedder
- `ctx.llm.stream()` full streaming with backpressure — stub-only in v1.3; deferred to v1.4
- Distributed cron scheduling — single-process today; PID-lockfile detection refuses daemon start if sibling host detected
- Redaction of `tool_calls.input/output` — different threat model + existing observability consumers rely on raw values; tracked as Phase 2 follow-up
- Generic `!EZ:<extName>:<tool>` dispatch — `!EZ:distill` becomes a thin forwarder in v1.3; full dispatch is its own feature

## Context

Shipped v1.4 over ~3 days (2026-05-10 → 2026-05-13), 9 phases (54–62), 45 plans, 46 summaries. All v1.3 closeout debt resolved; 23/23 v1.4 requirements satisfied per `.planning/milestones/v1.4-MILESTONE-AUDIT.md` (verdict: `tech_debt` — no blockers; documented carry-forward items only).

Tech stack: Bun, SvelteKit, Svelte 5, Tailwind CSS 4, PGlite with pgvector, Drizzle ORM.
LLM layer: pi-ai for streaming/completion, pi-agent-core for agent tool loops.
Architecture: Provider abstractions injected into agents, EventBus for real-time updates, WebSocket pub/sub. Permission engine (PDP) gates every capability call; capability expiry sweeps run hourly; MCP servers isolated via netns veth-pair + nftables egress drop + seccomp `SCMP_ACT_ERRNO` enforce + bearer-token proxy with DNS-rebind defense; per-capability TTL UI on settings page.
Deployment: Docker (oven/bun:1-slim) with named volume for PGlite persistence.
Local embeddings via Transformers.js (all-MiniLM-L6-v2, 384-dim).

Known tech debt carried into v1.5+ (5 categories):
- **MCP-integration test trio** (`af1-mcp-sandbox-regression`, `mcp-api-routes`, `mcp-e2e`) — reclassified 2026-05-13 from Bun-segfault deferred to functional MCP stdio spawn-envelope / refresh / tool-execution failures on current Bun 1.3.11. Needs MCP client wrapper debugging.
- **Playwright auth-fixture infrastructure** — unblocks SEC-06 e2e + UX-01..04 e2e flows currently held at `test.fixme`.
- **`mock-cleanup.ts MODULE_PATHS` widening** (Phase-59-04 verdict #4) — closes 3 wrapper false-positives at `scripts/test.sh PARALLEL=6`. All pass in isolation.
- **Infrastructure-only operator verifications** — bwrap-on-NixOS for Phase 55 MCP-02; iOS home-indicator visual clearance for Phase 57 UX-01; 24h CAP_NET_ADMIN conntrack soak for Phase 58 MCP-05. Each has unit/integration proxy coverage.
- **agent-detail.spec.ts:178** strict-mode collision (pre-existing; documented in 62-02-SUMMARY).

## Constraints

- **Runtime**: Bun — all server-side code runs on Bun, not Node.js
- **Self-hosted first**: Must work as a self-hosted deployment; cloud is secondary
- **Model agnostic**: No hard dependency on any single LLM provider
- **Existing architecture**: Build on EZCorp's plugin system, don't replace it
- **No external HTTP frameworks**: Use Bun.serve() and SvelteKit, not Express

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Self-hosted first, cloud optional | Users own their data and infrastructure | ✓ Good — Docker deployment works, no external deps |
| Agents = personas, Extensions = apps | Clear mental model for two types of buildable things | ✓ Good — dual creation path works well |
| Dual creation path (NL + structured) | Serves both technical and non-technical users equally | ✓ Good — meta-agent NL creation implemented |
| Build on EZCorp harness | Existing architecture is solid foundation, avoid rewrite | ✓ Good — plugin system extended cleanly |
| Model agnostic with smart routing | No vendor lock-in, system optimizes model selection | ✓ Good — tier routing with fallback chains |
| PGlite with pgvector | Self-hosted requires embedded DB with vector support | ✓ Good — local embeddings + hybrid search working |
| Transformers.js for embeddings | No external API calls needed for self-hosted | ✓ Good — ~50ms warm latency, 384-dim vectors |
| Zero-dependency JWT | Avoid auth library bloat, Web Crypto API sufficient | ✓ Good — HMAC-SHA256 with auto-generated secrets |
| MCP for extensions | Standard protocol, future-proof for tool ecosystem | ✓ Good — JSON-RPC 2.0 over stdio working |
| Reference model sharing | Owner edits propagate to all team members | ✓ Good — agent_shares junction table |
| Pi-Mono migration | Battle-tested multi-provider streaming vs hand-rolled | ✓ Good — deleted ~1000 LOC of manual HTTP+SSE code |
| Dot notation tool namespacing | packageName.toolName matching MCP convention | ✓ Good — no collisions across packages |
| TypeScript extension config | Type safety and IDE autocomplete for extension authors | ✓ Good — defineExtension/loadManifest pattern adopted |
| Zod 4 for API validation | Co-located schemas with safeParse + structured errors | ✓ Good — consistent validation across all routes |
| BroadcastChannel for OAuth | Cross-tab notification without server round-trip | ✓ Good — popup-to-opener flow works cleanly |
| DB-level rate limiting for flags | Timestamp query vs in-memory Map for flag rate limits | ✓ Good — survives server restarts |
| PDP-centric permission model | Single decision point for all capability calls vs scattered checks | ✓ Good (v1.3) — `permission-engine.ts` is the integrity gate; manifest.lock.json prevents drift |
| Capability expiry via host-maintenance daemon | Hourly sweep with PID lockfile vs per-call TTL checks | ✓ Good (v1.3) — pattern reused from Phase 51 cron daemon, low overhead, env-var kill switch |
| MCP isolation via unshare + bearer-token proxy | User/mount namespace + prlimit + per-host PDP gate vs full netns | ⚠️ Acceptable (v1.3) — full kernel-level network isolation deferred; today's defense-in-depth is good enough for self-hosted single-tenant |
| Bundled extensions on the public SDK | Built-ins eat their own dogfood vs hand-rolled host code | ✓ Good (v1.3) — Phase 53 ported lessons-distiller + memory-extractor; legacy paths deleted; auto-trigger flow surfaced + fixed |
| Reverse-RPC gate via conversation_extensions wiring | Event-driven invocations consult dispatcher's wiring source vs strict currentConversationId | ✓ Good (v1.3 closeout) — fixed silently-failing auto-trigger flow that Phase 53.6 missed |
| JWT `jti` claim for token uniqueness | Random 16-byte per-call vs relying on iat-second resolution | ✓ Good (v1.3 closeout) — closes latent same-second sessions.token_hash UNIQUE collision |
| Manifest-lock CI gate | `--check` flag prevents manifest drift vs trust-on-first-use | ✓ Good (v1.3) — pinned `manifest.lock.json` is part of the integrity gate the PDP relies on |

---
*Last updated: 2026-05-20 — v1.5 Hybrid Chat Search milestone opened*
