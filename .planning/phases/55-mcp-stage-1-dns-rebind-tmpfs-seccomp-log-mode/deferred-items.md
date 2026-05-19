# Phase 55 — Deferred Items

Items discovered during execution that are OUT OF SCOPE for the
current plan and should be tracked separately.

---

## Resolved

### Pre-existing integration test regression caused by Plan 55-01 — RESOLVED 2026-05-11

**File:** `src/__tests__/mcp-netns-integration.test.ts`
**Test:** `"HTTPS_PROXY round-trip: namespace curl → proxy → audit (M2 fix-pass)"`
**Surfaced by:** Plan 55-02 worker bisect.
**Root cause:** Plan 55-01's new DNS-rebind recheck (correctly)
fail-closes with 502 on NXDOMAIN before `engine.authorize` is called.
The integration test used `api.foo.test` (RFC 6761 reserved TLD,
NXDOMAIN), so the test's pre-55-01 expectation that authorize() runs
unconditionally became obsolete under the locked Plan 55-01 semantics.
**Resolution:** Test-only fix — added a `mock.module("../extensions/runtime/dns", ...)`
block returning a deterministic public-IP record (`203.0.113.1`,
TEST-NET-3). No source change. See `55-01-SUMMARY.md` "Post-merge fix"
section.
**Commit:** `ae87384 test(55-01): refresh HTTPS_PROXY round-trip for DNS-recheck semantics`

---

*No open deferred items at this time.*
