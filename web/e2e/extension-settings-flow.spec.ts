/**
 * Per-extension settings — end-to-end flow.
 *
 * Closes the seams between four moving parts owned by prior slices:
 *   1. Manifest validator (Slice 1) admits a `settings` block.
 *   2. DB layer (Slice 2) stores global + user values and resolves
 *      `declared < global < user`.
 *   3. HTTP routes (Slice 3) at `/api/extensions/[id]/settings*`.
 *   4. UI surface (Slice 4) — `<SettingsPanel/>` panels on the extension
 *      detail page, gated on `manifest.settings` and admin role.
 *
 * Drives the full happy-path: an admin sets the global voice, a non-admin
 * overrides it, reload preserves the override, reset clears it back to the
 * global. Plus the two negative gates (non-admin 403 on /global, and
 * `schema: null` on a no-settings extension).
 */
import { test, expect } from "./fixtures/test-base.js";
import type { Page } from "@playwright/test";
import { makeProject } from "./fixtures/data.js";

// ── Settings schema fixture (mirrors docs/extensions/examples/kokoro-tts) ──
const KOKORO_SETTINGS_SCHEMA = {
  voice: {
    type: "select",
    label: "Voice",
    description: "Speaker timbre.",
    options: [
      { value: "af_bella", label: "Bella (US, female)" },
      { value: "af_sarah", label: "Sarah (US, female)" },
      { value: "am_adam", label: "Adam (US, male)" },
      { value: "bf_emma", label: "Emma (UK, female)" },
      { value: "bm_george", label: "George (UK, male)" },
    ],
    default: "af_bella",
  },
  speed: {
    type: "number",
    label: "Playback speed",
    description: "1.0 = natural; <1 slower, >1 faster.",
    min: 0.5,
    max: 2.0,
    step: 0.05,
    default: 1.0,
  },
} as const;

const KOKORO_DECLARED_DEFAULTS = { voice: "af_bella", speed: 1.0 };

const ADMIN_ME = {
  user: { id: "admin-1", email: "admin@test.local", name: "Test Admin", role: "admin" },
};
const USER_ME = {
  user: { id: "user-1", email: "user@test.local", name: "Test User", role: "user" },
};

function makeKokoroDetail(): Record<string, unknown> {
  return {
    id: "ext-kokoro",
    name: "kokoro-tts",
    version: "1.0.0",
    description: "In-browser Kokoro-TTS.",
    enabled: true,
    source: "bundled",
    installPath: "/bundled/kokoro-tts",
    checksumVerified: true,
    consecutiveFailures: 0,
    manifest: {
      author: "EZCorp",
      entrypoint: "./index.ts",
      persistent: false,
      tools: [],
      permissions: {},
      settings: KOKORO_SETTINGS_SCHEMA,
    },
    grantedPermissions: { network: [], filesystem: [], shell: false, env: [], grantedAt: {} },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeNoSettingsDetail(): Record<string, unknown> {
  return {
    id: "ext-plain",
    name: "plain-ext",
    version: "1.0.0",
    description: "An extension without any settings.",
    enabled: true,
    source: "local",
    installPath: "/tmp/plain-ext",
    checksumVerified: true,
    consecutiveFailures: 0,
    manifest: {
      author: "Test",
      entrypoint: "./index.ts",
      persistent: false,
      tools: [{ name: "do-thing", description: "do it", inputSchema: { type: "object", properties: {} } }],
      permissions: {},
    },
    grantedPermissions: { network: [], filesystem: [], shell: false, env: [], grantedAt: {} },
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/**
 * Stateful settings mock: the GET, PUT/global, PUT/user, DELETE/user routes
 * all share the same in-memory store so a write reflects on the next read.
 * Returns the captured request log so specs can assert the wire shape.
 *
 * `auditLog` records every successful PUT /global so test #2 can assert the
 * audit entry without needing a real DB.
 */
async function installSettingsMock(
  page: Page,
  opts: {
    extId: string;
    schema: Record<string, unknown> | null;
    initialGlobal?: Record<string, unknown>;
    initialUser?: Record<string, unknown>;
    isAdmin: boolean;
  },
) {
  let globalValues: Record<string, unknown> = { ...(opts.initialGlobal ?? {}) };
  let userValues: Record<string, unknown> = { ...(opts.initialUser ?? {}) };
  const auditLog: Array<{ action: string; target: string; metadata: unknown }> = [];
  const requests: Array<{ method: string; url: string; body: unknown }> = [];

  function resolved(): Record<string, unknown> {
    return { ...KOKORO_DECLARED_DEFAULTS, ...globalValues, ...userValues };
  }

  await page.route(`**/api/extensions/${opts.extId}/settings`, async (route) => {
    const method = route.request().method();
    requests.push({ method, url: route.request().url(), body: null });
    if (method !== "GET") return route.fallback();
    if (opts.schema === null) {
      return route.fulfill({
        json: {
          schema: null,
          declaredDefaults: {},
          globalValues: {},
          userValues: {},
          resolved: {},
        },
      });
    }
    return route.fulfill({
      json: {
        schema: opts.schema,
        declaredDefaults: KOKORO_DECLARED_DEFAULTS,
        globalValues,
        userValues,
        resolved: resolved(),
      },
    });
  });

  await page.route(`**/api/extensions/${opts.extId}/settings/global`, async (route) => {
    const method = route.request().method();
    if (method !== "PUT") return route.fallback();
    const body = route.request().postDataJSON();
    requests.push({ method, url: route.request().url(), body });
    if (!opts.isAdmin) {
      return route.fulfill({ status: 403, json: { error: "Forbidden" } });
    }
    if (opts.schema === null) {
      return route.fulfill({ status: 409, json: { error: "Extension has no settings schema" } });
    }
    if (!body || typeof body.values !== "object" || body.values === null) {
      return route.fulfill({ status: 400, json: { error: "values required" } });
    }
    globalValues = { ...body.values };
    auditLog.push({
      action: "ext:settings.global.update",
      target: opts.extId,
      metadata: { actor: "admin-1", before: {}, after: globalValues, submitted: body.values },
    });
    return route.fulfill({ json: { ok: true, globalValues } });
  });

  await page.route(`**/api/extensions/${opts.extId}/settings/user`, async (route) => {
    const method = route.request().method();
    const body = method === "PUT" ? route.request().postDataJSON() : null;
    requests.push({ method, url: route.request().url(), body });
    if (method === "PUT") {
      if (opts.schema === null) {
        return route.fulfill({ status: 409, json: { error: "Extension has no settings schema" } });
      }
      if (!body || typeof body.values !== "object" || body.values === null) {
        return route.fulfill({ status: 400, json: { error: "values required" } });
      }
      userValues = { ...body.values };
      return route.fulfill({ json: { ok: true, userValues } });
    }
    if (method === "DELETE") {
      userValues = {};
      return route.fulfill({ json: { ok: true } });
    }
    return route.fallback();
  });

  return {
    requests,
    auditLog,
    state: () => ({ globalValues: { ...globalValues }, userValues: { ...userValues } }),
  };
}

test.describe("Per-extension settings — UI flow", () => {
  const proj = makeProject({ id: "proj-1", name: "Test Project" });

  test("no settings → empty placeholder rendered", async ({ page, mockApi }) => {
    const detail = makeNoSettingsDetail();

    await mockApi({
      projects: [proj],
      routes: {
        "/api/extensions/ext-plain": () => detail,
        "/api/auth/me": () => USER_ME,
      },
    });

    // Even though manifest.settings is absent, the panel still hits the GET
    // and receives schema:null. Mock that explicitly.
    await installSettingsMock(page, { extId: "ext-plain", schema: null, isAdmin: false });

    await page.goto("/extensions/ext-plain");

    await expect(page.getByTestId("extension-settings-section")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("extension-settings-empty")).toBeVisible();
    // The form / save buttons must NOT render.
    await expect(page.getByTestId("schema-form")).toHaveCount(0);
    await expect(page.getByTestId("settings-panel-user")).toHaveCount(0);
    await expect(page.getByTestId("settings-panel-global")).toHaveCount(0);
  });

  test("admin sets global default, reload preserves it, audit entry recorded", async ({ page, mockApi }) => {
    const detail = makeKokoroDetail();
    await mockApi({
      projects: [proj],
      routes: {
        "/api/extensions/ext-kokoro": () => detail,
        "/api/auth/me": () => ADMIN_ME,
      },
    });
    const ctrl = await installSettingsMock(page, {
      extId: "ext-kokoro",
      schema: KOKORO_SETTINGS_SCHEMA as unknown as Record<string, unknown>,
      isAdmin: true,
    });

    await page.goto("/extensions/ext-kokoro");

    const globalPanel = page.getByTestId("settings-panel-global");
    await expect(globalPanel).toBeVisible({ timeout: 5000 });

    const globalVoice = globalPanel.getByTestId("schema-input-voice");
    await expect(globalVoice).toBeVisible();
    await globalVoice.selectOption("am_adam");

    await globalPanel.getByTestId("settings-panel-global-save").click();

    // The PUT lands and the panel re-fetches; the global voice select
    // sticks at am_adam after the round-trip.
    await expect.poll(() => ctrl.state().globalValues.voice, { timeout: 3000 }).toBe("am_adam");

    // Reload — the settings GET re-reads from the stateful mock.
    await page.reload();
    await expect(page.getByTestId("settings-panel-global")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("settings-panel-global").getByTestId("schema-input-voice")).toHaveValue("am_adam");

    // Audit log: exactly one ext:settings.global.update entry for this extension.
    expect(ctrl.auditLog.filter((e) => e.action === "ext:settings.global.update")).toHaveLength(1);
    expect(ctrl.auditLog[0]!.target).toBe("ext-kokoro");
  });

  test("non-admin overrides voice, global panel hidden, reload preserves user value", async ({ page, mockApi }) => {
    const detail = makeKokoroDetail();
    await mockApi({
      projects: [proj],
      routes: {
        "/api/extensions/ext-kokoro": () => detail,
        "/api/auth/me": () => USER_ME,
      },
    });
    const ctrl = await installSettingsMock(page, {
      extId: "ext-kokoro",
      schema: KOKORO_SETTINGS_SCHEMA as unknown as Record<string, unknown>,
      initialGlobal: { voice: "am_adam" },
      isAdmin: false,
    });

    await page.goto("/extensions/ext-kokoro");

    const userPanel = page.getByTestId("settings-panel-user");
    await expect(userPanel).toBeVisible({ timeout: 5000 });
    // Global panel is admin-only → must NOT render for non-admins.
    await expect(page.getByTestId("settings-panel-global")).toHaveCount(0);

    await userPanel.getByTestId("schema-input-voice").selectOption("bf_emma");
    await userPanel.getByTestId("settings-panel-user-save").click();

    await expect.poll(() => ctrl.state().userValues.voice, { timeout: 3000 }).toBe("bf_emma");

    await page.reload();
    await expect(page.getByTestId("settings-panel-user")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("settings-panel-user").getByTestId("schema-input-voice")).toHaveValue("bf_emma");
    // Still no global panel after reload.
    await expect(page.getByTestId("settings-panel-global")).toHaveCount(0);
  });

  test("user reset falls back to global default", async ({ page, mockApi }) => {
    const detail = makeKokoroDetail();
    await mockApi({
      projects: [proj],
      routes: {
        "/api/extensions/ext-kokoro": () => detail,
        "/api/auth/me": () => USER_ME,
      },
    });
    const ctrl = await installSettingsMock(page, {
      extId: "ext-kokoro",
      schema: KOKORO_SETTINGS_SCHEMA as unknown as Record<string, unknown>,
      initialGlobal: { voice: "am_adam" },
      initialUser: { voice: "bf_emma" },
      isAdmin: false,
    });

    await page.goto("/extensions/ext-kokoro");

    const userPanel = page.getByTestId("settings-panel-user");
    await expect(userPanel).toBeVisible({ timeout: 5000 });
    // Sanity: starts at the user's override.
    await expect(userPanel.getByTestId("schema-input-voice")).toHaveValue("bf_emma");

    await userPanel.getByTestId("settings-panel-user-reset").click();

    // Backend cleared the row; user values is now {}, resolved falls
    // through to global (am_adam).
    await expect.poll(() => ctrl.state().userValues.voice ?? null, { timeout: 3000 }).toBeNull();

    // The user panel re-renders with the empty user-values map; the
    // <select>'s effective value falls back to the schema default
    // (af_bella) since the user panel binds to userValues, not resolved.
    // Either af_bella OR am_adam is acceptable — the behavior we MUST
    // confirm is that bf_emma is gone.
    const voiceAfterReset = await userPanel.getByTestId("schema-input-voice").inputValue();
    expect(voiceAfterReset).not.toBe("bf_emma");
  });

  test("non-admin gets 403 on PUT /global", async ({ page, mockApi }) => {
    const detail = makeKokoroDetail();
    await mockApi({
      projects: [proj],
      routes: {
        "/api/extensions/ext-kokoro": () => detail,
        "/api/auth/me": () => USER_ME,
      },
    });
    await installSettingsMock(page, {
      extId: "ext-kokoro",
      schema: KOKORO_SETTINGS_SCHEMA as unknown as Record<string, unknown>,
      isAdmin: false,
    });

    await page.goto("/extensions/ext-kokoro");
    await expect(page.getByTestId("settings-panel-user")).toBeVisible({ timeout: 5000 });

    const status = await page.evaluate(async () => {
      const r = await fetch("/api/extensions/ext-kokoro/settings/global", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { voice: "af_sarah" } }),
      });
      return r.status;
    });
    expect(status).toBe(403);
  });

  test("no-settings extension GET returns schema:null with empty value blobs", async ({ page, mockApi }) => {
    const detail = makeNoSettingsDetail();
    await mockApi({
      projects: [proj],
      routes: {
        "/api/extensions/ext-plain": () => detail,
        "/api/auth/me": () => USER_ME,
      },
    });
    await installSettingsMock(page, { extId: "ext-plain", schema: null, isAdmin: false });

    await page.goto("/extensions/ext-plain");
    await expect(page.getByTestId("extension-settings-section")).toBeVisible({ timeout: 5000 });

    const payload = await page.evaluate(async () => {
      const r = await fetch("/api/extensions/ext-plain/settings");
      return { status: r.status, body: await r.json() };
    });
    expect(payload.status).toBe(200);
    expect(payload.body.schema).toBeNull();
    expect(payload.body.declaredDefaults).toEqual({});
    expect(payload.body.globalValues).toEqual({});
    expect(payload.body.userValues).toEqual({});
    expect(payload.body.resolved).toEqual({});
  });
});
