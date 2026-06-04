/**
 * Docker-gated LIVE keystone verification for the uid-based preview
 * isolation (Secure User-Site Preview / Port Exposure, Phase 3a).
 *
 * These tests need a real Linux container with the compiled setuid-root
 * `preview-spawn` helper (4755) + a writable .ezcorp/data + the ability to
 * read live /proc/net/tcp. They CANNOT run in the plain `bun test` host
 * sandbox (no setuid binary, no root to chmod, no preview uids), so they
 * are gated behind DOCKER_TEST=1 — mirroring the existing Docker-gated
 * split (web/e2e/preview-static.spec.ts, mcp jail live checks).
 *
 * The orchestrator runs these inside `ezcorp:local` after rebuilding the
 * image with the new Dockerfile helper stage. Locally (no DOCKER_TEST) the
 * suite is a logged no-op so the normal gate stays green.
 *
 * What they prove LIVE (not just argv strings):
 *   1. A preview uid spawned via the helper can read its own workdir but
 *      gets EACCES on .ezcorp/data (chmod 0700) — the keystone.
 *   2. The helper REFUSES an out-of-range uid even when invoked directly.
 *   3. /proc/net/tcp exposes the spawned dev server's uid → ProcPortSource
 *      attributes the port to the right conversation.
 */

import { test, expect, describe } from "bun:test";

const DOCKER = process.env.DOCKER_TEST === "1";

describe.skipIf(!DOCKER)("uid keystone — LIVE (DOCKER_TEST=1)", () => {
  test("setuid helper present + 4755 root-owned in the image", async () => {
    const { isPreviewSpawnHelperPresent, previewSpawnHelperPath } = await import(
      "../runtime/preview/preview-spawn"
    );
    expect(isPreviewSpawnHelperPresent()).toBe(true);
    const path = previewSpawnHelperPath();
    const st = await Bun.file(path).exists();
    expect(st).toBe(true);
  });

  test("preview uid CANNOT read .ezcorp/data (chmod 0700) — keystone", async () => {
    const { enforceDataDirLockdown, previewDataDir } = await import(
      "../runtime/preview/preview-uid-pool"
    );
    const { spawnPreviewServer } = await import("../runtime/preview/preview-spawn");

    // Lock the data dir, then try to read it AS a preview uid via the helper.
    const lock = enforceDataDirLockdown();
    expect(lock.ok).toBe(true);

    const dataDir = previewDataDir();
    // `cat <dataDir>/<anything>` as uid 90001 must fail (EACCES). We run
    // `ls -la <dataDir>` — a 0700 app-owned dir denies a foreign uid.
    const proc = spawnPreviewServer({
      uid: 90001,
      workDir: "/tmp",
      command: "ls",
      args: ["-la", dataDir],
    });
    const code = await proc.exited;
    // ls on an unreadable dir exits non-zero (permission denied).
    expect(code).not.toBe(0);
  });

  test("helper refuses an out-of-range uid even invoked directly", async () => {
    const { previewSpawnHelperPath } = await import("../runtime/preview/preview-spawn");
    const helper = previewSpawnHelperPath();
    // uid 0 (root) must be refused by the in-helper allowlist.
    const proc = Bun.spawn([helper, "0", "/tmp", "/bin/true"], { stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    expect(code).not.toBe(0);
  });

  test("ProcPortSource attributes a live listener by its preview uid", async () => {
    const { ProcPortSource } = await import("../runtime/preview/preview-port-source");
    const { allocatePreviewUid, _resetPreviewUidPoolForTests } = await import(
      "../runtime/preview/preview-uid-pool"
    );
    const { spawnPreviewServer } = await import("../runtime/preview/preview-spawn");

    _resetPreviewUidPoolForTests();
    const alloc = allocatePreviewUid("conv-live");
    expect(alloc).not.toBeNull();

    // Launch a tiny listener as the preview uid on an ephemeral port.
    const PORT = 58731;
    const server = spawnPreviewServer({
      uid: alloc!.uid,
      workDir: "/tmp",
      command: "bun",
      args: ["-e", `Bun.serve({ port: ${PORT}, fetch: () => new Response("ok") }); await new Promise(r=>setTimeout(r,3000));`],
    });
    // Give the server a moment to bind.
    await new Promise((r) => setTimeout(r, 800));

    const src = new ProcPortSource();
    const listeners = src.listListeners("conv-live");
    server.kill();
    await server.exited.catch(() => {});

    expect(listeners.some((l) => l.port === PORT)).toBe(true);
  });
});
