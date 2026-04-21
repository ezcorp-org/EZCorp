/**
 * Tests the bundled install path for the `orchestration` extension —
 * Phase 4 commit-4a promoted the extension scaffold (shipped in commit 3)
 * into BUNDLED_EXTENSIONS so `ensureBundledExtensions()` creates its DB
 * row on first boot. Dual-wired at that point: the executor's legacy
 * invoke-agent path was still live through commit-4a, so installing
 * the extension row was a no-op for LLM turns until commit 5 flipped
 * the wiring.
 *
 * Pattern mirrors scratchpad-bundled-install + task-tracking-bundled-
 * install: in-memory `store` mock of `db/queries/extensions`, no real DB.
 * Covers: entry shape, permissions block parity with the plan, idempotent
 * install, `isBundled=true` provenance, no storage-row touch (the
 * extension has no persistent state), and the mention-picker surface.
 */
import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { restoreModuleMocks } from "./helpers/mock-cleanup";

// insertAuditEntry is mocked to a no-op because the store-level mocks
// below don't initialize a real DB; the audit-write path would otherwise
// blow up on the missing getDb().
mock.module("../db/queries/audit-log", () => ({
  insertAuditEntry: async () => {},
  listAuditLog: async () => [],
  listAuditForExtension: async () => [],
}));

interface StoredExtension {
  id: string;
  name: string;
  manifest: unknown;
  installPath: string;
  enabled: boolean;
  consecutiveFailures?: number;
  isBundled?: boolean;
  grantedPermissions: Record<string, unknown>;
}

let store: Map<string, StoredExtension>;
let nextId = 0;
// Track writes to extension_storage so we can assert the extension
// creates zero rows. The orchestration extension has no persistent
// state; any write would be an error.
let storageWrites: Array<{ extId: string; key: string }> = [];

mock.module("../db/queries/extensions", () => ({
  getExtensionByName: async (name: string) => store.get(name) ?? null,
  createExtension: async (data: Omit<StoredExtension, "id">) => {
    const id = `ext-${++nextId}`;
    const row = { id, ...data } as StoredExtension;
    store.set(data.name, row);
    return row;
  },
  listExtensions: async () => Array.from(store.values()),
  updateExtension: async (id: string, patch: Partial<StoredExtension>) => {
    for (const row of store.values()) {
      if (row.id === id) {
        Object.assign(row, patch);
        return row;
      }
    }
    return null;
  },
  deleteExtension: async (id: string) => {
    for (const [k, v] of store) if (v.id === id) store.delete(k);
  },
  incrementFailures: async () => 0,
  resetFailures: async () => undefined,
  disableExtension: async () => undefined,
}));

// Observe any storage writes so the "no state" invariant is testable.
mock.module("../db/queries/extension-storage", () => ({
  getStorageValue: async () => null,
  setStorageValue: async (extId: string, _scope: string, _scopeId: string, key: string) => {
    storageWrites.push({ extId, key });
    return { ok: true };
  },
  deleteStorageValue: async () => true,
}));

// Task-tracking's migration runs in ensureBundledExtensions — stub it to
// avoid pulling in the real PGlite driver.
mock.module("../extensions/migrations/task-tracking-storage", () => ({
  migrateBuiltinTaskStorage: async () => {},
}));

afterAll(() => restoreModuleMocks());

import {
  ensureBundledExtensions,
  resolveBundledExtensions,
  isBundledExtensionName,
} from "../extensions/bundled";

beforeEach(() => {
  store = new Map();
  nextId = 0;
  storageWrites = [];
});

describe("resolveBundledExtensions — orchestration entry", () => {
  test("includes orchestration by default with no opt-out flag", () => {
    const list = resolveBundledExtensions({});
    expect(list.some((e) => e.name === "orchestration")).toBe(true);
  });

  test("declares the Phase 4 + Phase 5 capability set: agentConfig:read + spawnAgents + eventSubscriptions", () => {
    const list = resolveBundledExtensions({});
    const entry = list.find((e) => e.name === "orchestration")!;
    expect(entry.path).toBe("docs/extensions/examples/orchestration");
    expect(entry.permissions.agentConfig).toBe("read");
    // Deliberately higher than task-tracking (200/10) — the
    // orchestration extension is the primary fan-out mechanism and
    // routinely dispatches a team of sub-agents per turn.
    expect(entry.permissions.spawnAgents).toEqual({
      maxPerHour: 500,
      maxConcurrent: 25,
    });
    // Phase 5 commit 2 added `orchestrator:human_response` alongside
    // `task:assignment_update` so `ask_human`'s gate-resolution
    // subscription can be delivered.
    expect(entry.permissions.eventSubscriptions).toEqual([
      "task:assignment_update",
      "orchestrator:human_response",
    ]);
    // No storage — the extension keeps pending invocations + pending
    // human-inputs in-memory under its `persistent: true` subprocess.
    expect(entry.permissions.storage).toBeUndefined();
    // No taskEvents — orchestration doesn't emit snapshot/update events
    // directly; that's task-tracking's job. (`ask_human`'s emit of
    // `orchestrator:human_input` is gated on the response subscription,
    // not `taskEvents` — see src/extensions/task-events-handler.ts.)
    expect(entry.permissions.taskEvents).toBeUndefined();

    // Every capability has a grantedAt timestamp so the audit writer
    // can emit oldValue/newValue transitions.
    for (const key of ["agentConfig", "spawnAgents", "eventSubscriptions"]) {
      expect(entry.permissions.grantedAt[key]).toBeGreaterThan(0);
    }
  });
});

describe("isBundledExtensionName — orchestration is recognized", () => {
  test("returns true so the integrity check is skipped on spawn", () => {
    expect(isBundledExtensionName("orchestration")).toBe(true);
  });
});

describe("ensureBundledExtensions — first-boot install", () => {
  test("creates an orchestration row with enabled=true and all permissions granted", async () => {
    await ensureBundledExtensions();
    const row = store.get("orchestration");
    expect(row).toBeDefined();
    expect(row!.name).toBe("orchestration");
    expect(row!.enabled).toBe(true);
    const granted = row!.grantedPermissions as {
      agentConfig?: string;
      spawnAgents?: unknown;
      eventSubscriptions?: unknown;
    };
    expect(granted.agentConfig).toBe("read");
    expect(granted.spawnAgents).toEqual({ maxPerHour: 500, maxConcurrent: 25 });
    expect(granted.eventSubscriptions).toEqual([
      "task:assignment_update",
      "orchestrator:human_response",
    ]);
  });

  test("manifest declares invoke_agent + ask_human tools (Phase 5 added ask_human)", async () => {
    await ensureBundledExtensions();
    const row = store.get("orchestration")!;
    const manifest = row.manifest as { tools?: Array<{ name: string }>; version?: string };
    const names = (manifest.tools ?? []).map((t) => t.name).sort();
    expect(names).toEqual(["ask_human", "invoke_agent"]);
    // Phase 5 minor bump — additive manifest change.
    expect(manifest.version).toBe("1.1.0");
  });

  test("re-running ensureBundledExtensions is idempotent — same row, still enabled", async () => {
    await ensureBundledExtensions();
    const rowId1 = store.get("orchestration")!.id;
    await ensureBundledExtensions();
    const rowId2 = store.get("orchestration")!.id;
    expect(rowId2).toBe(rowId1);
    expect(store.get("orchestration")!.enabled).toBe(true);
  });

  test("sets isBundled=true on the DB row so the integrity-check skip applies", async () => {
    await ensureBundledExtensions();
    const row = store.get("orchestration")!;
    expect(row.isBundled).toBe(true);
  });

  test("creates no extension_storage rows — the orchestration extension has no persistent state", async () => {
    await ensureBundledExtensions();
    const row = store.get("orchestration")!;
    // Filter to just this extension's writes; task-tracking may write
    // schema-version markers if the migration ran against a real DB,
    // but our stub is a no-op — still, belt-and-suspenders.
    const ownWrites = storageWrites.filter((w) => w.extId === row.id);
    expect(ownWrites).toHaveLength(0);
  });
});
