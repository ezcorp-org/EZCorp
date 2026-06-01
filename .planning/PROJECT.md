# EZCorp - AI Platform

## What This Is

A self-hosted AI platform where anyone can chat with AI models using persistent memory, build agent personas and extensions, and share them through a marketplace or within teams. As of v1.3, the platform has a unified permission engine (PDP) that gates every capability call, automatic capability expiry with user-facing re-approval, and end-to-end audit visibility across in-chat pills, per-conversation drill-downs, per-extension audit pages, and a global admin `/audit` page. Built-in features (lessons distiller, memory extractor) run as bundled extensions on the same SDK that third-party authors use, proving the SDK is dogfood-complete. Built on pi-ai and pi-agent-core for battle-tested multi-provider streaming.

## Core Value

Anyone can sit down, chat with persistent memory, find agent apps others built, and create their own — the full loop from user to builder in one product, with full visibility and control over what every extension can do.

## Current State

**Shipped:** v1.5 Hybrid Chat Search (2026-06-01).

v1.5 layered semantic (pgvector/HNSW) recall alongside the existing lexical (Postgres FTS) precision so every past chat is findable instantly — additive-only. A transactional embed-on-write pipeline (token-aware chunker → `message_embed_outbox` → background `EmbedWorker` on the HostMaintenanceDaemon pattern) keeps `message_chunks` current without ever blocking the chat path; a single-CTE Reciprocal-Rank-Fusion query (`searchMessages()`, k=60, in-CTE tenant scoping verified inside the HNSW scan) powers one `GET /api/search/messages` endpoint consumed by both the sidebar Hybrid/Keyword/Semantic toggle and a new Cmd+K global command palette, each deep-linking to the matching message with a highlight pulse. An operator backfill CLI (`scripts/backfill-embeddings.ts`, resumable + idempotent + throttled + post-batch ANALYZE) and a read-only admin embedding-progress surface index existing history and expose backlog/coverage. 35/35 requirements satisfied; audit verdict `tech_debt` (no blockers).

**Shipped earlier:** v1.4 Trust Hardening & v1.3 Closeout (2026-05-13) — closed six v1.3 security-review findings, hardened MCP isolation end-to-end (DNS-rebind defense, private tmpfs, seccomp enforce, veth-pair + nftables egress drop), per-capability TTL UI, Phase 49 mobile UX, ~110 stale-locator e2e repairs. v1.3 Security & Permissions (2026-05-09) — the platform's security backbone (unified PDP, capability expiry sweeps, MCP isolation, audit infrastructure) with first-party built-ins shipping as bundled extensions on the public SDK.

## Next Milestone

**TBD** — start with `/gsd:new-milestone` (questioning → research → requirements → roadmap). v1.5 deferred candidates that may seed it: ranking tuning (project-boost/recency-decay RRF coefficients — RANK-01), search-snippet polish (`MentionText` rendering, backfill toast, role badges — POLISH-01..04), and carry-forward test-infra debt (BUN-01 MCP-subprocess trio, Playwright auth fixtures, cross-file mock leak).

<details>
<summary>Previous milestone — v1.5 Hybrid Chat Search (archived)</summary>

**Goal:** Make every past chat findable instantly — add semantic (pgvector) recall alongside the existing lexical (Postgres FTS) precision, surfaced through the sidebar search box and a new Cmd+K palette.

**Delivered:** Indexing primitives (`message_chunks` HNSW + `message_embed_outbox`, token-aware chunker, transactional eligibility-gated outbox enqueue, IDX-06 truncation fix); embed-on-write worker (degraded gate, backoff, boot recovery, kill-switch); hybrid search SQL + `GET /api/search/messages` (RRF k=60, match-type tagging, degraded→keyword fallback); sidebar mode toggle + deep-link; Cmd+K palette (Cmd+Shift+P rebind, cross-project grouping, a11y, mobile BottomSheet); backfill CLI + admin embed-progress. Full detail: `.planning/milestones/v1.5-ROADMAP.md`.

</details>

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
- ✓ Indexing primitives — `message_chunks` (vector(384), HNSW, denormalized `conversation_id`, `ON DELETE CASCADE`) + `message_embed_outbox` tables; token-aware chat chunker (256/32-overlap); transactional role-gated outbox enqueue in `createMessage`/`updateMessageContent`; `EMBEDDING_MODEL_ID` SoT; IDX-06 input-truncation fix via `tokenizer.model_max_length` (IDX-01..07) — v1.5
- ✓ Embed-on-write worker — background `message_embed_outbox` drainer (HostMaintenanceDaemon pattern): subquery-UPDATE batch claim, sequential embed, degraded-mode gate, exponential backoff + max-attempts cap, boot stale-lock recovery, `EZCORP_DISABLE_EMBED_WORKER` kill-switch (ING-01..05) — v1.5
- ✓ Hybrid search SQL + API — `searchMessages()` single-CTE RRF (k=60) fusing FTS + pgvector with in-CTE tenant scoping (filter inside HNSW scan, EXPLAIN-verified on pgvector 0.8.0), match-type tagging, snippet asymmetry, behind `GET /api/search/messages` (hybrid/keyword/semantic + server-owned degraded→keyword fallback) (SRCH-01..08) — v1.5
- ✓ Sidebar search mode toggle — Hybrid/Keyword/Semantic on `ConversationList.svelte` (Hybrid default) with global localStorage persistence, grouped results, `?m=` deep-link reactively consumed by `ChatThread` (scroll + highlight pulse), existing debounce/min-length/title-match/scoping preserved (UI-01..04) — v1.5
- ✓ Cmd+K command palette search — global search palette extending `CommandPalette.svelte` (Cmd+Shift+P rebind via shortcut registry), cross-project `scope=all` grouped results, match-type icons, cross-project deep-link, ARIA-dialog/focus-trap a11y, mobile `BottomSheet` fallback (PAL-01..07) — v1.5
- ✓ Backfill + operations — resumable idempotent `scripts/backfill-embeddings.ts` (gaps-only paced enqueue, `--status`/`--dry-run`/`--refresh-stale`, worker-down warn), self-limiting post-drain `ANALYZE message_chunks`, read-only admin embed-progress (`GET /api/admin/embed-progress` + dashboard card) (OPS-01..04) — v1.5

### Active

<!-- Next milestone TBD — REQ-IDs land in a fresh REQUIREMENTS.md after `/gsd:new-milestone`. -->

_None — between milestones. v1.5 shipped 2026-06-01. Candidate seeds for the next milestone: ranking tuning (RANK-01/02), search-snippet polish (POLISH-01..04), carry-forward test-infra debt._

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

Shipped v1.5 over ~3 days (2026-05-29 → 2026-06-01), 6 phases (63–68), 24 plans. 35/35 requirements satisfied per `.planning/milestones/v1.5-MILESTONE-AUDIT.md` (verdict: `tech_debt` — no blockers; human-verification + Nyquist-validation items tracked). Prior: v1.4 (2026-05-13, 9 phases, 23/23 reqs).

Tech stack: Bun, SvelteKit, Svelte 5, Tailwind CSS 4, PGlite with pgvector (≥0.8.0), Drizzle ORM.
LLM layer: pi-ai for streaming/completion, pi-agent-core for agent tool loops.
Architecture: Provider abstractions injected into agents, EventBus for real-time updates, WebSocket pub/sub. Permission engine (PDP) gates every capability call; capability expiry sweeps run hourly; MCP servers isolated via netns veth-pair + nftables egress drop + seccomp `SCMP_ACT_ERRNO` enforce + bearer-token proxy with DNS-rebind defense. **Hybrid chat search (v1.5):** token-aware chunker → `message_embed_outbox` → background `EmbedWorker` (HostMaintenanceDaemon pattern) keeps `message_chunks` (HNSW) current off the chat hot path; `searchMessages()` single-CTE RRF (k=60) fuses FTS + pgvector behind one `GET /api/search/messages` endpoint serving both the sidebar toggle and the Cmd+K palette.
Deployment: Docker (oven/bun:1-slim) with named volume for PGlite persistence.
Local embeddings via Transformers.js (all-MiniLM-L6-v2, 384-dim).

Known tech debt carried into v1.6+ :
- **BUN-01 subprocess/MCP test category** — `*/e2e-server-pipeline.test.ts`, `af1-mcp-sandbox-regression`, `mcp-api-routes`, `mcp-e2e`, `reliability-e2e`, `ws-reconnect-integration` fail in the local NixOS dev env (no sandbox caps / subprocess spawn). Authoritative gate is CI; needs MCP client wrapper + sandbox-env debugging.
- **Coverage gate local↔CI divergence** — `bun run test:coverage` shows ~68 per-file violations locally because the BUN-01 subprocess tests crash (dropping example-extension/route coverage) and the search route/`message-search.ts` get coverage only from the node-vitest + route legs CI runs. Zero v1.5 files affected. Authoritative gate = CI (`release-sdk.yml` + `ci.yml` node-22 job).
- **Cross-file mock leak** — `author-install.test.ts` + `installer-idempotent-local.test.ts` produce 7 failures only when co-run in one bun process (`installImpl` mock leak); pass alone.
- **Playwright auth-fixture infrastructure** — unblocks SEC-06 + UX e2e flows held at `test.fixme` (carry-forward from v1.4).
- **Nyquist validation** — v1.5 phases 63–68 have VALIDATION.md scaffolds but none marked fully `nyquist_compliant`; phases shipped with substantive unit/integration/e2e coverage.
- **Infrastructure-only operator verifications** (v1.4 carry-forward) — bwrap-on-NixOS (MCP-02), iOS home-indicator clearance (UX-01), 24h conntrack soak (MCP-05); plus v1.5 human-verify items (Cmd+Shift+P private-window, admin embed card, backfill→drain parity).

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
| HNSW (not ivfflat) for `message_chunks` | Better recall/latency at chat-corpus scale, no training step | ✓ Good (v1.5) — verified live; tenant filter applies inside the HNSW scan on pgvector 0.8.0 |
| Embed-on-write outbox + background worker | Decouple embedding from the chat finalize path vs inline embed | ✓ Good (v1.5) — first transactional outbox in the codebase; chat path never blocks on the embedder |
| RRF (k=60) for hybrid fusion | Rank-based fusion needs no score normalization across FTS+vector | ✓ Good (v1.5) — single-CTE query; NDCG tuning deferred to RANK-01 (no labeled corpus yet) |
| One `/api/search/messages` endpoint for both surfaces | Sidebar + Cmd+K palette share one contract vs parallel components | ✓ Good (v1.5) — `MessageSearchHit` consumed identically; palette extends `CommandPalette.svelte` |
| Self-limiting post-drain `ANALYZE` | Refresh planner stats after backfill (no autovacuum under PGlite) | ✓ Good (v1.5) — gated on backlog==0 after a non-empty drain, not every-N |

---
*Last updated: 2026-06-01 — after v1.5 Hybrid Chat Search milestone (shipped)*
