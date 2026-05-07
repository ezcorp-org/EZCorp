/**
 * Extension permission checking, runtime confirmation, and always-allow persistence.
 */

import type { ExtensionPermissions, ExtensionManifest } from "./types";
import { getSetting, upsertSetting } from "../db/queries/settings";
import { realpath } from "node:fs/promises";
import { resolve as pathResolve } from "node:path";

// ── Permission Check ────────────────────────────────────────────────

/**
 * @deprecated Phase 6 removal. Sync entry-point pre-dating the PDP at
 * `./permission-engine.ts`. Production callers were retired in Phase 1
 * — `ToolExecutor` and the reverse-RPC handlers now consult the engine
 * via `engine.authorize`. Tests still import this for unit-level
 * coverage of the legacy boolean shape; the symbol stays exported so
 * those tests keep working until Phase 6 deletes them.
 */
export function checkPermission(
  type: "network" | "filesystem" | "shell" | "env" | "storage",
  value: string | boolean,
  granted: ExtensionPermissions,
): boolean {
  switch (type) {
    case "network":
      return granted.network?.includes(value as string) ?? false;

    case "filesystem": {
      const path = value as string;
      return granted.filesystem?.some((prefix) => path === prefix || path.startsWith(prefix + "/")) ?? false;
    }

    case "shell":
      return granted.shell === true;

    case "env":
      return granted.env?.includes(value as string) ?? false;

    case "storage":
      return granted.storage === true;

    default:
      return false;
  }
}

// ── Secure Filesystem Permission Check (realpath-resolved) ─────────

export interface FilesystemPermissionResult {
  allowed: boolean;
  resolvedPath: string;
}

/**
 * Check filesystem access using realpath resolution to prevent traversal and symlink escapes.
 * Resolves both the requested path and granted prefixes via realpath before comparing.
 * Implicitly allows access to the extension's own install directory.
 */
export async function checkFilesystemPermission(
  requestedPath: string,
  granted: ExtensionPermissions,
  extensionInstallDir: string,
): Promise<FilesystemPermissionResult> {
  // Resolve requested path via realpath
  let resolvedPath: string;
  try {
    resolvedPath = await realpath(requestedPath);
  } catch {
    // Path doesn't exist -- deny
    return { allowed: false, resolvedPath: requestedPath };
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
    return { allowed: true, resolvedPath };
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
      return { allowed: true, resolvedPath };
    }
  }

  return { allowed: false, resolvedPath };
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
 * Check if a sensitive operation has been granted always-allow for
 * the given scope tuple. Phase 1: callers are migrating to the
 * scoped key — pass `userId/scope/scopeId` to opt in. Legacy callers
 * that pass only `extensionId + operationType` get the unscoped
 * lookup against the legacy key (for back-compat with the dead
 * `setPermissionChecker` block in `setup-tools.ts`, which is
 * removed in the same Phase 1 commit series).
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
  return value === true ? "allowed" : "needs_confirmation";
}

/**
 * Persist an always-allow grant. Phase 1 callers (PDP) pass full
 * scope args; legacy callers fall back to the unscoped key.
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
  await upsertSetting(key, allowed);
}
