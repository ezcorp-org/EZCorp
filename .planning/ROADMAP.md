# Roadmap: EZCorp AI Platform

## Milestones

- ✅ **v1.0 MVP** — Phases 1-11 (shipped 2026-03-10)
- ✅ **v1.1 Polish & Extensions** — Phases 12-30 (shipped 2026-03-15)
- ✅ **v1.2 Textbox Shortcuts & Better Extensions** — Phases 31-48 (shipped 2026-05-06)
- ✅ **v1.3 Security & Permissions** — Phases 49-53 + parallel tracks (shipped 2026-05-09)
- ✅ **v1.4 Trust Hardening & v1.3 Closeout** — Phases 54-62 (shipped 2026-05-13)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-11) — SHIPPED 2026-03-10</summary>

- [x] Phase 1: Chat Foundation (2/2 plans) — completed 2026-03-08
- [x] Phase 2: Chat Completion (4/4 plans) — completed 2026-03-08
- [x] Phase 3: Memory Core (3/3 plans) — completed 2026-03-08
- [x] Phase 4: Memory Management & Knowledge Base (4/4 plans) — completed 2026-03-09
- [x] Phase 5: Model Routing (3/3 plans) — completed 2026-03-09
- [x] Phase 6: Agent Personas (4/4 plans) — completed 2026-03-10
- [x] Phase 7: Agent Tooling & Extensions (6/6 plans) — completed 2026-03-10
- [x] Phase 8: Team Sharing (6/6 plans) — completed 2026-03-10
- [x] Phase 9: Marketplace (3/3 plans) — completed 2026-03-10
- [x] Phase 10: Agent Personas Gap Closure (3/3 plans) — completed 2026-03-10
- [x] Phase 11: Retroactive Verification & Tech Debt (4/4 plans) — completed 2026-03-10

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Polish & Extensions (Phases 12-30) — SHIPPED 2026-03-15</summary>

- [x] Phase 12: Extension Manifest v2 (3/3 plans) — completed 2026-03-10
- [x] Phase 13: Git Installation & Versioning (2/2 plans) — completed 2026-03-11
- [x] Phase 14: Extension Dependencies & Composition (2/2 plans) — completed 2026-03-11
- [x] Phase 15: Extension Security Hardening (3/3 plans) — completed 2026-03-11
- [x] Phase 16: OAuth Subscription Access (3/3 plans) — completed 2026-03-12
- [x] Phase 17: Pi-Mono Migration (7/7 plans) — completed 2026-03-13
- [x] Phase 18: Provider Connection UI (2/2 plans) — completed 2026-03-13
- [x] Phase 19: Chat UX Polish (3/3 plans) — completed 2026-03-13
- [x] Phase 20: Platform UX Polish (5/5 plans) — completed 2026-03-13
- [x] Phase 21: Extension SDK & CLI (4/4 plans) — completed 2026-03-13
- [x] Phase 22: Extension Documentation (3/3 plans) — completed 2026-03-14
- [x] Phase 23: Rename to EZCorp (3/3 plans) — completed 2026-03-14
- [x] Phase 24: Showcase Example Extensions (2/2 plans) — completed 2026-03-14
- [x] Phase 25: API Security Hardening (4/4 plans) — completed 2026-03-15
- [x] Phase 26: Marketplace Moderation & Agent Sharing (3/3 plans) — completed 2026-03-15
- [x] Phase 27: Reliability & Error Resilience (2/2 plans) — completed 2026-03-15
- [x] Phase 28: TS Manifest Migration (2/2 plans) — completed 2026-03-15
- [x] Phase 29: Gap Closure (1/1 plan) — completed 2026-03-15
- [x] Phase 30: Integration Hardening (1/1 plan) — completed 2026-03-15

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 Textbox Shortcuts & Better Extensions (Phases 31-48) — SHIPPED 2026-05-06</summary>

- [x] Phase 31: @-Mention System — completed 2026-03-16
- [x] Phase 32: Inline Extension Invocation — completed 2026-03-16
- [x] Phase 33: Sub-Conversations & Composition — completed 2026-03-17
- [x] Phase 34: Chat UX Polish — completed 2026-03-17
- [→] Phase 35: Navigation & Agent Management — **deferred to v1.3** (renumbered as Phase 49)
- [x] Phase 36: Shared extension UI components — completed 2026-03-18
- [x] Phase 37: Tool & agent invocation hydration in chat harness — completed 2026-03-19
- [x] Phase 38: Code & file diff rendering in chat — completed 2026-03-19
- [x] Phase 39: Diff summary slide-out panel — completed 2026-03-20
- [x] Phase 40: Modular built-in tool system + permission gates — completed 2026-03-21
- [x] Phase 41: Launch blockers — password reset, error pages, onboarding — completed 2026-03-22
- [x] Phase 42: User self-service — help, logging, branding, loading states — completed 2026-03-23
- [x] Phase 43: Support readiness — analytics, API docs, session management — completed 2026-03-24
- [x] Phase 44: Scale readiness — mobile UX, perf, external Postgres, a11y — completed 2026-03-25
- [x] Phase 45: Sub-conversation integration wiring (gap closure) — completed 2026-03-26
- [x] Phase 46: Accessibility gap closure — completed 2026-03-27
- [x] Phase 47: Navigation & extension attachment (gap closure stub) — completed 2026-03-27
- [x] Phase 48: Ez Button — In-App Concierge Agent — completed 2026-05-06 (re-verified post-ezContext-removal)

Full details: `.planning/milestones/v1.2-ROADMAP.md` (post-archival).

</details>

<details>
<summary>✅ v1.3 Security & Permissions (Phases 49-53 + parallel tracks) — SHIPPED 2026-05-09</summary>

**Delivered:** Security backbone for the extension ecosystem — unified permission engine (PDP), capability expiry sweeps, MCP isolation via netns + bearer-token proxy, audit visibility surface, Phase 49 navigation/agent UX carryover from v1.2, and bundled extension ports proving the SDK is dogfood-complete.

- [x] **Phase 49: Navigation & Agent Management** (formerly Phase 35) — completed 2026-05-08
- [x] **Phase 50: Audit & Visibility** — completed ~2026-05-07
- [x] **Phase 51: SDK Capabilities + Cron Daemon** — completed ~2026-05-07
- [x] **Phase 52: Library Audit UI** — completed ~2026-05-07
- [x] **Phase 53: Bundled Extension Ports** (+ 53.6 subprocess boot-spawn fix + Stage 2 legacy deletion) — completed 2026-05-09
- [x] **Unified Permission System (Phases 1-7, parallel track)** — completed 2026-05-08 via merge `e5511ea`
- [x] **Capability Expiry Milestone (A-D, parallel track)** — completed 2026-05-08
- [x] **Post-perm Cleanup** — completed 2026-05-08
- [x] **Lessons Keeper v1 + v1.5** — completed 2026-05-06/07
- [x] **Multi-select chat turns** — already shipped 2026-04-30 (commit `335a200`), formally closed in v1.3
- [x] **v1.3 Closeout PR** — completed 2026-05-09 (PGlite `:memory:`, Vite preview Bun runner, reapprove auth doc, hydration mock, c2 mock pollution, JWT `jti`, triage closeout)

Full details: `.planning/milestones/v1.3-ROADMAP.md` and `.planning/milestones/v1.3-MILESTONE-AUDIT.md`.

</details>

<details>
<summary>✅ v1.4 Trust Hardening & v1.3 Closeout (Phases 54-62) — SHIPPED 2026-05-13</summary>

**Milestone Goal:** Close v1.3 release-readiness debt + harden the trust boundary for non-trusted users. Six v1.3 security-review findings closed (5 LOW CCs + Claim-1), MCP Phase-8 isolation hardened (DNS rebind, tmpfs, seccomp, netns veth-pair), per-capability TTL UI, Phase 49 deferred mobile UX, test-debt repair, and audit-claim for already-landed commits.

- [x] Phase 54: Security Backbone Hardening (CC1–CC5 + Claim-1) (3/3 plans) — completed 2026-05-11
- [x] Phase 55: MCP Stage 1 — DNS Rebind + tmpfs + seccomp Log Mode (3/3 plans) — completed 2026-05-11
- [x] Phase 56: Per-Capability TTL UI (4/4 plans) — completed 2026-05-11
- [x] Phase 57: Phase 49 Mobile UX Deferred Items (7/7 plans) — completed 2026-05-12
- [x] Phase 58: MCP Stage 2 — Seccomp Enforce + Netns Veth-Pair (3/3 plans) — completed 2026-05-12
- [x] Phase 59: Test Debt Repair (8/8 plans) — completed 2026-05-13
- [x] Phase 60: Audit-Claim & Docs Polish (4/4 plans) — completed 2026-05-13
- [x] Phase 61: Test Debt Follow-up — Feature-Rework Specs (5/4 plans) — completed 2026-05-13
- [x] Phase 62: Test Debt Continuation — Agent-Personas Specs + Coverage (9/9 plans) — completed 2026-05-13

Full details: `.planning/milestones/v1.4-ROADMAP.md` and `.planning/milestones/v1.4-MILESTONE-AUDIT.md`.

</details>

## Progress

**Execution Order:**
Phases execute in numeric order. Phase 55 (B.1) MUST start ≥7 days before Phase 58 (B.2) to satisfy the seccomp soak window. Phase 54 (A) MUST land before Phase 59 (F) because CC1 changes `loadConversationOverride` error shape. Phases 56 (D) and 57 (E) parallelize with the security track — different files. Phase 60 (G) sequenced last so triage findings inform retro-claim invariants.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 54. Security Backbone Hardening | 3/3 | Complete    | 2026-05-11 | - |
| 55. MCP Stage 1 (DNS + tmpfs + seccomp log) | 2/3 | Complete    | 2026-05-11 | - |
| 56. Per-Capability TTL UI | 4/4 | Complete    | 2026-05-11 | - |
| 57. Phase 49 Mobile UX Deferred | 7/7 | Complete   | 2026-05-12 | - |
| 58. MCP Stage 2 (seccomp enforce + netns) | 3/3 | Complete    | 2026-05-12 | - |
| 59. Test Debt Repair | 8/8 | Complete   | 2026-05-13 | - |
| 60. Audit-Claim & Docs Polish | 4/4 | Complete    | 2026-05-13 | - |
| 61. Test Debt Follow-up — Feature-Rework Specs | 5/4 | Complete    | 2026-05-13 | - |
| 62. Test Debt Continuation — Agent-Personas Specs + Coverage | 9/9 | Complete    | 2026-05-13 | - |

---

*Last updated: 2026-05-13 — v1.4 SHIPPED. All 9 phases (54-62) complete; milestone archived to `.planning/milestones/v1.4-ROADMAP.md`. v1.5 milestone not yet defined.*
