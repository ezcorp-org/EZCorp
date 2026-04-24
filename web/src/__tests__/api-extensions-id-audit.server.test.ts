/**
 * Server-handler unit tests for /api/extensions/[id]/audit (+server.ts).
 *
 * Admin-only read of per-extension permission audit trail. Covers the
 * auth gates (401 / 403) and the 404 when the extension is unknown.
 * Success path lists audit rows — DB is mocked.
 */

import { test, expect, describe, vi, beforeEach } from "vitest";

vi.mock("$server/db/queries/extensions", () => ({
  getExtension: vi.fn(),
}));

vi.mock("$server/db/queries/audit-log", () => ({
  listAuditForExtension: vi.fn(),
}));

const { getExtension } = await import("$server/db/queries/extensions");
const { listAuditForExtension } = await import("$server/db/queries/audit-log");
const { GET } = await import(
  "../routes/api/extensions/[id]/audit/+server.ts"
);

function makeEvent(opts: {
  id?: string;
  locals?: Record<string, unknown>;
  search?: string;
}) {
  const id = opts.id ?? "ext-1";
  const href = `http://localhost/api/extensions/${id}/audit${opts.search ?? ""}`;
  return {
    url: new URL(href),
    locals: opts.locals ?? {},
    params: { id },
    request: new Request(href),
  } as any;
}

const adminUser = { id: "u1", email: "a@x", name: "a", role: "admin" };
const regularUser = { id: "u2", email: "u@x", name: "u", role: "user" };

describe("GET /api/extensions/[id]/audit", () => {
  beforeEach(() => {
    vi.mocked(getExtension).mockReset();
    vi.mocked(listAuditForExtension).mockReset();
  });

  test("unauthenticated request throws 401", async () => {
    let res: Response | undefined;
    try {
      await GET(makeEvent({ locals: {} }));
      expect.fail("should have thrown");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Response);
      res = thrown as Response;
    }
    expect(res!.status).toBe(401);
  });

  test("non-admin authenticated user throws 403", async () => {
    let res: Response | undefined;
    try {
      await GET(makeEvent({ locals: { user: regularUser } }));
      expect.fail("should have thrown");
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Response);
      res = thrown as Response;
    }
    expect(res!.status).toBe(403);
  });

  test("API-key scope check returns 403 when scope missing", async () => {
    const res = await GET(
      makeEvent({
        locals: { user: adminUser, apiKeyScopes: ["read"] },
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string; required?: string };
    expect(body.error).toBe("Insufficient scope");
    expect(body.required).toBe("admin");
  });

  test("unknown extension returns 404", async () => {
    vi.mocked(getExtension).mockResolvedValue(null as any);
    const res = await GET(makeEvent({ locals: { user: adminUser } }));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Not found");
  });

  test("happy path: returns audit entries", async () => {
    vi.mocked(getExtension).mockResolvedValue({ id: "ext-1" } as any);
    vi.mocked(listAuditForExtension).mockResolvedValue([
      { id: "a1", action: "extension:install" },
    ] as any);
    const res = await GET(makeEvent({ locals: { user: adminUser } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: unknown[] };
    expect(body.entries).toHaveLength(1);
  });

  test("passes limit/offset query params through (clamped)", async () => {
    vi.mocked(getExtension).mockResolvedValue({ id: "ext-1" } as any);
    vi.mocked(listAuditForExtension).mockResolvedValue([] as any);
    const res = await GET(
      makeEvent({
        locals: { user: adminUser },
        search: "?limit=1000&offset=25",
      }),
    );
    expect(res.status).toBe(200);
    // limit is clamped to 500 by the handler
    expect(vi.mocked(listAuditForExtension)).toHaveBeenCalledWith(
      "ext-1",
      { limit: 500, offset: 25 },
    );
  });
});
