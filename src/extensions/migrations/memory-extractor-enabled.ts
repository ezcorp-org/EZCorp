/**
 * Phase 53.4 Stage 1 settings migration:
 * `global:memoryEnabled` → bundled `memory-extractor` extension's
 * per-extension `enabled` setting.
 *
 * Idempotent via the `global:memoryEnabled.migrated_at` sentinel
 * setting. Run once per bundled-install boot from
 * `ensureBundledExtensions` after the memory-extractor row exists.
 *
 * Migration table:
 *   global:memoryEnabled  → extensionSettings.values.enabled
 *     - undefined (never set) → defaults preserved (no DB write)
 *     - true                  → no DB write (matches schema default)
 *     - false                 → write enabled=false per user
 *   global:memoryEnabled.migrated_at = ISO timestamp once done.
 *
 * `global:compactionIntervalHours` is INTENTIONALLY NOT migrated. Per
 * the spec (53.4.4):
 *
 *   > `global:compactionIntervalHours` → if not 6, override the
 *   > schedule. (For v1.3, default-only; custom intervals deferred.)
 *
 * The bundled extension's `Schedule.on("0 0,6,12,18 * * *", ...)` -
 * style 6-hour cron in the manifest is hardcoded for v1.3. (The
 * spelling above intentionally avoids the literal cron `*` `/` `6` `*`
 * pattern so this JSDoc block doesn't accidentally close.) If a user
 * has set the legacy
 * `global:compactionIntervalHours` to a non-default value, this
 * migration logs a warning so operators see the deferred behavior, but
 * does NOT alter the cron — propagating non-default intervals into
 * the manifest would require a manifest re-approval gate that v1.3
 * doesn't ship. v1.4 will surface a per-extension setting for the
 * cadence.
 *
 * The migration NEVER deletes the legacy setting — Stage 2 of the
 * deletion commit handles cleanup once the legacy listener is gone.
 * Today's behavior keeps both readers in sync: the legacy listener at
 * `web/src/lib/server/context.ts` continues to read the global setting
 * directly via `extractMemories`; the bundled extension reads its own
 * per-extension value via `runtime.settings.getMine`. Both should
 * agree post-migration.
 *
 * Failure mode: errors are caught and logged. The legacy listener is
 * still wired during Stage 1, so a migration failure means the bundled
 * extension uses its declared default (`enabled: true`) until the next
 * boot retries — no user-visible regression.
 */

import { getDb } from "../../db/connection";
import { getSetting, upsertSetting } from "../../db/queries/settings";
import {
  setUserSettings,
  getUserSettings,
} from "../../db/queries/extension-settings";
import { users } from "../../db/schema";
import { logger } from "../../logger";

const log = logger.child("memory-extractor-settings-migration");

const LEGACY_KEY = "global:memoryEnabled";
const SENTINEL_KEY = "global:memoryEnabled.migrated_at";
const LEGACY_INTERVAL_KEY = "global:compactionIntervalHours";

export async function migrateMemoryExtractorEnabledSetting(
  memoryExtractorExtensionId: string,
): Promise<void> {
  try {
    // Sentinel check — short-circuit fast path on every boot after the
    // first migration run.
    const sentinel = await getSetting(SENTINEL_KEY);
    if (sentinel != null) return;

    const legacy = await getSetting(LEGACY_KEY);

    // Migrate per-user. The `extension_settings_user` table is keyed on
    // (userId, extensionId); the legacy `global:memoryEnabled` is a
    // server-wide flag, so we apply the same value to every user. This
    // preserves the legacy semantics (one knob disables the pipeline
    // for everyone) while moving the storage into the per-extension
    // settings model that the SchemaForm UI expects.
    if (legacy === false) {
      const allUsers = await getDb().select({ id: users.id }).from(users);
      let migrated = 0;
      let perUserFailures = 0;
      for (const u of allUsers) {
        // Per-user try/catch: a single bad row must not poison the whole
        // migration. Track failures so we DON'T write the sentinel if
        // anything failed — next boot retries the surviving users without
        // re-clobbering the ones that succeeded. Mirrors the
        // distiller-enabled migration's bail-before-sentinel pattern.
        try {
          const existing = await getUserSettings(u.id, memoryExtractorExtensionId);
          if (existing.enabled === false) continue; // already migrated by hand
          await setUserSettings(u.id, memoryExtractorExtensionId, {
            ...existing,
            enabled: false,
          });
          migrated += 1;
        } catch (perUserErr) {
          perUserFailures += 1;
          log.warn("per-user memory-extractor migration failed; will retry on next boot", {
            userId: u.id,
            extensionId: memoryExtractorExtensionId,
            error: perUserErr instanceof Error ? perUserErr.message : String(perUserErr),
          });
        }
      }
      log.info("Migrated memoryEnabled=false to per-user extension settings", {
        userCount: allUsers.length,
        migratedCount: migrated,
        failureCount: perUserFailures,
        extensionId: memoryExtractorExtensionId,
      });
      // Bail before sentinel write so the next boot retries the failed
      // rows. The legacy listener is still wired during Stage 1 so the
      // bundled extension's default applies for any user we couldn't
      // reach this round.
      if (perUserFailures > 0) return;
    } else if (legacy === true) {
      // Explicit enabled=true preserves the manifest default; nothing
      // to write per-user since the schema's `default: true` already
      // covers it.
      log.info("Skipping migration write — legacy enabled=true matches manifest default", {
        extensionId: memoryExtractorExtensionId,
      });
    } else {
      log.info("Skipping migration write — legacy setting never set; defaults preserved", {
        extensionId: memoryExtractorExtensionId,
      });
    }

    // Compaction-interval no-op branch (spec-locked deferral). Detect
    // non-default values so operators see the warning, but DO NOT
    // mutate the manifest's hardcoded cron.
    const customInterval = await getSetting(LEGACY_INTERVAL_KEY);
    if (customInterval != null && Number(customInterval) !== 6) {
      log.warn(
        "Legacy compactionIntervalHours non-default — bundled extension still runs at 6h (v1.4 surfaces a per-extension setting)",
        {
          legacyValue: customInterval,
          extensionId: memoryExtractorExtensionId,
        },
      );
    }

    // Sentinel write — makes step 1 fast on subsequent boots.
    await upsertSetting(SENTINEL_KEY, new Date().toISOString());
  } catch (err) {
    // Non-fatal: legacy listener still works during Stage 1, so a
    // failed migration just means the bundled extension's default
    // (`enabled: true`) takes effect. Next boot retries.
    log.error("Memory-extractor settings migration failed", {
      extensionId: memoryExtractorExtensionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
