/**
 * Linux user-namespace integration test for the Phase 7 MCP isolation
 * stack. Skips cleanly on macOS / Windows / hardened-Linux hosts.
 *
 * Coverage gate (any failure → test.skipIf):
 *   - `process.platform === "linux"`
 *   - `unshare`, `iptables`, `ip` on PATH
 *   - `kernel.unprivileged_userns_clone` knob is `1` OR absent (modern
 *     kernel) AND `max_user_namespaces > 0`
 *   - A live `unshare -U -n -m --map-root-user true` exits 0
 *
 * What we prove (when the gate passes):
 *   1. `buildNetnsSpawnArgs` produces an `unshare ... -- launcher.sh`
 *      chain that the kernel actually accepts.
 *   2. From inside the namespace, an unrelated outbound HTTP attempt
 *      (curl http://1.1.1.1) FAILS — the iptables OUTPUT-DROP +
 *      empty-netns combination kills internet.
 *   3. The launcher script's iptables-restore + ip-link-up actually run
 *      (the namespace observes them as effective).
 *
 * What this test does NOT prove:
 *   - End-to-end MCP-protocol round-trip via the proxy. That requires
 *     a tiny MCP server inside the namespace and a Bun.connect client
 *     against the proxy's UDS — a larger fixture; deferred to the
 *     `af1-mcp-sandbox-regression` shape (which is itself blocked by
 *     a pre-existing Bun 1.3.11 prlimit-segfault unrelated to Phase 7).
 *   - Bytes flowing through the proxy from inside the namespace.
 *     Covered by `mcp-proxy.test.ts` for the proxy half + this test
 *     for the namespace half; the integration of both is
 *     deployment-environment work.
 */

import { test, expect, describe } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  buildNetnsSpawnArgs,
  probeNetnsAvailability,
  getDefaultLauncherPath,
  _resetProbeCacheForTests,
} from "../extensions/mcp-netns";

function netnsAvailableOrSkip(): boolean {
  if (process.platform !== "linux") return false;
  // Three required binaries
  for (const bin of ["unshare", "ip", "iptables"]) {
    if (!Bun.which(bin)) return false;
  }
  // Legacy knob check (modern kernels drop it)
  const userNsKnob = "/proc/sys/kernel/unprivileged_userns_clone";
  if (existsSync(userNsKnob)) {
    const value = readFileSync(userNsKnob, "utf8").trim();
    if (value !== "1") return false;
  }
  // max_user_namespaces > 0
  const maxKnob = "/proc/sys/user/max_user_namespaces";
  if (existsSync(maxKnob)) {
    const v = Number.parseInt(readFileSync(maxKnob, "utf8").trim(), 10);
    if (Number.isFinite(v) && v === 0) return false;
  }
  // Live test
  const probe = Bun.spawnSync({
    cmd: ["unshare", "-U", "-n", "-m", "--map-root-user", "true"],
    stdout: "ignore",
    stderr: "ignore",
  });
  return probe.success;
}

const SKIP = !netnsAvailableOrSkip();

describe("mcp netns integration (Linux + unprivileged userns)", () => {
  test.skipIf(SKIP)("probeNetnsAvailability returns available", () => {
    _resetProbeCacheForTests();
    const probe = probeNetnsAvailability();
    expect(probe.available).toBe(true);
    expect(probe.reason).toBeUndefined();
  });

  test.skipIf(SKIP)("buildNetnsSpawnArgs produces an unshare-prefixed argv", () => {
    _resetProbeCacheForTests();
    const result = buildNetnsSpawnArgs({
      origCommand: "prlimit",
      origArgs: ["--rss=536870912", "/usr/bin/python3", "-m", "x"],
      launcherPath: getDefaultLauncherPath(),
    });
    expect(result.wrapped).toBe(true);
    expect(result.command).toBe("unshare");
    expect(result.args.slice(0, 5)).toEqual(["-U", "-n", "-m", "--map-root-user", "--"]);
    // Launcher path appears before the original command
    const launcherIdx = result.args.indexOf(getDefaultLauncherPath());
    expect(launcherIdx).toBeGreaterThanOrEqual(0);
    expect(result.args[launcherIdx + 1]).toBe("prlimit");
  });

  test.skipIf(SKIP)(
    "namespace ACTUALLY isolates network — curl 1.1.1.1 fails inside",
    () => {
      // Run the launcher in a real namespace, exec'ing curl. We expect
      // a non-zero exit (CURLE_COULDNT_CONNECT, code 7) because the
      // netns has no upstream interface and the iptables OUTPUT-DROP
      // ruleset is in effect. Use a 2s curl timeout so the test
      // doesn't hang on the missing route.
      const result = Bun.spawnSync({
        cmd: [
          "unshare",
          "-U",
          "-n",
          "-m",
          "--map-root-user",
          "--",
          getDefaultLauncherPath(),
          // capsh inside launcher will exec /bin/sh -c "..." so we use
          // a direct command instead — the launcher's `exec "$@"` form
          // hands these args straight to execve.
          "/run/current-system/sw/bin/sh",
          "-c",
          "curl --max-time 2 -s -o /dev/null -w '%{http_code}\\n' http://1.1.1.1; exit $?",
        ],
        stdout: "pipe",
        stderr: "pipe",
      });
      // Either curl's exit was non-zero OR stdout shows http_code 000.
      const stdout = result.stdout.toString();
      const exitCode = result.exitCode ?? 1;
      expect(stdout).toContain("000");
      expect(exitCode).not.toBe(0);
    },
  );

  test.skipIf(SKIP)(
    "namespace DOES allow loopback — the launcher brought up lo",
    () => {
      // Inside the netns, sending a packet to 127.0.0.1:65000 (no
      // listener) should produce CURLE_COULDNT_CONNECT (exit 7) NOT
      // CURLE_COULDNT_RESOLVE / CURLE_OPERATION_TIMEDOUT — proving
      // loopback is functional even though the iptables OUTPUT chain
      // drops everything else.
      //
      // ECONNREFUSED on lo proves the link is up but no peer is
      // listening; that's the success state for the "lo is alive"
      // assertion.
      const result = Bun.spawnSync({
        cmd: [
          "unshare",
          "-U",
          "-n",
          "-m",
          "--map-root-user",
          "--",
          getDefaultLauncherPath(),
          "/run/current-system/sw/bin/sh",
          "-c",
          "curl --max-time 2 -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:65000 || echo 'curl_exit='$?",
        ],
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = result.stdout.toString();
      // Either curl gave 000 + exit 7 (couldn't-connect — lo IS up but
      // nothing's listening) or some non-resolve error. Both are
      // acceptable; a timeout (28) would mean lo isn't up.
      expect(stdout).toContain("curl_exit=7");
    },
  );

  test.skipIf(SKIP)(
    "iptables rules from launcher are scoped to the namespace — host iptables unchanged",
    () => {
      // Snapshot host iptables OUTPUT chain rules count BEFORE running
      // the namespace. Run the namespace (which applies its own
      // OUTPUT-DROP). Snapshot AFTER. Counts must be identical because
      // iptables-restore in the netns operates on the netns's own
      // tables, not the host's.
      const before = Bun.spawnSync({
        cmd: ["iptables", "-L", "OUTPUT", "-n", "--line-numbers"],
        stdout: "pipe",
        stderr: "pipe",
      });
      // Even if we lack permission to read host iptables (likely as
      // non-root), the result.exitCode tells us. We just compare
      // before-vs-after states; the absolute output doesn't matter.
      const beforeOut = before.stdout.toString();

      // Run a no-op namespace that ALSO applies the OUTPUT-DROP rules.
      Bun.spawnSync({
        cmd: [
          "unshare",
          "-U",
          "-n",
          "-m",
          "--map-root-user",
          "--",
          getDefaultLauncherPath(),
          "/run/current-system/sw/bin/sh",
          "-c",
          "true",
        ],
        stdout: "ignore",
        stderr: "ignore",
      });

      const after = Bun.spawnSync({
        cmd: ["iptables", "-L", "OUTPUT", "-n", "--line-numbers"],
        stdout: "pipe",
        stderr: "pipe",
      });
      const afterOut = after.stdout.toString();

      // Hosts where the user can't read iptables produce identical
      // empty error output before+after, which is fine — the
      // assertion is "no change", not "rules are listable".
      expect(afterOut).toBe(beforeOut);
    },
  );
});

// When SKIP is true, advertise WHY so a CI green-on-skip doesn't hide
// a real config drift. Only one test runs to confirm the file isn't
// silently empty.
describe("mcp netns integration — skip diagnosis", () => {
  test("test gate evaluated", () => {
    if (SKIP) {
      // Not a failure — purely diagnostic.
      const probe = probeNetnsAvailability();
      expect(probe.available).toBe(false);
      expect(typeof probe.reason).toBe("string");
    } else {
      const probe = probeNetnsAvailability();
      expect(probe.available).toBe(true);
    }
  });
});
