import { eq, and } from "drizzle-orm";
import { getDb } from "../connection";
import { extensionSettingsUser, extensions } from "../schema";
import type {
  SettingsField,
  SettingsSchema,
  ExtensionManifestV2,
} from "../../extensions/types";

/** Pure: pulls each field's `default` from the manifest schema. */
export function getDeclaredDefaults(
  schema: SettingsSchema | undefined,
): Record<string, unknown> {
  if (!schema) return {};
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(schema)) {
    if (field.default !== undefined) out[key] = field.default;
  }
  return out;
}

/** Per-type validity check used by `clampSettings`. Mirrors the per-field
 *  rules in src/extensions/manifest.ts but operates on a single value
 *  rather than a default. Returns the value as-is when valid, otherwise
 *  `undefined` to signal the caller should drop it. */
function coerceValue(field: SettingsField, value: unknown): unknown | undefined {
  switch (field.type) {
    case "select": {
      if (typeof value !== "string") return undefined;
      if (!field.options.some((o) => o.value === value)) return undefined;
      return value;
    }
    case "text": {
      if (typeof value !== "string") return undefined;
      if (field.minLength !== undefined && value.length < field.minLength) return undefined;
      if (field.maxLength !== undefined && value.length > field.maxLength) return undefined;
      if (field.pattern !== undefined) {
        let re: RegExp;
        try {
          re = new RegExp(field.pattern);
        } catch {
          return undefined;
        }
        if (!re.test(value)) return undefined;
      }
      return value;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
      if (field.min !== undefined && value < field.min) return undefined;
      if (field.max !== undefined && value > field.max) return undefined;
      if (field.integer === true && !Number.isInteger(value)) return undefined;
      return value;
    }
    case "boolean": {
      if (typeof value !== "boolean") return undefined;
      return value;
    }
  }
}

/** Pure: clamps a values blob against the schema. Drops unknown keys and
 *  invalid values. Never throws. */
export function clampSettings(
  schema: SettingsSchema | undefined,
  values: unknown,
): Record<string, unknown> {
  if (!schema) return {};
  if (!values || typeof values !== "object" || Array.isArray(values)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(values as Record<string, unknown>)) {
    const field = schema[key];
    if (!field) continue;
    const coerced = coerceValue(field, raw);
    if (coerced !== undefined) out[key] = coerced;
  }
  return out;
}

async function getManifestSettings(
  extensionId: string,
): Promise<SettingsSchema | undefined> {
  const db = getDb();
  const rows = await db
    .select({ manifest: extensions.manifest })
    .from(extensions)
    .where(eq(extensions.id, extensionId));
  const manifest = rows[0]?.manifest as ExtensionManifestV2 | undefined;
  return manifest?.settings;
}

export async function getUserSettings(
  userId: string,
  extensionId: string,
): Promise<Record<string, unknown>> {
  const db = getDb();
  const rows = await db
    .select({ values: extensionSettingsUser.values })
    .from(extensionSettingsUser)
    .where(
      and(
        eq(extensionSettingsUser.userId, userId),
        eq(extensionSettingsUser.extensionId, extensionId),
      ),
    );
  return rows[0]?.values ?? {};
}

export async function setUserSettings(
  userId: string,
  extensionId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const schema = await getManifestSettings(extensionId);
  const clean = clampSettings(schema, values);
  const db = getDb();
  const now = new Date();
  await db
    .insert(extensionSettingsUser)
    .values({
      userId,
      extensionId,
      values: clean,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [extensionSettingsUser.userId, extensionSettingsUser.extensionId],
      set: { values: clean, updatedAt: now },
    });
}

export async function clearUserSettings(
  userId: string,
  extensionId: string,
): Promise<void> {
  const db = getDb();
  await db
    .delete(extensionSettingsUser)
    .where(
      and(
        eq(extensionSettingsUser.userId, userId),
        eq(extensionSettingsUser.extensionId, extensionId),
      ),
    );
}

/** Resolves the effective settings for a (user, extension) pair.
 *  Merge order: declared defaults < user override. Unknown keys are
 *  clamped against the manifest schema. When the manifest has no
 *  `settings` block, returns `{}`. A `null` userId returns just the
 *  declared defaults (used by tool-call paths that have no user). */
export async function resolveExtensionSettings(
  extensionId: string,
  userId: string | null,
): Promise<Record<string, unknown>> {
  const schema = await getManifestSettings(extensionId);
  if (!schema) return {};
  const declared = getDeclaredDefaults(schema);
  if (userId === null) return declared;
  const user = clampSettings(
    schema,
    await getUserSettings(userId, extensionId),
  );
  return { ...declared, ...user };
}
