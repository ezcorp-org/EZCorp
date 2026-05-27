import { test, expect, describe, afterEach } from "bun:test";
import {
  readCredentials,
  buildTransportSpec,
  resolveClient,
  getProductionClient,
  _setSubstackClientForTests,
  _setTransportFactoryForTests,
  _resetSubstackClientForTests,
  type SubstackClient,
  type SubstackCredentials,
  type LiveTransport,
} from "../lib/substack-client";

const CREDS: SubstackCredentials = {
  publicationUrl: "https://me.substack.com",
  sessionToken: "tok-xyz",
  userId: "12345",
};

const SETTINGS = {
  substack_publication_url: CREDS.publicationUrl,
  substack_session_token: CREDS.sessionToken,
  substack_user_id: CREDS.userId,
};

function fakeClient(): SubstackClient {
  return {
    async listOwnPostComments() {
      return [];
    },
    async postCommentReply() {
      return { ok: true };
    },
    async listNewSubscribers(c) {
      return { subscribers: [], cursor: c ?? "" };
    },
    async sendDirectMessage() {
      return { ok: true };
    },
    async listNote(id) {
      return { id, author: "", body: "" };
    },
    async postNoteComment() {
      return { ok: true };
    },
  };
}

/**
 * A fake low-level transport that records every `callTool` and returns a
 * scripted response. Mirrors the MCP `Client` surface `buildLiveClient`
 * consumes — lets the production client-building wiring run without the
 * SDK import or a spawned child.
 */
function fakeTransport(
  respond: (req: {
    name: string;
    arguments: Record<string, unknown>;
  }) =>
    | { content?: Array<{ type: string; text?: string }>; isError?: boolean }
    | Promise<{ content?: Array<{ type: string; text?: string }>; isError?: boolean }>,
) {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const transport: LiveTransport = {
    async callTool(req) {
      calls.push(req);
      return respond(req);
    },
  };
  return { transport, calls };
}

afterEach(() => {
  _resetSubstackClientForTests();
});

describe("readCredentials", () => {
  test("returns creds when all three settings are present + non-empty", () => {
    expect(readCredentials(SETTINGS)).toEqual(CREDS);
  });

  test("returns null when any setting is missing", () => {
    expect(readCredentials({})).toBeNull();
    expect(readCredentials({ substack_publication_url: CREDS.publicationUrl })).toBeNull();
    expect(
      readCredentials({
        substack_publication_url: CREDS.publicationUrl,
        substack_session_token: CREDS.sessionToken,
      }),
    ).toBeNull();
  });

  test("returns null for blank / non-string values", () => {
    expect(
      readCredentials({ ...SETTINGS, substack_session_token: "" }),
    ).toBeNull();
    expect(
      readCredentials({ ...SETTINGS, substack_user_id: 123 as unknown as string }),
    ).toBeNull();
  });

  test("undefined settings → null", () => {
    expect(readCredentials(undefined)).toBeNull();
  });
});

describe("buildTransportSpec", () => {
  test("spawn shape is npx -y substack-mcp@latest with the allowlisted env", () => {
    const spec = buildTransportSpec(CREDS);
    expect(spec.command).toBe("npx");
    expect(spec.args).toEqual(["-y", "substack-mcp@latest"]);
    expect(spec.env.SUBSTACK_PUBLICATION_URL).toBe(CREDS.publicationUrl);
    expect(spec.env.SUBSTACK_SESSION_TOKEN).toBe(CREDS.sessionToken);
    expect(spec.env.SUBSTACK_USER_ID).toBe(CREDS.userId);
    // Only the 5 allowlisted keys — never the host's full process.env.
    expect(Object.keys(spec.env).sort()).toEqual([
      "HOME",
      "PATH",
      "SUBSTACK_PUBLICATION_URL",
      "SUBSTACK_SESSION_TOKEN",
      "SUBSTACK_USER_ID",
    ]);
  });
});

describe("resolveClient", () => {
  test("returns the injected test client when set (no creds needed)", async () => {
    const c = fakeClient();
    _setSubstackClientForTests(c);
    const res = await resolveClient({});
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.client).toBe(c);
  });

  test("MISSING_CREDENTIALS when no client + no creds", async () => {
    _setSubstackClientForTests(null);
    const res = await resolveClient({});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("MISSING_CREDENTIALS");
      expect(res.error).toContain("credentials missing");
    }
  });

  test("builds the production client over the injected transport + threads the transport spec", async () => {
    _setSubstackClientForTests(null);
    let seenCommand: string | undefined;
    let seenArgs: string[] | undefined;
    _setTransportFactoryForTests(async (transport) => {
      seenCommand = transport.command;
      seenArgs = transport.args;
      return fakeTransport(() => ({ content: [{ type: "text", text: "ok" }] })).transport;
    });
    const res = await resolveClient(SETTINGS);
    expect(res.ok).toBe(true);
    // The returned client is the REAL built client (not the fake transport).
    if (res.ok) expect(typeof res.client.postCommentReply).toBe("function");
    // The transport spec built from creds was threaded into the factory.
    expect(seenCommand).toBe("npx");
    expect(seenArgs).toEqual(["-y", "substack-mcp@latest"]);
  });

  test("transport factory throw → TRANSPORT_ERROR (no crash)", async () => {
    _setSubstackClientForTests(null);
    _setTransportFactoryForTests(async () => {
      throw new Error("spawn ENOENT");
    });
    const res = await resolveClient(SETTINGS);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("TRANSPORT_ERROR");
      expect(res.error).toContain("spawn ENOENT");
    }
  });
});

describe("getProductionClient", () => {
  test("memoizes the client across calls within a subprocess lifetime", async () => {
    let factoryCalls = 0;
    _setTransportFactoryForTests(async () => {
      factoryCalls++;
      return fakeTransport(() => ({})).transport;
    });
    const a = await getProductionClient(CREDS);
    const b = await getProductionClient(CREDS);
    expect(a).toBe(b);
    expect(factoryCalls).toBe(1);
  });
});

// ── buildLiveClient wiring (over an injected low-level transport) ─
//
// The whole point of the low-level seam: every line of buildLiveClient
// EXCEPT the dynamic-import/connect else-branch runs here. We drive the
// returned client's methods and assert callText's result mapping + the
// per-method dispatch (tool name + args), plus the read-method stubs.

describe("buildLiveClient — client wiring over the injected transport", () => {
  async function clientWith(
    respond: Parameters<typeof fakeTransport>[0],
  ): Promise<{ client: SubstackClient; calls: ReturnType<typeof fakeTransport>["calls"] }> {
    const { transport, calls } = fakeTransport(respond);
    _setTransportFactoryForTests(async () => transport);
    const client = await getProductionClient(CREDS);
    return { client, calls };
  }

  test("send methods route through callTool with the right tool name + args", async () => {
    const { client, calls } = await clientWith((req) => ({
      content: [{ type: "text", text: `${req.name}-id` }],
    }));

    const reply = await client.postCommentReply({
      commentId: "c-1",
      postId: "p-1",
      body: "hi",
    });
    expect(reply).toEqual({ ok: true, id: "post_comment_reply-id" });

    const dm = await client.sendDirectMessage({ subscriberId: "s-1", body: "welcome" });
    expect(dm).toEqual({ ok: true, id: "send_direct_message-id" });

    const note = await client.postNoteComment({ noteId: "n-1", body: "nice" });
    expect(note).toEqual({ ok: true, id: "post_note_comment-id" });

    expect(calls.map((c) => c.name)).toEqual([
      "post_comment_reply",
      "send_direct_message",
      "post_note_comment",
    ]);
    // postCommentReply forwards the publication url + the reply fields.
    expect(calls[0]?.arguments).toEqual({
      publicationUrl: CREDS.publicationUrl,
      commentId: "c-1",
      postId: "p-1",
      body: "hi",
    });
    expect(calls[1]?.arguments).toEqual({ subscriberId: "s-1", body: "welcome" });
    expect(calls[2]?.arguments).toEqual({ noteId: "n-1", body: "nice" });
  });

  test("callText: empty/non-text content → ok with undefined id", async () => {
    const { client } = await clientWith(() => ({ content: [] }));
    expect(await client.postCommentReply({ commentId: "c", postId: "p", body: "b" })).toEqual({
      ok: true,
      id: undefined,
    });
  });

  test("callText: isError with text → ok:false with that text", async () => {
    const withText = await clientWith(() => ({
      content: [{ type: "text", text: "rate limited" }],
      isError: true,
    }));
    expect(await withText.client.sendDirectMessage({ subscriberId: "s", body: "b" })).toEqual({
      ok: false,
      error: "rate limited",
    });
  });

  test("callText: isError without text → ok:false with the tool-name fallback", async () => {
    // Fresh test → afterEach reset cleared the memoized client first.
    const noText = await clientWith(() => ({ isError: true }));
    expect(await noText.client.postNoteComment({ noteId: "n", body: "b" })).toEqual({
      ok: false,
      error: "post_note_comment reported isError",
    });
  });

  test("callText: a thrown transport error → ok:false with the message", async () => {
    const { client } = await clientWith(() => {
      throw new Error("socket hangup");
    });
    expect(await client.postCommentReply({ commentId: "c", postId: "p", body: "b" })).toEqual({
      ok: false,
      error: "socket hangup",
    });
  });

  test("read methods return their stub defaults (LIVE-UNTESTED placeholders)", async () => {
    const { client, calls } = await clientWith(() => ({}));
    expect(await client.listOwnPostComments({})).toEqual([]);
    expect(await client.listNewSubscribers("cur-9")).toEqual({
      subscribers: [],
      cursor: "cur-9",
    });
    expect(await client.listNewSubscribers(null)).toEqual({ subscribers: [], cursor: "" });
    expect(await client.listNote("n-7")).toEqual({ id: "n-7", author: "", body: "" });
    // The read stubs never touch the transport.
    expect(calls).toHaveLength(0);
  });
});
