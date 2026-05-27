# Deferred items — substack-engagement build

## Pre-existing branch build break blocks Playwright e2e execution (OUT OF SCOPE)

`PI_SKIP_INIT=1 bun run build` (the command Playwright's `webServer` runs
in non-Docker mode) fails on the branch with:

    [UNRESOLVED_IMPORT] Could not resolve './pending-messages'
    in .svelte-kit/adapter-bun/chunks/context.js

Root cause: `web/src/routes/api/conversations/[id]/agent-chat/+server.ts:12`
imports `$server/runtime/pending-messages`, but
`web/src/lib/server/runtime/pending-messages.ts` exists nowhere in the
repo (not on disk, not in HEAD, not tracked). This is committed on the
branch and is unrelated to substack-engagement — none of the Phase 1-4
changes touch agent-chat, the runtime dir, or that import.

Impact: the production build is broken branch-wide, so Playwright's
`webServer` (`build && preview`) cannot start — this blocks EVERY e2e
spec, not just `substack-review-card.spec.ts`. The dev-server fallback
also can't be used because the SvelteKit server-side layout load hits a
real (empty) DB and redirects to the first-run onboarding screen, which
the `mockApi` browser-route fixture cannot intercept (it runs after the
server-side redirect).

Why NOT fixed here: out of the substack-engagement feature's scope, and
synthesizing a missing host runtime module could mask a larger branch
regression the validation team needs to see. Per the deviation scope
boundary (only auto-fix issues caused by the current task), this is
logged, not patched.

What WAS verified for the e2e:
- `bunx playwright test substack-review-card --list` collects all 5
  tests cleanly (the spec parses + type-checks).
- The spec mirrors the proven, currently-passing
  `openai-image-gen-edit-prior.spec.ts` pattern exactly (mockApi +
  emitSse `tool:start`/`tool:complete` with cardType + page.route mock of
  `/api/tool-invoke`).
- The same card flow is covered at the component layer by
  `SubstackReviewCard.component.test.ts` (14 vitest tests, all passing),
  which exercises the identical render + edit + approve&send + reject +
  defer + failure paths against a stubbed fetch.

Action for the validation team: once `pending-messages` is restored on
the branch (or the broken import removed), run
`cd web && bunx playwright test substack-review-card --project=chromium`.
