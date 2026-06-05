/**
 * Secure-preview reaper (Phase 3b). reapPreviewConversation must kill the
 * dev-server processes, revoke the DB previews, release the uid + netns, and
 * drop the watcher's watch — and survive any single step failing.
 */
import { test, expect, describe } from "bun:test";
import { reapPreviewConversation } from "../runtime/preview/preview-reaper";

function deps(over: Record<string, unknown> = {}) {
  const calls = {
    killed: [] as string[],
    revoked: [] as string[],
    uid: [] as string[],
    netns: [] as string[],
    unwatched: [] as string[],
  };
  const d = {
    killProcesses: (c: string) => { calls.killed.push(c); return 2; },
    revokePreviews: async (c: string) => { calls.revoked.push(c); return 3; },
    reapUid: (c: string) => { calls.uid.push(c); return true; },
    reapNetns: (c: string) => { calls.netns.push(c); return false; },
    unwatch: (c: string) => { calls.unwatched.push(c); },
    ...over,
  };
  return { d, calls };
}

describe("reapPreviewConversation", () => {
  test("kills proc + revokes + releases uid + drops watch (full sweep)", async () => {
    const { d, calls } = deps();
    const res = await reapPreviewConversation("conv-1", d);
    expect(res).toMatchObject({
      conversationId: "conv-1",
      processesKilled: 2,
      previewsRevoked: 3,
      uidReleased: true,
    });
    expect(calls.killed).toEqual(["conv-1"]);
    expect(calls.revoked).toEqual(["conv-1"]);
    expect(calls.uid).toEqual(["conv-1"]);
    expect(calls.netns).toEqual(["conv-1"]);
    expect(calls.unwatched).toEqual(["conv-1"]);
  });

  test("empty conversationId is a no-op", async () => {
    const { d, calls } = deps();
    const res = await reapPreviewConversation("", d);
    expect(res.processesKilled).toBe(0);
    expect(calls.killed).toHaveLength(0);
  });

  test("a failing revoke does not block proc-kill or uid-release", async () => {
    const { d, calls } = deps({
      revokePreviews: async () => { throw new Error("db down"); },
    });
    const res = await reapPreviewConversation("conv-2", d);
    expect(res.processesKilled).toBe(2); // kill still ran
    expect(res.previewsRevoked).toBe(0); // revoke failed → 0
    expect(res.uidReleased).toBe(true); // uid still released
    expect(calls.unwatched).toEqual(["conv-2"]); // watch still dropped
  });

  test("a failing kill does not block the rest", async () => {
    const { d } = deps({
      killProcesses: () => { throw new Error("kill boom"); },
    });
    const res = await reapPreviewConversation("conv-3", d);
    expect(res.processesKilled).toBe(0);
    expect(res.previewsRevoked).toBe(3); // revoke still ran
    expect(res.uidReleased).toBe(true);
  });
});
