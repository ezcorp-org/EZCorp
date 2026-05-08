/**
 * Extension permission checking, runtime confirmation, and always-allow persistence.
 */

import type { ExtensionPermissions, ExtensionManifest } from "./types";
import { getSetting, upsertSetting } from "../db/queries/settings";
import { realpath } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";

// ── Secure Filesystem Permission Check (realpath-resolved) ─────────
//
// The Phase 1 `checkPermission` sync boolean helper was deleted in
// Phase 6. Production callers consult the PDP at
// `./permission-engine.ts` via `engine.authorize`; the deprecated
// boolean shape had no remaining production references, only legacy
// unit tests (since rolled into PDP coverage).

export type FilesystemMode = "read" | "write";

export interface FilesystemPermissionResult {
  allowed: boolean;
  resolvedPath: string;
  /**
   * The mode the caller requested. Mirrors the input for callers that
   * persist the result and need a self-describing record (e.g. audit).
   * Phase 3: introduced alongside the explicit-mode signature.
   */
  mode: FilesystemMode;
}

/**
 * Check filesystem access using realpath resolution to prevent traversal and symlink escapes.
 * Resolves both the requested path and granted prefixes via realpath before comparing.
 * Implicitly allows access to the extension's own install directory.
 *
 * Phase 3 — explicit `mode` parameter:
 *   - `mode: "read"`  (default, back-compat) — allow when the path is in
 *     the granted prefix tree.
 *   - `mode: "write"` — additionally requires that the matching tool's
 *     manifest declared `capabilities.filesystem.mode` includes `"write"`.
 *     The check itself only prefix-matches; the per-tool mode gate is
 *     enforced by the host fs handlers (`./fs-handler.ts`) via the PDP
 *     before this function is called. This signature retains the
 *     prefix check so the realpath resolution stays in one place.
 *
 * The `mode` field is mirrored back on the result so callers can audit
 * what was asked for.
 */
export async function checkFilesystemPermission(
  requestedPath: string,
  granted: ExtensionPermissions,
  extensionInstallDir: string,
  mode: FilesystemMode = "read",
): Promise<FilesystemPermissionResult> {
  // Resolve requested path via realpath
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(requestedPath);
  } catch {
    // Path doesn't exist -- deny
    return { allowed: false, resolvedPath: requestedPath, mode };
  }

  // Resolve install dir via realpath
  let resolvedInstallDir: string;
  try {
    resolvedInstallDir = await realpath(extensionInstallDir);
  } catch {
    resolvedInstallDir = extensionInstallDir;
  }

  // Implicit access: extension's own install directory
  if (resolvedPath === resolvedInstallDir || resolvedPath.startsWith(resolvedInstallDir + "/")) {
    return { allowed: true, resolvedPath, mode };
  }

  // Check granted filesystem prefixes
  const prefixes = granted.filesystem ?? [];
  for (const prefix of prefixes) {
    let resolvedPrefix: string;
    try {
      // Relative paths resolve against installDir
      const absolutePrefix = prefix.startsWith("/")
        ? prefix
        : pathResolve(extensionInstallDir, prefix);
      resolvedPrefix = await realpath(absolutePrefix);
    } catch {
      continue; // Skip unresolvable prefixes
    }

    if (resolvedPath === resolvedPrefix || resolvedPath.startsWith(resolvedPrefix + "/")) {
      return { allowed: true, resolvedPath, mode };
    }
  }

  return { allowed: false, resolvedPath, mode };
}

// ── Permission Display ──────────────────────────────────────────────

export interface PermissionItem {
  type: string;
  value: string | boolean;
  description: string;
}

const PERMISSION_DESCRIPTIONS: Record<string, (v: string | boolean) => string> = {
  network: (v) => `Network access to ${v}`,
  filesystem: (v) => `Filesystem access to ${v}`,
  shell: () => "Execute shell commands",
  env: (v) => `Read environment variable ${v}`,
  storage: () => "Persistent key-value storage",
};

export function getRequiredPermissions(manifest: ExtensionManifest): PermissionItem[] {
  const items: PermissionItem[] = [];
  const perms = manifest.permissions;

  if (perms.network) {
    for (const domain of perms.network) {
      items.push({ type: "network", value: domain, description: PERMISSION_DESCRIPTIONS.network!(domain) });
    }
  }
  if (perms.filesystem) {
    for (const path of perms.filesystem) {
      items.push({ type: "filesystem", value: path, description: PERMISSION_DESCRIPTIONS.filesystem!(path) });
    }
  }
  if (perms.shell) {
    items.push({ type: "shell", value: true, description: PERMISSION_DESCRIPTIONS.shell!(true) });
  }
  if (perms.env) {
    for (const varName of perms.env) {
      items.push({ type: "env", value: varName, description: PERMISSION_DESCRIPTIONS.env!(varName) });
    }
  }
  if (perms.storage) {
    items.push({ type: "storage", value: true, description: PERMISSION_DESCRIPTIONS.storage!(true) });
  }

  return items;
}

// ── Permission Diff ─────────────────────────────────────────────────

export function diffPermissions(
  requested: ExtensionPermissions,
  granted: ExtensionPermissions,
): ExtensionPermissions {
  const diff: ExtensionPermissions = { grantedAt: {} };

  if (requested.network) {
    const ungrantedDomains = requested.network.filter((d) => !granted.network?.includes(d));
    if (ungrantedDomains.length > 0) diff.network = ungrantedDomains;
  }

  if (requested.filesystem) {
    const ungrantedPaths = requested.filesystem.filter((p) => !granted.filesystem?.includes(p));
    if (ungrantedPaths.length > 0) diff.filesystem = ungrantedPaths;
  }

  if (requested.shell && !granted.shell) {
    diff.shell = true;
  }

  if (requested.env) {
    const ungrantedVars = requested.env.filter((v) => !granted.env?.includes(v));
    if (ungrantedVars.length > 0) diff.env = ungrantedVars;
  }

  if (requested.storage && !granted.storage) {
    diff.storage = true;
  }

  return diff;
}

// ── Sensitive Operations ────────────────────────────────────────────

export function isSensitiveOperation(_type: "shell" | "filesystem"): boolean {
  return true; // shell and filesystem are always sensitive
}

/**
 * Scope namespace for always-allow grants. Phase 1 ships with two
 * effective scopes (conversation + forever); session and project are
 * declared so Phase 6's UI scope chooser doesn't need a schema change.
 *   • `session`      — until the user logs out / restarts the server
 *   • `conversation` — until this conversation is deleted
 *   • `project`      — until the project is deleted
 *   • `forever`      — until manually revoked from the admin UI
 */
export type AlwaysAllowScope = "session" | "conversation" | "project" | "forever";

/**
 * Settings key for always-allow grants, scoped per (user, scope,
 * scopeId, capability). Closes finding H2 (multi-user collision):
 * before this commit, two users on the same extension shared a single
 * always-allow row.
 *
 * Migration note: existing rows use the legacy `ext:<id>:always_allow:
 * <op>` shape. Those rows become orphaned after this change — users
 * will be re-prompted on the next sensitive op. The orphans aren't
 * deleted; admin UI cleanup is deferred to Phase 6.
 */
export function alwaysAllowSettingKey(args: {
  extensionId: string;
  userId: string;
  scope: AlwaysAllowScope;
  scopeId: string;
  capability: string;
}): string {
  return `ext:${args.extensionId}:${args.userId}:${args.scope}:${args.scopeId}:always_allow:${args.capability}`;
}

/** @deprecated Phase 6 removal. Pre-PDP wrapper kept for legacy callers. */
function legacyAlwaysAllowKey(extensionId: string, operationType: string): string {
  return `ext:${extensionId}:always_allow:${operationType}`;
}

/**
 * Persisted always-allow row value shape.
 *
 * Phase 1 of the capability-expiry milestone widens the value from a
 * bare `boolean` to `{allowed, grantedAt}` so a future sweep (Phase 2)
 * can age out grants by their grant timestamp. Backwards compat:
 *
 *   • Legacy `true`  → treated as "allowed, never expires" (no
 *     `grantedAt` available, so the sweep skips it). NOT auto-rewritten
 *     on read — lazy upgrade per locked decision §A.2.
 *   • Legacy `false` → treated as "needs_confirmation". Same lazy
 *     posture — read-only, no rewrite.
 *   • New `{allowed: true,  grantedAt: <ms>}` → "allowed".
 *   • New `{allowed: false, grantedAt: <ms>}` → "needs_confirmation".
 *   • Anything else (malformed JSON, wrong types) → fail-closed to
 *     "needs_confirmation". The sweep ignores malformed rows; orphan
 *     cleanup is deferred to v1.5.
 *
 * The Phase 2 sweep will read `grantedAt` to compute age, compare
 * against the per-capability TTL from `./perm-expiry-config.ts`, and
 * write `false` (with a fresh `grantedAt`) on revoke. Phase 1 ships
 * only the value-shape change; no sweep yet.
 */
export interface AlwaysAllowRecord {
  allowed: boolean;
  /** Unix-ms timestamp at which the grant was last confirmed. */
  grantedAt: number;
}

/**
 * Parse a raw `settings` value into an effective allow/deny decision.
 * Pure: takes a value, returns a decision; no DB I/O. Exported so the
 * PDP (`permission-engine.ts`) can apply the same parsing logic to
 * values it reads directly via `getSetting`.
 *
 * Returns `"allowed"` for legacy `true` AND for new
 * `{allowed: true, grantedAt: <number>}`. Everything else (including
 * legacy `false`, new `{allowed: false}`, malformed objects, undefined,
 * arrays, strings) collapses to `"needs_confirmation"` — fail-closed.
 */
export function parseAlwaysAllowValue(
  value: unknown,
): "allowed" | "needs_confirmation" {
  // Legacy boolean shape — pre-Phase-1 rows that haven't been rewritten.
  if (value === true) return "allowed";
  if (value === false) return "needs_confirmation";

  // New shape — `{allowed: boolean, grantedAt: number}`. Reject any
  // value that doesn't match the contract exactly. `allowed` MUST be
  // a boolean (not "true"/"yes"/1) and `grantedAt` MUST be a number.
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const v = value as Record<string, unknown>;
    if (typeof v.allowed === "boolean" && typeof v.grantedAt === "number") {
      return v.allowed ? "allowed" : "needs_confirmation";
    }
  }

  // Anything else (undefined, malformed shapes, wrong types) — fail
  // closed. Sweep rev'd the row to a bogus value? User re-prompts.
  return "needs_confirmation";
}

/**
 * Build the canonical new-shape value for a write. Always emits the
 * `{allowed, grantedAt}` form; legacy boolean is never written by new
 * code (Phase 1 contract). Exported so the PDP and other writers stay
 * consistent without re-implementing the shape.
 */
export function buildAlwaysAllowValue(
  allowed: boolean,
  now: number = Date.now(),
): AlwaysAllowRecord {
  return { allowed, grantedAt: now };
}

/**
 * Check if a sensitive operation has been granted always-allow for
 * the given scope tuple. Phase 1: callers are migrating to the
 * scoped key — pass `userId/scope/scopeId` to opt in. Legacy callers
 * that pass only `extensionId + operationType` get the unscoped
 * lookup against the legacy key (for back-compat with the dead
 * `setPermissionChecker` block in `setup-tools.ts`, which is
 * removed in the same Phase 1 commit series).
 *
 * Cap-expiry Phase 1: read accepts BOTH legacy `boolean` and new
 * `{allowed, grantedAt}` shapes via {@link parseAlwaysAllowValue}.
 */
export async function checkSensitiveConfirmation(
  extensionId: string,
  operationType: "shell" | "filesystem",
  scopeArgs?: {
    userId: string;
    scope: AlwaysAllowScope;
    scopeId: string;
  },
): Promise<"allowed" | "needs_confirmation"> {
  const key = scopeArgs
    ? alwaysAllowSettingKey({
        extensionId,
        userId: scopeArgs.userId,
        scope: scopeArgs.scope,
        scopeId: scopeArgs.scopeId,
        capability: operationType === "shell" ? "shell" : "fs.write",
      })
    : legacyAlwaysAllowKey(extensionId, operationType);
  const value = await getSetting(key);
  return parseAlwaysAllowValue(value);
}

/**
 * Persist an always-allow grant. Phase 1 callers (PDP) pass full
 * scope args; legacy callers fall back to the unscoped key.
 *
 * Cap-expiry Phase 1: writes the `{allowed, grantedAt}` shape every
 * time. Existing legacy-boolean rows are NOT rewritten unless they
 * pass through this function (lazy upgrade — locked decision §A.2).
 */
export async function setSensitiveAlwaysAllow(
  extensionId: string,
  operationType: "shell" | "filesystem",
  allowed: boolean,
  scopeArgs?: {
    userId: string;
    scope: AlwaysAllowScope;
    scopeId: string;
  },
): Promise<void> {
  const key = scopeArgs
    ? alwaysAllowSettingKey({
        extensionId,
        userId: scopeArgs.userId,
        scope: scopeArgs.scope,
        scopeId: scopeArgs.scopeId,
        capability: operationType === "shell" ? "shell" : "fs.write",
      })
    : legacyAlwaysAllowKey(extensionId, operationType);
  await upsertSetting(key, buildAlwaysAllowValue(allowed));
}
