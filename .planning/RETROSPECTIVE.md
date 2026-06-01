# Retrospective

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-10
**Phases:** 11 | **Plans:** 42

### What Was Built

- Streaming multi-model chat with conversation persistence, branching, search, and export
- Automatic memory extraction with hybrid retrieval (vector + keyword) and context injection
- Knowledge base with file upload, RAG chunking, and citation display
- Smart model routing with BYOK, circuit breakers, fallback chains, and tier-based selection
- Dual-path agent creation (natural language + structured editor) with persona chat
- Agent extensions via MCP with sandbox testing, observability, and permission model
- Team sharing with auth, RBAC, and agent sharing across organizations
- Public marketplace with publishing, discovery, installation, ratings, and versioning
- Docker deployment with PGlite persistence

### What Worked

- **Wave-based parallelization** within phases — independent plans executed simultaneously, cutting phase time significantly
- **Risk-front-loading** — memory (hardest subsystem) done in Phases 3-4, before agent creation amplified flaws
- **Fine granularity** — 42 plans across 11 phases gave tight feedback loops and clean commits
- **Existing foundation leverage** — Pi harness, EventBus, settings store, agent config all saved significant effort
- **GSD workflow** — structured planning → execution → verification caught issues early (Phases 10-11 gap closure)
- **3-day timeline** — aggressive execution velocity averaging ~5min per plan

### What Was Inefficient

- **Verification gaps** — Phases 1-7 lacked formal VERIFICATION.md files, requiring Phases 10-11 to retroactively verify 12 requirements
- **SUMMARY format inconsistency** — earlier phases used different frontmatter than later ones, making automated extraction harder
- **STATE.md drift** — performance metrics and current focus got stale as execution outpaced updates
- **Nyquist partial compliance** — only 2/11 phases fully Nyquist-compliant; validation was treated as optional

### Patterns Established

- `Phase N (verified Phase M)` traceability format for retroactive verification
- `toVectorLiteral` pattern for safe SQL vector literal construction
- Dynamic imports for optional heavy dependencies (ML libraries in executor)
- Zero-dependency JWT via Web Crypto API
- Reference model sharing via junction tables
- MCP JSON-RPC 2.0 over stdio for extension communication

### Key Lessons

1. **Verify as you go** — retroactive verification (Phases 10-11) cost 4 extra plans. Inline verification per phase would have been free
2. **Audit before shipping** — the milestone audit caught 12 unverified requirements that would have shipped without formal proof
3. **SUMMARY frontmatter matters** — consistent `requirements-completed` fields enable automated traceability checking
4. **PGlite + pgvector works** — embedded Postgres with vector search is viable for self-hosted AI apps, ~50ms warm embedding latency
5. **MCP in Bun works** — Bun.spawn with explicit env isolation provides clean subprocess sandboxing for extensions

### Cost Observations

- Model mix: primarily opus for planning/execution, sonnet for verification agents
- Sessions: ~15-20 across 3 days
- Notable: 42 plans in 3 days demonstrates high throughput with structured workflow

---

## Milestone: v1.1 — Polish & Extensions

**Shipped:** 2026-03-15
**Phases:** 19 | **Plans:** 49

### What Was Built

- Rich extension system — multi-component manifests, git install, dependency resolution, cross-extension composition, TypeScript config
- OAuth provider auth — PKCE flows for OpenAI/Gemini, BYOK fallback for Anthropic, provider connection dashboard
- Pi-Mono migration — replaced hand-rolled LLM/agent code with pi-ai and pi-agent-core packages
- Polished UX — dark/light mode, keyboard shortcuts, streaming indicators, message toolbar, command palette, toast notifications
- Extension SDK & CLI (init/dev/test/publish) with TypeScript type definitions and showcase examples
- Security hardening — rate limiting, Zod validation, API keys with scopes, resource quotas, scope enforcement on all routes
- Marketplace moderation — flagging workflow with threshold, listing deletion, agent sharing
- Reliability — WebSocket reconnection, embedding degraded mode, health endpoint
- Project renamed from Pi to EZCorp across entire codebase

### What Worked

- **Audit-driven gap closure** — milestone audit caught 3 gaps (flag threshold, quota wiring, bookkeeping), which were closed in Phases 29-30 before shipping
- **Phase velocity** — 49 plans in 2 days (~5 min average per plan), matching v1.0 throughput
- **Parallel phase execution** — independent subsystems (OAuth vs UX vs extensions) enabled concurrent development
- **Consistent verification** — every phase had VERIFICATION.md, catching issues inline instead of retroactively
- **GSD workflow maturity** — structured planning with research → plan → execute → verify pipeline was smooth
- **Mock pattern standardization** — shared mock-pi-ai.ts helper eliminated duplication across 15+ test files

### What Was Inefficient

- **Nyquist compliance** — only 1/18 phases fully Nyquist-compliant despite having VALIDATION.md files; still treated as optional
- **Traceability table drift** — 11 requirements showed "Planned" in traceability table despite being complete; audit caught this
- **SUMMARY frontmatter gaps** — REL-03/REL-04 missing from SUMMARY requirements-completed despite being verified
- **Orphan directory** — stale `17-provider-connection-ui/` directory left behind after phase renumbering
- **7 gap closure plans** across Phase 17 — pi-mono migration required more cleanup passes than expected

### Patterns Established

- `defineExtension()` + `loadManifest()` for typed TypeScript extension manifests
- `safeParse` + `validationError` co-located schema pattern for API validation
- `requireScope(locals, scope)` as first line of API handlers for scope enforcement
- `BroadcastChannel` for cross-tab OAuth notification
- `buildHealthResponse()` shared helper for testable health checks
- DB-level rate limiting via timestamp queries (survives restarts)
- Replicated-logic test pattern to avoid Svelte rune import side effects

### Key Lessons

1. **Audit before milestone** — the audit process caught real issues (quota enforcement not wired, flag threshold wrong) that would have shipped broken
2. **Migration phases need buffer** — Pi-Mono migration (Phase 17) needed 7 plans including 4 gap closure plans; plan for migration cleanup
3. **Bookkeeping matters** — traceability table drift and SUMMARY frontmatter gaps indicate manual tracking needs better tooling
4. **Nyquist needs enforcement** — two milestones in and still partial compliance; either enforce it or drop it
5. **Rename early** — Phase 23 rename touched 28 files; doing it later in the milestone meant more files to update

### Cost Observations

- Model mix: primarily opus for planning/execution, sonnet/haiku for verification and research agents
- Sessions: ~10-15 across 2 days
- Notable: 19 phases in 2 days with full audit and gap closure demonstrates workflow scalability

---

## Milestone: v1.3 — Security & Permissions

**Shipped:** 2026-05-09
**Phases:** 11 (49–53 + Unified Permissions 1–7 + Capability Expiry A–D + Post-perm Cleanup + Lessons Keeper v1+v1.5 + Multi-select chat turns + v1.3 Closeout PR)
**Plans:** N/A (work bypassed GSD per-phase planning; tracked via `tasks/v1.3-phase-*.md` spec docs)

### What Was Built

- **Unified Permission System (Phases 1–7)** — central PDP at `src/extensions/permission-engine.ts`, in-sandbox `fetch` wrapper, host-mediated `ezcorp/fs.*` reverse-RPC, cross-extension capability intersection on `ezcorp/invoke`, `manifest.lock.json` integrity gate, four-scope permission modal, MCP isolation via `unshare` + bearer-token proxy + per-host PDP gate
- **Capability Expiry Milestone (A–D)** — TTL config + always-allow value-shape migration, sweep core with race mitigation + audit emission, `HostMaintenanceDaemon` with PID lockfile + hourly tick + env-var kill switch, PermissionGate expired branch + ExpiredGrantsBanner + ExpiredReapproveModal + reapprove API
- **Bundled Extension Ports (Phase 53 + 53.6 + Stage 2)** — `lessons-distiller` + `memory-extractor` ported onto Phase 51 SDK helpers; legacy `src/memory/extraction.ts` deleted; subprocess boot-spawn fixed; reverse-RPC gate hardened to consult `conversation_extensions` wiring for event-driven invocations
- **Audit & Visibility (Phase 50) + Library Audit UI (Phase 52)** — capability event pills in chat, per-conversation audit drill-down, per-extension audit page, global `/audit` admin page with 24h stats strip, settings panel for "Audit & Visibility", Library Built-ins / Installed split with audit drill-down
- **Navigation & Agent Management (Phase 49 — v1.2 carryover)** — mobile-responsive sidebar drawer, agent fuzzy search with Web Worker offload, marketplace category browsing, visual extension attach picker
- **SDK Capabilities + Cron Daemon (Phase 51)** — schedule daemon for `ctx.schedule` with PID lockfile, jitter on catch-up fires, missed-run policies, crash-mid-fire reaping, TZ-aware cron
- **v1.3 Closeout PR** — PGlite `:memory:` semantic fix, Vite preview Bun runner, reapprove auth-model documentation, tool-call-hydration mock, c2-session-revocation mock pollution, JWT `jti` claim closing latent same-second `sessions.token_hash` collision

### What Worked

- **Parallel-session worktrees** — Phase 53, Phase 53.6, Stage 2, v1.4 memory-injection-eligibility, and v1.3 closeout all progressed in independent worktrees. Real-time merge + rebase coordination kept main moving.
- **Validator-driven discovery** — Code reviewer + nyquist auditor on Phase 53 surfaced two critical issues (broken auto-trigger reverse-RPC + Ollama model nomenclature) that the build session missed. Fix-loop closed both before merge.
- **Backfilled roadmap from observable state** — Earlier v1.3 work shipped without a tracked roadmap; the 2026-05-08 backfill from `tasks/` spec docs + commit log gave enough structure to audit and complete the milestone without losing fidelity.
- **Atomic commits** — Every closeout fix landed as its own conventional-commit commit, making the audit trivial (cite SHA + diff stat).
- **Sacred stash invariant** — Stash count of 11 preserved throughout the entire v1.3 work + closeout + audit + completion. Repeated explicit prohibitions in sub-agent briefs prevented prior-incident-style destruction.
- **Permission engine as integrity gate** — Centralizing the PDP made the manifest.lock.json + capability expiry + reverse-RPC gate hardening all natural extensions of one well-understood model rather than scattered checks.

### What Was Inefficient

- **Skipped GSD per-phase artifacts** — `.planning/phases/` only has v1.2 dirs (31–48); v1.3 work bypassed SUMMARY/VERIFICATION/VALIDATION. `/gsd:audit-milestone` framework couldn't run as designed; manual audit was needed. Either adopt GSD per-phase artifacts for v1.4+ or accept that the framework requires manual execution.
- **Validator HEAD staleness** — Both code reviewer and nyquist auditor produced reports against an OLD HEAD (`6875600`); the parallel session shipped 3 commits during validation, advancing HEAD to `849bd5d`. Reviewer's "Phase 53.5 Stage 2 not shipped" was stale by the time I read it. Fix: validators should rev-parse HEAD and pin to it.
- **Auditor confusion on Ollama models** — Coverage auditor flagged `gemma4:e2b` etc. as "fictional" based on Ollama's public library, not the user's local install. Fix-loop swapped them, breaking the user's setup. Reverted as separate commit. Lesson: validators should not make environment-dependent claims without verifying the deployment target.
- **Coordination via merge race** — Three times during v1.3 the parallel session shipped to main while my work was in progress, requiring rebase. Worked, but cost extra cycles. A simple "who's merging next" channel would help.
- **No v1.3-REQUIREMENTS.md** — Backfilled milestones can't do 3-source cross-reference (REQUIREMENTS + VERIFICATION + SUMMARY). Audits become "verify against git" which is fine for shipped work but loses the upfront-requirements discipline that v1.0/v1.1 had.

### Patterns Established

- **Reverse-RPC gate consults wiring source** — for event-driven invocations, the gate uses the same `conversation_extensions` wiring the dispatcher uses, NOT `currentConversationId`. The latter is right for synchronous tool calls, wrong for event fan-out.
- **`manifest.lock.json` as integrity gate** — every bundled extension's permissions are pinned in lockfile; CI gate (`--check`) prevents drift; PDP relies on this.
- **`HostMaintenanceDaemon` pattern** (from Phase 51 cron daemon) reused for capability expiry sweep — PID lockfile, hourly tick, env-var kill switch, jitter on catch-up.
- **Backfilled roadmap from observable state** — when work has shipped without upfront tracking, reconstruct from `tasks/` spec docs + commit log. Documented as legitimate path in the audit.
- **JWT `jti` claim** — every signed token gets 16 random bytes; defends against same-second `token_hash` collisions on the sessions table.
- **Closeout PR pattern** — single feature branch with N atomic commits closing the explicit roadmap "outstanding" list, ff-merged, no /feature-team overhead for mechanical fixes.
- **Sacred stash protection** — verbatim prohibition in every sub-agent brief + Stop hook backstop + before/after stash count verification. Two prior incidents stayed contained.

### Key Lessons

1. **Coverage audit ≠ correctness audit.** Phase 53 coverage was "100% behavioral coverage substantially met for the SHIPPED scope" but the tests were asserting the WRONG thing — they verified notification delivery, not RPC round-trip. The bug was invisible to a coverage-mapping audit because the missing test was for an interaction the test suite didn't model. Lesson: validators should consider "what's the loadbearing user-visible behavior" and test for it explicitly, not just count covered code paths.
2. **Validators must pin HEAD.** Concurrent merges during validation led to "should-fix" recommendations against stale state. `git rev-parse HEAD` at validation start, report against that SHA explicitly.
3. **Environment-dependent recommendations are dangerous.** The Ollama model swap was made on a wrong premise. Validators that touch external system state (model names, file paths in production data) need to verify the actual deployment target.
4. **Tracking-by-`tasks/` is sustainable for short milestones.** v1.3 shipped in 3 days with 184 commits and the `tasks/v1.3-phase-*.md` pattern was sufficient. For multi-week milestones, the GSD per-phase pipeline likely pays for itself; for sprints, the lighter-weight approach works.
5. **Atomic commits compound.** Every fix in the closeout PR (PGlite, Vite preview, reapprove doc, hydration mock, mock pollution, JWT, triage doc) is independently revertable. Bisecting any future regression is trivial.

### Cost Observations

- Model mix: primarily opus (build, audit, fix-loop), sonnet (validators, integration smoke)
- Sessions: ~6 across 3 days (Phase 53 build/validate/fix/merge, then v1.3 closeout build/verify/merge, then audit + completion)
- Notable: 184 commits in 3 days at ~3-5 minutes per commit average. Parallel-session worktrees + atomic commits delivered v1.3 substantially faster than v1.2's 17 phases / 58 plans / 7 weeks.

---

## Milestone: v1.5 — Hybrid Chat Search

**Shipped:** 2026-06-01
**Phases:** 6 (63–68) | **Plans:** 24

### What Was Built
Semantic (pgvector/HNSW) recall layered onto the existing lexical (FTS) search, additive-only: indexing primitives (`message_chunks` + `message_embed_outbox`, token-aware chunker, transactional eligibility-gated outbox enqueue, IDX-06 truncation fix) → embed-on-write `EmbedWorker` (degraded gate, backoff, boot recovery, kill-switch) → `searchMessages()` single-CTE RRF (k=60) behind `GET /api/search/messages` → sidebar mode toggle + deep-link, Cmd+K palette (Cmd+Shift+P rebind, cross-project grouping, a11y, mobile BottomSheet), backfill CLI + admin embed-progress.

### What Worked
- **Unanimous build order from research** (schema → worker → search → UI∥backfill) meant zero phase-dependency rework; phases 66/67/68 ran genuinely parallel on one endpoint contract.
- **Reintroduced upfront `REQUIREMENTS.md`** (35 IDs, 1:1 phase mapping) recovered the 3-source cross-reference the v1.3 retrospective flagged as lost — the milestone audit scored 35/35 cleanly.
- **Single endpoint for two surfaces** (`MessageSearchHit` shared by sidebar + palette) avoided contract drift; the integration checker confirmed 0 orphaned exports.
- **Live-probing assumptions** caught two research errors before they shipped (pgvector needs the `iterative_scan` GUC; HNSW not ivfflat).

### What Was Inefficient
- **Verification missed two real regressions** that the milestone audit later caught: the chat-index deep-link `messageId` drop (type-safe, so svelte-check stayed green) and the IDX-06 tokenizer NPE in a *sibling* embeddings test the phase-63 verifier never ran. Per-phase verification reads its own new test file; cross-file/sibling-route blast radius slips through.
- **Coverage gate is not locally reproducible** — the BUN-01 subprocess tests crash in the dev env, inflating the gate to 68 false violations. Time was spent re-confirming "is this us?" (it wasn't).

### Patterns Established
- **First transactional outbox in the codebase** (`db.transaction()` wrapping message-insert + eligibility-gated enqueue) — reusable for any future write-triggered async work.
- **HostMaintenanceDaemon pattern reused** for the EmbedWorker (3rd consumer after cron + capability-expiry sweep).
- **Audit-then-cleanup-then-complete** as an explicit milestone closeout flow: the audit surfaced gaps, a sub-agent-per-task cleanup pass closed the cheap ones, then completion.

### Key Lessons
- A passed per-phase VERIFICATION ≠ a green milestone. **Always run the integration checker + a real coverage/test sweep at milestone close** — both found defects the phase gates missed.
- Type-safe signature narrowing (`(id) =>` where `(id, msgId?)` is expected) silently drops args with no compiler error. Worth a lint rule for callback props.
- When a shared mock's shape changes (IDX-06 added `tokenizer.model_max_length`), grep ALL files mocking that module, not just the one the plan touches.

### Cost Observations
- Model mix: opus (build, audit, fix), sonnet (integration checker)
- Sessions: ~4–5 across 3 days (build phases 63–68, then audit + cleanup + completion)
- Notable: smallest milestone since v1.0 (6 phases) and the cleanest requirements story (35/35, no carry-forward feature debt) — tight scope + upfront requirements paid off.

---

## Cross-Milestone Trends

| Metric | v1.0 | v1.1 | v1.2 | v1.3 | v1.4 | v1.5 |
|--------|------|------|------|------|------|------|
| Phases | 11 | 19 | 17 | 11 | 9 | 6 |
| Plans | 42 | 49 | 58 | N/A (no GSD per-phase) | 45 | 24 |
| Timeline | 3 days | 2 days | ~7 weeks | ~3 days | ~3 days | ~3 days |
| Avg plan duration | ~5 min | ~5 min | longer (multi-week) | N/A | ~5 min | ~5 min |
| Requirements | 50/50 | 61/61 | 78/86 (8 carried to v1.3) | no formal req tracking | 23/23 | 35/35 |
| Gap closure phases | 2 | 3 | 3 (45/46/47) | 1 (closeout PR) | 3 (59/61/62) | 0 (post-audit cleanup, no new phase) |
| Tech debt items | 1 | 5 | 3 | 4 categories (incl. ~8 unrelated test fails) | 6 | 4 (3 carry-forward + 1 new mock-leak) |
| LOC delta | ~46,125 | ~62,095 | not measured | +90,483 / −6,589 | not measured | +19,459 / −537 |
| Commits | not tracked | not tracked | 512 | 184 | not tracked | ~30 (phases) |

**Trend observations:**
- v1.3 shipped fewer phases (11 vs v1.2's 17) but more LOC delta in less time — driven by parallel-session worktrees and the "many small phases tracked via spec docs" pattern.
- **Requirements tracking recovered:** v1.4 (23/23) and v1.5 (35/35) restored the upfront `REQUIREMENTS.md` + 3-source cross-reference that v1.3 lost. Both audited cleanly. Keep this.
- Gap closure pattern is stable but **shrinking**: v1.5 needed no gap-closure phase — the audit + a same-session sub-agent cleanup pass sufficed. Tighter scope (6 phases) correlates with fewer late-discovered issues.
- **New recurring lesson (v1.5):** per-phase verification misses cross-file/sibling blast radius; the milestone-level integration checker + coverage sweep is where those surface. Budget for it explicitly at every close.
