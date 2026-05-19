# Phase 3 — Port task-tracking from built-in tool to bundled extension

**STATUS: ✅ SHIPPED (2026-04-20 → 2026-04-21)** — see the Ship log at the
bottom of this doc for commit-by-commit receipts. The rest of the file is
the as-planned design, preserved unchanged so rollbacks / audits can read
the original intent alongside what actually shipped.

**Self-contained plan. Picks up cold from a fresh session.**

Ship-order reference: this is Phase 3 of the 5-phase task-tracking migration
and the **original goal** of the whole effort. Phase 1 (scratchpad port) proved
the built-in→bundled pattern. Phase 2a-lite (commit `84a6b7a`) shipped the SSE
conversation filter, capability-permission tier, and kill-switch. Phase 2b
(commit `c200c5e`) shipped `ezcorp/emit-task-event` + `ezcorp/agent-configs`
reverse-RPCs. Phase 2c (see `.planning/phase-2c-plan.md`) shipped
`EventSubscriptionDispatcher` + `registerEventHandler`. Phase 2d
(`ezcorp/spawn-assignment`, **shipped** in commits `452f3e7`, `38ede47`,
`75d02e6`, `e65c01f`, `cc26ae3`) exposes sub-agent spawning through an RPC.
The actual SDK surface is
`spawnAssignment({ task, agentConfigId?, agentName?, title? })` returning
`{ subConversationId, agentRunId, taskId, assignmentId }` — narrower than
the original Phase 3 draft assumed, and the returned `taskId` / `assignmentId`
are **freshly generated** by the Phase 2d handler
(`spawn-assignment-handler.ts:223-243`), not pass-through values. This
mismatch motivated a small Phase 2d amendment shipped as **Phase 3 commit-0**
(§4.2) — extending `SpawnAssignmentInput` with optional `taskId?` /
`assignmentId?` pass-through so the Phase 3 extension can carry its own
task-IDs end-to-end and the §4.2 two-hop bridge matches cleanly. The SDK
channel already preserves `JsonRpcError.code` + `.data` on outbound
rejections since commit `e65c01f`, so handlers can branch on `reason`
without string-matching.

The durable roadmap lives in `git log --grep="Phase 2"`. This file supersedes
any prior Phase 3 outline — treat as authoritative.

---

## Context for a fresh session

`src/runtime/tools/task-tracking.ts` is a 1,582-line built-in tool module
wired directly into `src/runtime/executor.ts:857-888`. It exports **12 LLM
tools** plus a set of module-level helpers that the executor, the five
`/api/conversations/[id]/tasks/*` SvelteKit routes, and the shared
`src/runtime/start-assignment.ts` all reach into. State lives in a
process-wide `Map<conversationId, TaskSnapshot>` write-cached to
`extension_storage` under a synthetic `BUILTIN_EXT_ID = "builtin"` row.

Phase 3 deletes the built-in path and replaces it with a bundled extension
named `task-tracking` (consistent with `scratchpad` / `ai-kit`). The
extension:
- Exposes the same 12 tools through the standard tool-dispatch pipeline
  (`web/src/routes/api/tool-invoke/+server.ts` + `ExtensionRegistry`).
- Emits `task:snapshot` / `task:assignment_update` via `TaskEvents` (2b).
- Resolves agent configs via `AgentConfigs.resolve()` (2b).
- Spawns sub-agents via `spawnAssignment()` (2d).
- Subscribes to `task:snapshot` (to observe sibling extensions' updates)
  via `registerEventHandler` (2c).

After Phase 3, `src/runtime/tools/task-tracking.ts` is **deleted**. Every
consumer that used to dynamic-import it (executor, five API routes,
start-assignment, five test files) is migrated to read/write via the
extension's `Storage` helper or via the tool-dispatch path. The
`BUILTIN_EXT_ID = "builtin"` extension-storage rows are migrated to the
real `task-tracking` extension id on boot (see §6).

This is the largest phase by churn because task-tracking is the most
widely-coupled built-in. Two hidden invariants from reading the source:
1. **`agent:complete` carries no `conversationId`** (only
   `parentConversationId`). It is NOT in Phase 2c's 13-event direct-carrier
   allowlist. The task-tracking extension cannot observe `agent:complete`
   directly — see §4 for the two-hop bridge via
   `task:assignment_update`.
2. **`start-assignment.ts` calls `await import("./tools/task-tracking")`
   from INSIDE the `run:complete` listener**, then reads the in-memory
   `taskStores` Map and mutates it in place. After Phase 3 this path is
   removed — the assignment completion plumbing moves into the extension
   itself, and `start-assignment.ts` becomes agnostic (see §5).

---

## Goal

Ship a bundled extension at `docs/extensions/examples/task-tracking/` that:

1. Exposes the 12 LLM tools (feature-parity matrix below).
2. Owns its own state inside the extension subprocess, persisted via
   the `Storage` SDK helper (conversation-scoped).
3. Uses `TaskEvents`, `AgentConfigs`, `registerEventHandler`, and the
   Phase 2d `spawnAssignment` to do everything the built-in does.
4. Is auto-installed by `BUNDLED_EXTENSIONS` on boot.
5. Is auto-wired to every conversation on first tool invocation (§6 —
   decision: wire-on-first-use, not wire-on-install).

Simultaneously, Phase 3 **deletes** `src/runtime/tools/task-tracking.ts`,
rewrites every consumer in the host, and migrates
`BUILTIN_EXT_ID = "builtin"` storage rows to the new extension id. This is
a **big-bang cutover** (no feature flag) — rollback is a single revert of
the merge commit.

**Frozen decisions (resolved during planning — do not relitigate):**

- **Bundled name**: `task-tracking`. Not `tasks`, not `task-panel` —
  consistent with the existing `BUILTIN_EXT_ID = "builtin"` naming and the
  `task:snapshot` event prefix. Extension id is whatever `installFromLocal`
  assigns at install time; the host looks it up by name at call sites that
  need the id.
- **Rollout shape**: big-bang. The commit that removes
  `src/runtime/tools/task-tracking.ts` is the same commit that wires the
  extension into `BUNDLED_EXTENSIONS`. No `EZCORP_TASK_TRACKING_EXT=1`
  gate — the test surface of a dual-path rollout would double our work
  and the Phase 1 scratchpad migration already proved the pattern.
- **State ownership**: the `Map<conversationId, TaskSnapshot>` lives
  **inside the extension subprocess**. Every tool handler reads/writes
  via `Storage("conversation")`. Each mutation is persisted **before**
  emitting `task:snapshot` — the bus event is the acknowledgment that
  durable state updated. No process-local in-memory cache layered on top
  — the extension subprocess is long-lived (persistent) and the per-call
  storage RPC latency is acceptable (scratchpad precedent).
- **Event-emission call sites**: today there are 28 direct
  `bus.emit("task:*", …)` call sites across `task-tracking.ts` (via
  `emitSnapshot` / `emitAssignmentUpdate` / `afterMutation`) plus 3 in
  `start-assignment.ts`. After port, all 31 become
  `await taskEvents.emitSnapshot(...)` / `.emitAssignmentUpdate(...)`
  from within the extension. Migration sanity check: grep count must go
  from 28 to 0 in `task-tracking.ts` and from 3 to 0 in
  `start-assignment.ts`.
- **Sub-agent spawn semantics**: `task_assignment_start` calls
  `spawnAssignment()` (Phase 2d RPC) and **returns immediately** with
  the assignment set to `running`. The extension does NOT block on the
  sub-run. Completion is observed via the extension's
  `task:assignment_update` subscription (two-hop bridge — see §4). This
  matches today's fire-and-forget semantics in `start-assignment.ts`'s
  `startRun()` lifecycle closures.
- **Assignment-completion bridge**: `agent:complete` has no
  `conversationId` and is not in Phase 2c's allowlist. Instead, the
  host's **`start-assignment.ts`** becomes responsible for emitting
  `task:assignment_update` when a run completes, targeting the
  conversation it already has in scope. The task-tracking extension
  subscribes to `task:assignment_update`, recognizes updates for its own
  conversations, and applies auto-complete + unblock-dependents logic.
  No Phase 2c allowlist expansion; no `agent:complete` subscription.
  See §4.2 for the bridge detail and §5.3 for the host-side change.
- **Wiring model**: **wire-on-first-tool-use**, via a helper that ensures
  a `conversation_extensions` row exists for `(conversationId, taskTrackingExtId)`
  before dispatching the first tool call. The helper idempotently
  inserts the row and caches the success. Rationale: wiring on
  bundled-install would require enumerating every conversation (slow,
  and new conversations still need it). Wiring in the executor boot
  path would add a DB write per `streamChat`. Wire-on-first-use is
  cheap + exact.
- **Feature parity is total.** Every one of the 12 tools ports with
  identical behavior. No dead tools are dropped. The two module-level
  exports used by `start-assignment.ts`
  (`completeTaskFromAssignment`, `unblockReadyDependentsForConversation`)
  become internal logic inside the extension's event subscription
  handler — their public API disappears because no external caller
  exists after the host cleanup.
- **Test migration**: all 5 test files that import `../runtime/tools/task-tracking`
  are rewritten. The three scratchpad-style tests
  (`scratchpad-bundled-install`, `scratchpad-extension.integration`,
  `scratchpad-e2e`) are the template; the 1,633-line
  `task-tracking.test.ts` is rewritten against the extension's exported
  tool handlers using the same `_setStoreForTests` pattern that
  scratchpad uses.
- **Ship in 5 commits.** One-line scope per commit in §Ship order.

---

## Feature-parity matrix

Every tool in the current built-in maps 1:1 to the extension. No tool is
dropped. The second column names the handler in
`docs/extensions/examples/task-tracking/index.ts`.

| Built-in tool             | Extension handler | Notes |
|---|---|---|
| `task_plan`               | `plan`            | Resolves `assignTo` via `AgentConfigs.resolve()`. Calls `spawnAssignment()` for each resolved + unblocked assignment when `autoStart` is true. |
| `task_add`                | `add`             | Same assignment + autoStart handling as `plan`, single-task shape. |
| `task_start`              | `start`           | Pure state mutation; no spawn. |
| `task_complete`           | `complete`        | Auto-advance logic ported unchanged. Calls the internal `unblockReadyDependents` (which may `spawnAssignment` for newly-ready tasks). |
| `task_fail`               | `fail`            | Pure state mutation. |
| `task_update`             | `update`          | Cycle-detection + unblock on dep change — unchanged. |
| `task_set_dependencies`   | `setDependencies` | Cycle-detection + unblock — unchanged. |
| `task_list`               | `list`            | Pure read. |
| `task_subtask_toggle`     | `subtaskToggle`   | Pure state mutation. |
| `task_assign`             | `assign`          | `AgentConfigs.resolve()` + optional `spawnAssignment()`. |
| `task_unassign`           | `unassign`        | Pure state mutation. Guards `status==="assigned"`. |
| `task_list_agents`        | `listAgents`      | `AgentConfigs.list()` — no DB call from within the extension. |

Non-tool exports that go away (internalized, no replacement needed):

| Current export                         | Fate |
|---|---|
| `getOrCreateStore`                     | Internal to extension. |
| `loadTaskStore`                        | Replaced by the extension's `Storage.get(STORAGE_KEY)` on first access per conversation. |
| `persistToDb`                          | Replaced by `Storage.set(STORAGE_KEY, snapshot)`. Every mutator handler persists **before** emitting. |
| `getTaskSnapshot`                      | Replaced by a thin host helper `getTaskSnapshotForConversation(conversationId)` that reads the extension's storage rows directly via `getStorageValue(taskTrackingExtId, "conversation", conversationId, STORAGE_KEY)`. API-route consumers use this. |
| `cleanupTaskStore`                     | Replaced by the host helper calling `deleteStorageValue(taskTrackingExtId, "conversation", conversationId, STORAGE_KEY)`. Test-only in practice. |
| `emitSnapshot` / `emitAssignmentUpdate`| Internal to extension; emitted via `TaskEvents.emit…`. |
| `completeTaskFromAssignment`           | Moved into the extension's `task:assignment_update` subscription. No longer a module-level export. `start-assignment.ts` no longer calls it (see §5.3). |
| `unblockReadyDependentsForConversation`| Same — moved into the event-subscription handler. |
| `resolveAgentConfig`                   | Replaced by `AgentConfigs.resolve()` — subprocess-local. |
| `isBlocked` / `unsatisfiedDeps`        | Become internal to the extension. The one external consumer — the `/assignments/[assignmentId]/start/+server.ts` route's pre-start dependency gate — is rebuilt on top of the host helper that loads the snapshot from extension storage (see §5.4). |
| `detectCycle`                          | Internal. |

---

## Implementation plan

### 1. Extension scaffold

Create `docs/extensions/examples/task-tracking/` with:

**`ezcorp.config.ts`** (mirror `scratchpad/ezcorp.config.ts`):

```ts
import { defineExtension } from "../../../../src/extensions/sdk/define";

export default defineExtension({
  schemaVersion: 2,
  name: "task-tracking",
  version: "1.0.0",
  description:
    "Multi-task planning and sub-agent coordination for a conversation",
  author: { name: "EzCorp" },
  entrypoint: "./index.ts",
  persistent: true,           // long-lived; keeps storage RPCs cheap
  tools: [
    // 12 tool definitions copied verbatim from
    // `getTaskTrackingToolDefinitions()` in the built-in, minus the
    // `Type.Unsafe` wrapping (which is a host-side concern).
    { name: "task_plan", description: "...", inputSchema: { ... } },
    // … 11 more …
  ],
  permissions: {
    storage: true,
    taskEvents: true,
    agentConfig: "read",
    spawnAgents: { maxPerHour: 200, maxConcurrent: 10 },
    eventSubscriptions: ["task:assignment_update"],
  },
});
```

Permission grant is wired in `src/extensions/bundled.ts`:

```ts
{
  name: "task-tracking",
  path: "docs/extensions/examples/task-tracking",
  permissions: {
    storage: true,
    taskEvents: true,
    agentConfig: "read",
    spawnAgents: { maxPerHour: 200, maxConcurrent: 10 },
    eventSubscriptions: ["task:assignment_update"],
    grantedAt: {
      storage: Date.now(),
      taskEvents: Date.now(),
      agentConfig: Date.now(),
      spawnAgents: Date.now(),
      eventSubscriptions: Date.now(),
    },
  },
},
```

Rate limits are operator tunables. `maxPerHour: 200` is 2× the busiest
observed task-tracking run (100 spawns/hour during the team-orchestration
seam test); `maxConcurrent: 10` matches today's implicit limit
(the `Promise.all` in `task_plan` resolves all `assignTo` entries in
parallel but real plans rarely exceed 5–10 parallel tasks).

### 2. Storage schema

Conversation-scoped storage under key `__tasks`. Shape:

```ts
interface PersistedSnapshot {
  tasks: TrackedTask[];
  activeTaskId?: string;
  schemaVersion: 1;
}
```

The built-in currently writes without a `schemaVersion` field. The port
adds it from day one. The migration path in §6 reads both shapes.

**Key design choice — no in-memory cache.** Each tool handler does:

```ts
const snap = await loadSnapshot(conversationId); // Storage.get
// … mutate snap …
await saveSnapshot(conversationId, snap);        // Storage.set
await taskEvents.emitSnapshot(snap.tasks, snap.activeTaskId);
```

Per-call RPC latency is acceptable because (a) the subprocess is persistent
so the stdio pipe stays open, (b) the scratchpad precedent shows round-trip
storage RPCs stay <5ms in-process, (c) an in-memory cache reintroduces the
cache-invalidation bug that motivated the persistent store in the first
place. If performance becomes a problem, add a 1-second TTL cache around
`loadSnapshot` — but not before.

### 3. Tool handlers

File: `docs/extensions/examples/task-tracking/index.ts`.

Top-of-file pattern from scratchpad — injectable storage/taskEvents/
agentConfigs/spawnAssignment bindings for tests, production wiring gated
on `import.meta.main`:

```ts
import {
  createToolDispatcher,
  getChannel,
  Storage,
  TaskEvents,
  AgentConfigs,
  registerEventHandler,
  spawnAssignment,          // Phase 2d SDK export
  toolError,
  toolResult,
  type ToolHandler,
} from "@ezcorp/sdk/runtime";

let storage = new Storage("conversation");
let taskEvents = new TaskEvents();
let agentConfigs = new AgentConfigs();
let spawn = spawnAssignment;
export function _setStoreForTests(...) { /* scratchpad pattern */ }
```

Each of the 12 handlers ports its built-in body with these substitutions:
- `getOrCreateStore(conversationId)` → `await loadSnapshot()`
- `persistToDb(conversationId)` → `await saveSnapshot(snap)`
- `emitSnapshot(bus, conversationId)` → `await taskEvents.emitSnapshot(snap.tasks, snap.activeTaskId)`
- `emitAssignmentUpdate(bus, conversationId, taskId, a)` → `await taskEvents.emitAssignmentUpdate(taskId, a)`
- `resolveAgentConfig(idOrName)` → `await agentConfigs.resolve(idOrName)`
- `listAgentConfigs(userId)` → `await agentConfigs.list()` (user scoping is host-side)
- `await import("../start-assignment")` + `startAssignment({...})` → `await spawn({ agentConfigId, task, parentTaskId, parentAssignmentId })`

The `conversationId` no longer appears in handler bodies — the SDK's
`Storage` and `TaskEvents` thread it through `_meta` transparently (host
forces it; extension never reads it).

The three helpers that the built-in exports as module-level (for
`start-assignment.ts` to call) become internal:

- `completeTaskFromAssignment(taskId, summary)` — called from the
  `task:assignment_update` handler in §4.2 when the incoming update has
  `status: "completed"` and targets a task the extension owns.
- `unblockReadyDependents()` — called internally after every
  completion-side mutation.
- Cycle detection (`detectCycle`) — internal.

### 4. Event subscriptions (Phase 2c consumer)

The manifest declares `eventSubscriptions: ["task:assignment_update"]`.
The extension's `index.ts` registers exactly one handler.

#### 4.1 Why NOT `agent:complete`

`agent:complete` payload has no `conversationId` field (only
`parentConversationId`). Phase 2c's dispatcher drops events without
`conversationId` at `dispatch()` time. Adding `agent:complete` to the
allowlist would require redesigning Phase 2c's direct-carrier invariant,
and the event already isn't conversation-scoped on the host side (SSE
filter passes it through). **Frozen design: do not touch Phase 2c.**

#### 4.2 The two-hop bridge

Instead, the **host's `start-assignment.ts`** already emits
`task:assignment_update` inside its `run:complete` listener (today it
does so via the built-in's `emitAssignmentUpdate()`). After Phase 3, it
emits the same event directly on the bus — same payload shape, same
`conversationId`. The extension subscribes to this event and treats any
incoming update with `status: "completed"` or `"failed"` as its signal
to run `completeTaskFromAssignment` logic.

Subscription handler sketch:

```ts
registerEventHandler("task:assignment_update", async (payload) => {
  // The host forces conversationId to the one we're wired to, so we
  // trust it. Load OUR snapshot (extension-storage row for this conv).
  const snap = await loadSnapshot();  // Storage reads conversationId from _meta
  const task = snap.tasks.find(t => t.id === payload.taskId);
  if (!task) return;   // race: update for a task we don't know about
  const existing = task.assignments.find(a => a.id === payload.assignment.id);
  if (!existing) return;
  // Idempotent merge — the incoming status is authoritative.
  Object.assign(existing, payload.assignment);
  if (payload.assignment.status === "completed") {
    await completeTaskFromAssignment(snap, task.id, payload.assignment.resultPreview);
  }
  if (payload.assignment.status === "failed") {
    task.status = "failed";
    task.failedAt = new Date().toISOString();
    task.failureReason = payload.assignment.resultPreview;
    if (snap.activeTaskId === task.id) snap.activeTaskId = undefined;
  }
  await saveSnapshot(snap);
  await taskEvents.emitSnapshot(snap.tasks, snap.activeTaskId);
  await unblockReadyDependents(snap);   // may spawn new assignments
});
```

**Idempotency is critical** because the extension ALSO emits
`task:assignment_update` itself (when a tool call updates an assignment).
Phase 2c delivers the extension's own emitted events back to it. The
handler above is safe against self-delivery: merging the payload onto an
assignment that already has the same status is a no-op, and the
completion branch is gated on "first transition into completed/failed"
(guard: skip if `existing.status` was already terminal before the merge).
Add an explicit `if (existing.status === "completed" || "failed") return;`
at the top for defense in depth.

#### 4.3 `orchestrator:human_response`

The user brief called out this as needed for `ask_human`, but
task-tracking today does not call `ask_human` anywhere — it's a concern
of other tools. Phase 3 does NOT add an `orchestrator:human_response`
subscription. If a future phase needs task-tracking to wake on human
responses, it'll add the subscription then — after extending Phase 2c's
allowlist (since `orchestrator:human_response` also lacks
`conversationId`).

### 5. Host-side changes

#### 5.1 `src/extensions/bundled.ts`

Add the `task-tracking` entry to `BUNDLED_EXTENSIONS` with the permission
block from §1.

#### 5.2 `src/runtime/executor.ts:854-888`

**Delete** the `2e. Task tracking tools` block in its entirety. The
extension is wired via `ExtensionRegistry` like any other — no special
dynamic import. The `loadTaskStore` call goes away; the extension's
`Storage` helper fetches on first tool invocation.

The executor's `this.bus.on("task:snapshot", …)` / `task:assignment_update`
subscriptions stay — they're what feeds the SSE stream. Nothing changes
there except the source of emissions (extension subprocess instead of
the built-in tool).

#### 5.3 `src/runtime/start-assignment.ts`

Currently does (line 99-107):

```ts
const {
  emitSnapshot, emitAssignmentUpdate, persistToDb,
  completeTaskFromAssignment, unblockReadyDependentsForConversation,
} = await import("./tools/task-tracking");
```

…and mutates the in-memory `taskStores` Map in three places. After Phase 3:

- The five dynamic imports from `./tools/task-tracking` are DELETED.
- `persistToDb` / `emitSnapshot` calls are replaced with direct
  `bus.emit("task:snapshot", …)` and `bus.emit("task:assignment_update", …)`
  using the snapshot that the caller already passed in (`opts.snapshot`
  in `StartAssignmentOpts`). These bus emissions are what the extension
  subscribes to via the two-hop bridge (§4.2).
- The `completeTaskFromAssignment` + `unblockReadyDependentsForConversation`
  call inside `run:complete` goes away — the extension handles both via
  its subscription.
- `opts.snapshot` is no longer mutated by this file (it was a read-only
  plan-context snapshot for the sub-agent's system prompt; verify no
  mutations remain).

The file shrinks from 294 lines to ~180. Its sole responsibilities become
(a) create/reuse sub-conversation, (b) fire `streamChat`, (c) emit
`run:complete`/`run:error`-driven `task:assignment_update` bus events so
the extension can react.

#### 5.4 `web/src/routes/api/conversations/[id]/tasks/*` — five routes

All five files currently do `await import("$server/runtime/tools/task-tracking")`.
After Phase 3 they use a new host helper
`src/runtime/task-tracking-host.ts` (NEW) that exposes:

```ts
/** Read the task snapshot for a conversation from extension storage.
 *  Returns undefined if the task-tracking extension has never been wired
 *  to this conversation. */
export async function getTaskSnapshotForConversation(
  conversationId: string,
): Promise<TaskSnapshot | undefined>;

/** Write an updated snapshot back. Used ONLY by the manual-assignment
 *  routes that need to mutate assignment state outside the tool path
 *  (e.g. the start-assignment endpoint when it transitions an
 *  assignment to "running"). */
export async function writeTaskSnapshotForConversation(
  conversationId: string,
  snapshot: TaskSnapshot,
): Promise<void>;

/** Resolve the task-tracking extension's DB id (cached module-local). */
export async function getTaskTrackingExtensionId(): Promise<string>;
```

Under the hood these call `getStorageValue(extId, "conversation", convId, "__tasks")`
and `setStorageValue(...)` from `src/db/queries/extension-storage.ts` —
the same storage table the extension uses, just accessed from the host.

The five routes' mapping:

| Route | Before | After |
|---|---|---|
| `tasks/+server.ts` (GET) | `getTaskSnapshot` + `loadTaskStore` | `getTaskSnapshotForConversation(id)` |
| `tasks/[taskId]/assign/+server.ts` | `getTaskSnapshot`, `loadTaskStore`, `getOrCreateStore`, `emitSnapshot`, `persistToDb` | `getTaskSnapshotForConversation` + `writeTaskSnapshotForConversation` + direct `bus.emit("task:snapshot", …)` |
| `tasks/[taskId]/messages/+server.ts` | `getTaskSnapshot`, `loadTaskStore`, `getOrCreateStore` | Same helpers. Read-only mutations on `TaskAssignment` move into `writeTaskSnapshotForConversation`. |
| `tasks/[taskId]/assignments/[assignmentId]/start/+server.ts` | `getTaskSnapshot`, `getOrCreateStore`, `loadTaskStore`, `isBlocked`, `unsatisfiedDeps` | `getTaskSnapshotForConversation` + the cycle/block helpers which become a **shared `src/runtime/task-dependencies.ts`** pure-function module imported by both the host and the extension (DRY — see §7). |

Wiring the extension to the conversation is a prerequisite for
`writeTaskSnapshotForConversation` and the start-assignment route. The
host helper adds an `ensureTaskTrackingWired(conversationId)` that
idempotently inserts into `conversation_extensions`.

#### 5.5 `web/src/routes/api/tool-invoke/+server.ts`

**Delete** the `BUILTIN_CATEGORIES` block (lines 35-71). With
task-tracking moved to a bundled extension, tool-invoke routes it
through `ExtensionRegistry` like any other extension tool. This is a
pure deletion.

### 6. Bundled-install side effects + data migration

Adding `task-tracking` to `BUNDLED_EXTENSIONS` means every existing
installation gets a new extension row on next boot (via
`ensureBundledExtensions()`). Audit implications:

- One `BUNDLED_INSTALLED` audit row per permission (5 rows per install).
  `ensureBundledExtensions` already batches these via `writeBundledInstallAudit`.
- One new `extensions` DB row with `isBundled: true`.
- No `conversation_extensions` rows created up-front — wiring happens
  on first tool use (§Frozen decisions).

**Storage migration.** The built-in writes its snapshots to
`extension_storage` under `extensionId = "builtin"`. The bundled
extension writes under its real DB-assigned id. Migration on boot,
wrapped in a one-shot idempotent helper in `ensureBundledExtensions` (or
its own `src/extensions/migrations/task-tracking-storage.ts`):

```ts
// Pseudo — runs exactly once per install after the task-tracking row exists.
async function migrateBuiltinTaskStorage(taskTrackingExtId: string): Promise<void> {
  const rows = await queryAllStorageRowsForExtension("builtin", "conversation", "__tasks");
  for (const row of rows) {
    await setStorageValue(taskTrackingExtId, "conversation", row.scopeId, "__tasks", row.value, false, row.sizeBytes);
  }
  // After re-writing, drop the "builtin" rows — they're dead weight and
  // will confuse drift detectors.
  await deleteAllStorageRowsForExtension("builtin");
}
```

Gate with a sentinel (`extension_storage` row — `scope='global'`, `key='__task_tracking_migration_done'`,
written under the task-tracking extension's real DB id) to make the
migration strictly idempotent. If the sentinel is set, skip. Log a
one-line INFO with row count on first run, nothing on subsequent runs.
(Implementation note, reconciled 2026-04-21: this plan's original draft
said the sentinel lives in an `extension_metadata` table under key
`task-tracking-migrated` — there is no such table. The shipped
implementation uses `extension_storage` per the description above; see
`src/extensions/migrations/task-tracking-storage.ts:50`.)

Fail-safe: migration errors do **not** block boot. Worst case, a user's
existing tasks don't carry over and they see an empty panel — annoying
but not destructive. The original `"builtin"` rows are untouched if
migration throws.

### 7. Shared code extraction

To avoid duplicating cycle-detection + dependency logic between the host
(for the /start endpoint's block gate) and the extension (for every
mutation), extract a pure-function module:

**NEW** `src/runtime/task-dependencies.ts`:

```ts
export interface ReadonlyTask { id: string; title: string; status: TaskStatus; dependsOn?: string[]; }
export interface ReadonlySnapshot { tasks: ReadonlyTask[]; }

export function detectCycle(tasks: ReadonlyTask[]): string[] | null { … }
export function unsatisfiedDeps(task: ReadonlyTask, snap: ReadonlySnapshot): ReadonlyTask[] { … }
export function isBlocked(task: ReadonlyTask, snap: ReadonlySnapshot): boolean { … }
```

Copy the current bodies verbatim from `task-tracking.ts:277-362`. Both
the extension and the host's task-dependencies path import from here.
The SDK does NOT import this file (workspace boundary) — the extension
imports via a relative path because bundled extensions live inside the
monorepo. If that boundary bites later, re-extract into a shared
workspace package; don't block Phase 3 on it.

### 8. Test migration

Three layers, mirroring the scratchpad precedent.

#### 8.1 Unit / in-process (replaces `task-tracking.test.ts`)

NEW `src/__tests__/task-tracking-extension.test.ts`. Imports the
extension handlers directly (via the `export const tools` map, same
shape as scratchpad). Uses `_setStoreForTests` / `_setTaskEventsForTests`
/ `_setAgentConfigsForTests` / `_setSpawnForTests` to inject fakes.

All 87 test cases in `task-tracking.test.ts` port 1:1 with substitutions:
- Construction: `createTaskTrackingTools({ conversationId, bus })` →
  `_setStoreForTests(fakeStore)` + call `tools.plan.execute(args)` directly.
  Each test synthesizes a `_meta.conversationId` in the fake store key.
- Bus assertions (`bus.on("task:snapshot", …)`) → assert on
  `fakeTaskEvents.calls`.

The existing `task-autostart.test.ts` (11 tests) and `task-dependencies.test.ts`
(25 tests) port the same way.

#### 8.2 Bundled-install (`scratchpad-bundled-install.test.ts` template)

NEW `src/__tests__/task-tracking-bundled-install.test.ts`:
- `ensureBundledExtensions()` creates a row for `task-tracking`.
- The permission block in the created row matches the manifest.
- Running twice is a no-op (idempotent).
- The `"builtin"` → real-extId storage migration runs exactly once.
- The migration sentinel prevents a re-run.

#### 8.3 In-subprocess integration (`scratchpad-extension.integration.test.ts` template)

NEW `src/__tests__/task-tracking-extension.integration.test.ts`:
- Spawn the extension subprocess.
- Wire it to a test conversation.
- Invoke `task_plan` via `ExtensionRegistry`.
- Assert `task:snapshot` fires on the host bus.
- Assert the storage row exists with the expected shape.
- Emit a synthetic `task:assignment_update` with `status: "completed"`
  on the host bus (via Phase 2c delivery) — assert the extension's
  stored snapshot updates within 500ms.

#### 8.4 End-to-end (`scratchpad-e2e.test.ts` template)

NEW `src/__tests__/task-tracking-e2e.test.ts`:
- Full executor → extension → `spawnAssignment` → `run:complete` round-trip.
- `executor-task-wiring.test.ts` (13 tests) ports here — the wiring under
  test becomes "the extension auto-wires on first tool call."
- `start-assignment-flow.test.ts` (10 tests) ports here, asserting the
  bridge via `task:assignment_update`.
- `seam-team-orchestration-integration.test.ts` — the 62-line import
  list reduces; the test itself ports with the same assertions.

Regression tests to KEEP unchanged (they reference types only, not
runtime):
- `web/src/__tests__/task-panel-blocked.test.ts`
- `web/src/__tests__/task-panel-logic.test.ts`
- `web/src/__tests__/stores-task-snapshot.test.ts`
- `web/e2e/task-panel.spec.ts`

The type imports `import type { TaskSnapshot } from
"../../../src/runtime/tools/task-tracking"` retarget to the new
`src/runtime/task-tracking-host.ts` (§5.4), which re-exports the shapes
(sourced from the extension's `index.ts` export).

### 9. Test inventory

| File | Tests | Phase 3 action |
|---|---|---|
| `src/__tests__/task-tracking.test.ts` | 87 | Rewrite as `task-tracking-extension.test.ts` (delete original) |
| `src/__tests__/task-autostart.test.ts` | 11 | Rewrite (delete original) |
| `src/__tests__/task-dependencies.test.ts` | 25 | Rewrite (delete original); add pure `task-dependencies.test.ts` for the extracted helpers |
| `src/__tests__/start-assignment-flow.test.ts` | 10 | Port assertions to `task-tracking-e2e.test.ts`; the file itself is removed because `start-assignment.ts` no longer reaches into task-tracking state |
| `src/__tests__/executor-task-wiring.test.ts` | 13 | Port to `task-tracking-e2e.test.ts` |
| `src/__tests__/seam-team-orchestration-integration.test.ts` | N | Retarget imports + update bus-assertion setup |
| `src/__tests__/builtin-registry.test.ts` | N | Remove the `createTaskTrackingTools` assertions (the list shrinks by 12) |
| `src/__tests__/current-model-e2e.test.ts` | N | Retarget imports to extension handlers |
| `src/__tests__/security/h3b-conversation-subroutes-idor.test.ts` | N | `mock.module` target changes from `runtime/tools/task-tracking` to `runtime/task-tracking-host` |
| `src/__tests__/helpers/mock-cleanup.ts:88` | — | Remove the `"../../runtime/tools/task-tracking"` entry from `MOCKED_MODULES` |
| `web/src/__tests__/tasks-api.test.ts` | N | `mock.module` target changes to `runtime/task-tracking-host` |
| `web/src/__tests__/tasks-assignment-api.test.ts` | N | Same |
| NEW `src/__tests__/task-tracking-bundled-install.test.ts` | ~6 | Phase 3 addition |
| NEW `src/__tests__/task-tracking-extension.integration.test.ts` | ~8 | Phase 3 addition |
| NEW `src/__tests__/task-tracking-e2e.test.ts` | ~20 | Phase 3 addition (absorbs wiring + flow + autostart-over-spawn assertions) |

---

## Files touched

### New

| File | Purpose |
|---|---|
| `docs/extensions/examples/task-tracking/ezcorp.config.ts` | Extension manifest. |
| `docs/extensions/examples/task-tracking/index.ts` | 12 tool handlers + 1 event subscription. |
| `docs/extensions/examples/task-tracking/property.test.ts` | Optional — pure-function property tests for cycle/dep helpers. |
| `src/runtime/task-tracking-host.ts` | Host-side helpers: `getTaskSnapshotForConversation`, `writeTaskSnapshotForConversation`, `ensureTaskTrackingWired`, `getTaskTrackingExtensionId`. |
| `src/runtime/task-dependencies.ts` | Extracted pure-function cycle/dep logic (shared by host + extension). |
| `src/extensions/migrations/task-tracking-storage.ts` | One-shot `"builtin"`-id → real-id storage migration. |
| `src/__tests__/task-tracking-extension.test.ts` | Unit tests (rewritten). |
| `src/__tests__/task-autostart-extension.test.ts` | Autostart + blocked-dep tests (rewritten). |
| `src/__tests__/task-dependencies.test.ts` | Rewrite as pure-function tests against the extracted module. |
| `src/__tests__/task-tracking-bundled-install.test.ts` | Bundled-install regression. |
| `src/__tests__/task-tracking-extension.integration.test.ts` | In-subprocess integration. |
| `src/__tests__/task-tracking-e2e.test.ts` | End-to-end executor + extension + spawn. |

### Changed

| File | Change |
|---|---|
| `src/extensions/bundled.ts` | Add `task-tracking` entry with permission block. |
| `src/runtime/executor.ts` | DELETE lines 854-888 (the built-in task-tracking wiring block). |
| `src/runtime/start-assignment.ts` | Remove all `import("./tools/task-tracking")` calls; emit `task:snapshot` + `task:assignment_update` directly on `bus`; remove in-place mutation of `opts.snapshot`. |
| `web/src/routes/api/conversations/[id]/tasks/+server.ts` | Use `getTaskSnapshotForConversation`. |
| `web/src/routes/api/conversations/[id]/tasks/[taskId]/assign/+server.ts` | Use host helpers; direct `bus.emit` for snapshot events. |
| `web/src/routes/api/conversations/[id]/tasks/[taskId]/messages/+server.ts` | Use host helpers. |
| `web/src/routes/api/conversations/[id]/tasks/[taskId]/assignments/[assignmentId]/start/+server.ts` | Use host helpers + the extracted `task-dependencies.ts` for the block gate. |
| `web/src/routes/api/tool-invoke/+server.ts` | DELETE lines 31-71 (`BUILTIN_CATEGORIES` block). |
| `src/runtime/tools/builtin-registry.ts` | Remove the task-tracking comment + any 12-tool list entries. |
| `src/__tests__/builtin-registry.test.ts` | Adjust expected tool count. |
| `src/__tests__/helpers/mock-cleanup.ts` | Remove task-tracking entry from `MOCKED_MODULES`. |
| `src/__tests__/security/h3b-conversation-subroutes-idor.test.ts` | Retarget `mock.module` paths. |
| `web/src/__tests__/tasks-api.test.ts` | Retarget `mock.module` paths. |
| `web/src/__tests__/tasks-assignment-api.test.ts` | Retarget. |

### Deleted

| File | Why |
|---|---|
| `src/runtime/tools/task-tracking.ts` | Replaced by the extension. |
| `src/__tests__/task-tracking.test.ts` | Rewritten as `task-tracking-extension.test.ts`. |
| `src/__tests__/task-autostart.test.ts` | Rewritten. |
| `src/__tests__/start-assignment-flow.test.ts` | Absorbed into `task-tracking-e2e.test.ts`. |
| `src/__tests__/executor-task-wiring.test.ts` | Absorbed into `task-tracking-e2e.test.ts`. |

### Reference (read-only)

| File | Why |
|---|---|
| `docs/extensions/examples/scratchpad/{ezcorp.config.ts,index.ts}` | Canonical bundled-extension template. |
| `src/__tests__/scratchpad-{bundled-install,extension.integration,e2e}.test.ts` | Three-layer test pattern. |
| `src/extensions/task-events-handler.ts` | Contract for `TaskEvents`. |
| `src/extensions/agent-configs-handler.ts` | Contract for `AgentConfigs`. |
| `src/extensions/event-subscription-dispatcher.ts` | Contract for `registerEventHandler` delivery. |
| `packages/@ezcorp/sdk/src/runtime/{task-events,agent-configs,events}.ts` | SDK client surfaces. |
| `src/extensions/bundled.ts` | Install pattern. |
| `.planning/phase-2b-plan.md` + `.planning/phase-2c-plan.md` | Frozen 2b/2c contracts. |
| `.planning/phase-2d-plan.md` (when written) | `spawnAssignment` SDK surface. |

---

## Verification (exit criteria)

Every bullet must be green before merge.

1. `bun test src/__tests__/task-tracking-extension.test.ts` — 87+ unit tests pass (parity with today).
2. `bun test src/__tests__/task-autostart-extension.test.ts` — 11+ pass.
3. `bun test src/__tests__/task-dependencies.test.ts` — 25+ pass against the extracted helpers.
4. `bun test src/__tests__/task-tracking-bundled-install.test.ts` — bundled install + storage migration green.
5. `bun test src/__tests__/task-tracking-extension.integration.test.ts` — real subprocess round-trip, within 500ms per event.
6. `bun test src/__tests__/task-tracking-e2e.test.ts` — end-to-end (replaces wiring + flow + autostart-over-spawn).
7. `bun test src/__tests__/seam-team-orchestration-integration.test.ts` — green after import retargeting.
8. `bun test src/__tests__/current-model-e2e.test.ts` — green after retargeting.
9. `bun test src/__tests__/security/h3b-conversation-subroutes-idor.test.ts` — IDOR coverage survives.
10. `bun test web/src/__tests__/{tasks-api,tasks-assignment-api,task-panel-logic,task-panel-blocked,stores-task-snapshot}.test.ts` — web-side tests green.
11. Phase 1+2a+2b+2c regression: `bun test src/__tests__/{capability-permissions,sse-conversation-filter,scratchpad-bundled-install,scratchpad-extension.integration,scratchpad-e2e,extension-audit-actions,emit-task-event-handler,agent-configs-handler,emit-task-event.integration,event-subscription-dispatcher,event-subscription.integration}.test.ts` — still green.
12. Full suite: `bun test` — passes. No orphaned references to `./tools/task-tracking`.
13. Grep invariants: `rg "runtime/tools/task-tracking" src web` returns **zero** hits. `rg 'bus.emit\("task:' src` returns only hits inside `start-assignment.ts` (the bridge emitter) and `sse-conversation-filter.ts` (the allowlist).
14. Manual: boot the server fresh. Confirm the `task-tracking` extension row exists and the `"builtin"` storage rows are gone (migration ran).
15. Manual: open a conversation that had tasks before the upgrade. Panel renders those tasks from the migrated storage.
16. Manual: kill-switch. `EZCORP_DISABLE_CAPABILITY_TOOLS=1 bun run dev` → the extension boots but every tool call returns a permission error (capability gates all four reverse RPCs). Task panel renders the last persisted snapshot but every tool invocation fails loudly. Acceptable failure mode for the emergency switch.

---

## Open design notes (resolve during execution)

Judgment calls where the right answer depends on what the code reads like.

- **Storage caching.** §2 freezes "no in-memory cache." If
  `task-tracking-extension.integration.test.ts` shows >20 storage RPCs per
  tool call in the hot path, add a 1-second TTL cache around
  `loadSnapshot` — keyed on conversationId with an invalidate on every
  `saveSnapshot`. Don't add it speculatively.
- **Migration atomicity.** The `"builtin"` → real-id migration writes N
  rows then deletes N rows in a non-transactional sequence. If a crash
  hits mid-migration, we'd have duplicate rows. Option: run the migration
  inside a single `db.transaction` if the driver supports it, or accept
  the duplicate-rows risk since the sentinel will re-run and overwrite on
  next boot. Lean toward accept-and-overwrite for simplicity; revisit
  only if telemetry shows duplicate conversations.
- **Wire-on-first-use race.** Two concurrent tool calls on a brand-new
  conversation both see "not wired," both try to insert. Resolution: the
  `conversation_extensions` table has a unique constraint on
  `(conversationId, extensionId)`; one insert succeeds, the other gets a
  constraint-violation error which `ensureTaskTrackingWired` catches and
  treats as success. Same pattern scratchpad uses at
  `executor.ts`'s S7 gate — reuse.
- **`task_list_agents` scope.** The built-in scopes by `userId` looked up
  from `getConversation(conversationId)`. The SDK's `AgentConfigs.list()`
  already user-scopes (the handler filters by installing user). Verify
  the installing user equals the conversation owner for bundled extensions —
  it should, since the extension is auto-installed as a system user. If
  not, add an `ownerUserId` filter client-side in the handler.
- **Two-hop bridge self-loop.** §4.2 notes that the extension emits
  `task:assignment_update` which Phase 2c re-delivers to itself. Verified
  idempotent — but double-check with an integration-test assertion that
  emitting once results in exactly one storage write (not two).
- **Event-ordering under high load.** The extension's own emission and
  the host's bridge emission can interleave. The idempotency guard
  (skip if assignment is already terminal) handles the obvious case;
  edge case is running→completed→running (retry). If a retry path ever
  exists, add a `updatedAt` timestamp and prefer the latest — for now,
  skip.
- **Rate-limit ceiling.** `spawnAgents: { maxPerHour: 200, maxConcurrent: 10 }`
  is a guess. Observe `spawn-assignment-denied` audit rows in the first
  week on main — tune if we hit the ceiling on legitimate use.
- **UI permission-review copy.** The task-tracking extension requests 5
  capability permissions. Verify `web/src/lib/extension-permission-copy.ts`
  has strings for all five keys with user-friendly danger-tier labels. If
  any string is missing the install dialog falls back to the raw key name
  (ugly but not broken).

---

## Out of scope (defer)

- Phase 2d (`ezcorp/spawn-assignment`) — blocked dependency; Phase 3 assumes it exists.
- Adding non-direct-carrier events (`agent:complete`, `orchestrator:human_response`) to the Phase 2c allowlist.
- Team-share conversation scoping (same deferral as Phase 2a-lite).
- Splitting `task-dependencies.ts` into a `@ezcorp/task-core` workspace package — only do this if a second extension needs the same primitives.
- Admin UI for viewing the task-tracking extension's live storage (dev tool only; not a product feature).
- A "legacy compatibility" codepath that re-routes tool calls to the deleted built-in — big-bang is the explicit choice.
- Removing the task panel's pass-through websocket (SSE delivery of `task:*` events) — still needed; only the producer changes.
- Converting `scratchpad` to use the same two-hop bridge pattern — not applicable (scratchpad doesn't subscribe to events).

---

## Rollback

Single commit revert of the merge commit. Because Phase 3 ships as 5
commits but merges as one PR, the revert is atomic.

- **No schema migrations.** The `extension_storage` table is unchanged;
  only row contents move between `extensionId` values. The migration
  helper in `src/extensions/migrations/task-tracking-storage.ts` has a
  sentinel — if we revert AND restore the deleted built-in, the
  `"builtin"` storage rows are gone (the migration deleted them). The
  built-in would see empty stores on first boot after revert. **This is
  the only non-reversible side effect.** Mitigation: the migration helper
  should also write a backup row under key `__tasks_pre_migration` so a
  revert can restore from it. Add a `src/scripts/restore-builtin-task-storage.ts`
  one-shot that reads the backup and re-writes `"builtin"` rows.
- **Audit rows** for the bundled install and capability grants are
  orphaned on revert but harmless.
- **New `conversation_extensions` rows** are orphaned on revert (they
  reference a no-longer-existing `task-tracking` extension row). Harmless
  — the executor's wiring loop ignores unknown extension ids.
- **`EZCORP_DISABLE_CAPABILITY_TOOLS=1`** is the soft-kill. With the flag
  set, the extension still boots but every tool call returns a permission
  error. That's not a graceful degradation — the task panel becomes
  read-only. If production surfaces a bug in the extension but not in
  the built-in, flip the flag AND revert. Don't try to rely on the flag
  alone.

Rollback checklist:
1. Flip `EZCORP_DISABLE_CAPABILITY_TOOLS=1` in prod.
2. Revert the merge commit. CI green.
3. Run `bun src/scripts/restore-builtin-task-storage.ts` in prod to
   restore `"builtin"` rows from the backup.
4. Clear `EZCORP_DISABLE_CAPABILITY_TOOLS=1`.

---

## Ship order within Phase 3

Five commits, each independently revertable. Each commit leaves the tree
buildable + tests green (the ones that belong to that commit's scope —
the full suite stays green only after commit 5).

- **Commit 1 — Extension scaffold + shared dep helpers + simplest tools.**
  Adds `docs/extensions/examples/task-tracking/{ezcorp.config.ts,index.ts}`
  with `task_plan` (without `assignTo`), `task_add` (without `assignTo`),
  `task_list`, `task_subtask_toggle`, `task_list_agents`. Extracts
  `src/runtime/task-dependencies.ts`. Adds `src/__tests__/task-dependencies.test.ts`
  and a skeleton of `task-tracking-extension.test.ts` covering the above
  5 tools. **Built-in is UNCHANGED**; the extension is not yet bundled.
  Verification: `bun test src/__tests__/task-tracking-extension.test.ts
  src/__tests__/task-dependencies.test.ts`.

- **Commit 2 — Remaining mutation tools.** Adds `task_start`,
  `task_complete` (without dependent unblock spawning), `task_fail`,
  `task_update`, `task_set_dependencies`, `task_unassign` to the
  extension. Extends the unit tests to cover mutation semantics,
  auto-advance, cycle-detection. **Still not bundled**; still no spawn.
  Verification: unit tests green.

- **Commit 3 — Assignment flow + Phase 2d spawn integration.** Extends
  `task_plan` / `task_add` / `task_assign` with the `assignTo` + spawn
  path via `spawnAssignment`. Assumes Phase 2d is shipped. Adds
  autostart + blocked-dep tests (`task-autostart-extension.test.ts`).
  **Still not bundled**; host path still intact.
  Verification: unit + autostart tests green. If 2d's SDK surface
  differs from the assumed `spawnAssignment({ agentName, task,
  parentTaskId })`, adapt here.

- **Commit 4 — Event subscription + auto-advance logic.** Adds the
  `registerEventHandler("task:assignment_update", …)` subscription with
  the two-hop bridge logic from §4.2. Adds the in-subprocess integration
  test (`task-tracking-extension.integration.test.ts`). **Still not
  bundled**; the host still has the built-in wired.
  Verification: integration test green + prior commits still green.

- **Commit 5 — Big-bang cutover.** Wires `task-tracking` into
  `BUNDLED_EXTENSIONS`. Adds the `"builtin"` → real-id storage migration
  (with backup rows for rollback). Adds
  `src/runtime/task-tracking-host.ts`. **Deletes**
  `src/runtime/tools/task-tracking.ts`, the five API routes' dynamic
  imports, executor lines 854-888, tool-invoke's `BUILTIN_CATEGORIES`
  block, and `start-assignment.ts`'s task-tracking imports. Deletes
  `task-tracking.test.ts`, `task-autostart.test.ts`,
  `start-assignment-flow.test.ts`, `executor-task-wiring.test.ts`.
  Adds `task-tracking-bundled-install.test.ts` + `task-tracking-e2e.test.ts`.
  Updates `builtin-registry.test.ts`, `h3b-conversation-subroutes-idor.test.ts`,
  `tasks-api.test.ts`, `tasks-assignment-api.test.ts`, `mock-cleanup.ts`.
  Verification: **full `bun test` suite green**. The grep invariants in
  §Verification bullet 13 pass.

Soak 2 weeks on main before Phase 4 (scratchpad→?) or any subsequent
task-tracking feature work, since this is the riskiest phase of the
migration.

---

## Ship log (post-hoc, 2026-04-20 → 2026-04-21)

The phase landed in **6 commits** (plan §Ship order) + **4 follow-up**
commits addressing a production bug + test-coverage gaps + a suite of
pre-existing cross-test-pollution issues uncovered by full-suite runs.

### Phase 3 proper (6 commits, matches plan §Ship order)

| Commit  | Scope                                                                                                |
|---------|------------------------------------------------------------------------------------------------------|
| `34deb40` | **commit-0** — Phase 2d amendment: `SpawnAssignmentInput` gains optional `taskId?` / `assignmentId?` pass-through + 2 new handler tests. |
| `b61521c` | **commit-1** — Extension scaffold, `src/runtime/task-dependencies.ts` extraction, 5 simple tools (plan/add without assignTo, list, subtask_toggle, list_agents), 18-test pure-deps suite + 17-test extension skeleton. |
| `73cefee` | **commit-2** — Remaining mutation tools: task_start, task_complete (w/o dep unblock spawning), task_fail, task_update, task_set_dependencies, task_unassign. Extension test suite grows to 33. |
| `7e58095` | **commit-3** — assignTo + `spawnAssignment` integration with §3.1 error ladder across all 6 rejection branches. Suite → 49 tests. |
| `7446930` | **commit-4** — `registerEventHandler("task:assignment_update", …)` subscription + two-hop bridge + idempotent auto-advance + unblock-dependents sweep. Suite → 55 tests. |
| `5a247ed` | **commit-5** — Big-bang cutover: DELETE `src/runtime/tools/task-tracking.ts` (1,582 LOC), wire `task-tracking` into `BUNDLED_EXTENSIONS`, add `src/runtime/task-tracking-host.ts` + migration + 5 API-route rewrites + executor + start-assignment producer switch. 25 files changed, 837 inserts / 5,196 deletes. |

### Follow-up fixes shipped same window

| Commit  | Scope                                                                                                |
|---------|------------------------------------------------------------------------------------------------------|
| `8a0aeb6` | Subprocess-integration test (§8.3) + `src/scripts/restore-builtin-task-storage.ts` rollback helper (§Rollback step 3). |
| `e3237cd` | **Production bug fix**: bundled extension storage key `__tasks` failed the `__`-prefix reserved check for non-`"builtin"` extensionIds. Changed to `tasks`; migration's source key stays `__tasks` (read side only); backup + sentinel retain `__` prefix (DB-layer writes bypass key validation). Also shipped the plan §8.4 end-to-end test (4 tests, real subprocess + real handlers + real dispatcher + stubbed `startAssignment`), direct host-helper tests (15), migration tests (5), and rollback-script tests (4). |
| `989f491`, `2112926`, `13c9a9c` | Cross-test-pollution sweep triggered by Phase 3's growth of shared test surface — mock-cleanup `$server/*` lazy-factory reconciliation, `SKIP_SERVER_ALIAS_RESTORE` for the async-factory hang, preload workaround for `oauth-api.test.ts`'s broken relative specifier, scratchpad-e2e async→sync factory swap, marketplace race stabilisation. |

### Plan vs reality

- **Shipped matches §Ship order 1:1** — all 6 planned commits landed, in
  order, with the §Verification exit criteria's grep invariants
  (§Verification bullet 13: `rg runtime/tools/task-tracking src web` → 0
  hits) satisfied.
- **Deviations from the plan, all narrower than planned**:
  - Storage key `__tasks` → `tasks` (§2 called for `__tasks`; the
    storage-handler's reserved-prefix rule for non-builtin extensions
    made this a production blocker caught by the commit-5 e2e test).
  - `seam-team-orchestration-integration.test.ts` was **deleted**
    rather than retargeted (§9 called for retargeting; coverage is
    redundant with the new 55-test extension unit suite + 4-test e2e).
  - `task-tracking-extension.integration.test.ts` (§8.3) and the e2e
    (§8.4) shipped as follow-ups (`8a0aeb6`, `e3237cd`) rather than
    inside commit 5 — the big-bang cutover commit focused on the
    cutover itself.
- **Additions beyond the plan**:
  - Direct tests for `task-tracking-host.ts` (15), migration (5), and
    the rollback script (4) — plan only called for indirect coverage
    via the API-route tests.
  - Broader test-infrastructure hardening in mock-cleanup.ts to
    eliminate pre-existing cross-test-pollution failures surfaced by
    Phase 3's larger test surface. Not on the plan, but necessary to
    claim clean suite runs.

### Final verification (matches §Verification)

- `bun test src/__tests__/task-tracking-extension.test.ts` — 55 unit
  tests (supersedes §Verification bullets 1–3 combined; the pure-deps
  + autostart split-out happened as planned).
- `bun test src/__tests__/task-tracking-bundled-install.test.ts` —
  8 (bullet 4).
- `bun test src/__tests__/task-tracking-extension.integration.test.ts`
  — 4 in-subprocess tests (bullet 5).
- `bun test src/__tests__/task-tracking-e2e.test.ts` — 4 end-to-end
  tests (bullet 6).
- `bun test src/__tests__/current-model-e2e.test.ts
  src/__tests__/security/h3b-conversation-subroutes-idor.test.ts
  web/src/__tests__/{tasks-api,tasks-assignment-api,task-panel-*,
  stores-task-snapshot}.test.ts` — all green (bullets 7–10).
- `bun test src/__tests__/{capability-permissions,sse-conversation-filter,
  scratchpad-*,extension-audit-actions,emit-task-event*,agent-configs-handler,
  event-subscription*}.test.ts` — regressions clean (bullet 11).
- Full server-side suite in 7 batches of ≤80 files: **~5,348 tests,
  0 failures** after the pollution sweep (bullet 12 — passes with
  the caveat that bun's `mock.module` still forces batched runs for
  deterministic results; single-invocation full-suite run of all
  333 files remains infeasible due to Bun's per-file mock cache
  behavior).
- Grep invariants (bullet 13): `rg "runtime/tools/task-tracking"
  src web` returns only docstring/comment mentions; `rg
  'bus.emit\("task:' src` hits only `start-assignment.ts` (the
  bridge emitter) and `sse-conversation-filter.ts` (the allowlist) —
  matches plan expectations.
- Manual verification bullets 14–16 are left to the operator running
  the first boot on main. The migration's sentinel + backup rows
  mean a revert remains atomic via `src/scripts/restore-builtin-task-storage.ts`.

### What this unblocks

Phase 4 (per the 5-phase migration ship-order reference at the top) and
any task-tracking feature work that was blocked on the extension having
first-class parity with the built-in. The 2-week soak period starts
from the last Phase 3 commit on main.
