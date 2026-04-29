/**
 * Phase 48 Wave 4 — page-level test for /new-project.
 *
 * Mirrors `agents-new-ez-context.component.test.ts`:
 *   - registers an `<EzContext>` with `data.existingProjectPaths` and a
 *     `new-project` form-fill handler
 *   - reads `?prefill=<id>` and shows the ProjectPrefillBanner state
 *     based on the draft's status
 *   - calls `consumeDraft` on submit (covered by the artifact contract;
 *     end-to-end submission is exercised via the e2e flow specs)
 */
import "@testing-library/jest-dom/vitest";
import { render, waitFor, fireEvent } from "@testing-library/svelte";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const { pageState, fetchProjectsMock, getDraftMock, consumeDraftMock } = vi.hoisted(() => ({
	pageState: {
		url: new URL("http://localhost/new-project"),
		route: { id: "/(app)/new-project" },
		params: {} as Record<string, string>,
	},
	fetchProjectsMock: vi.fn(),
	getDraftMock: vi.fn(),
	consumeDraftMock: vi.fn(),
}));

vi.mock("$app/state", () => ({ page: pageState }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

vi.mock("$lib/api.js", () => ({
	fetchProjects: (...args: unknown[]) => fetchProjectsMock(...args),
	createProject: vi.fn(),
	createDir: vi.fn().mockResolvedValue({ path: "/p" }),
	fetchFavicon: vi.fn(),
}));

vi.mock("$lib/stores.svelte.js", () => ({
	refreshProjects: vi.fn(),
	setActiveProjectId: vi.fn(),
}));

vi.mock("$lib/ez/api.js", () => ({
	getDraft: (...args: unknown[]) => getDraftMock(...args),
	consumeDraft: (...args: unknown[]) => consumeDraftMock(...args),
}));

import NewProjectPage from "../routes/(app)/new-project/+page.svelte";
import { readSnapshot, __resetForTests } from "$lib/ez/registry";

beforeEach(() => {
	__resetForTests();
	pageState.url = new URL("http://localhost/new-project");
	fetchProjectsMock.mockReset().mockResolvedValue([
		{ id: "p1", name: "App", path: "/srv/app" },
		{ id: "p2", name: "Site", path: "/srv/site" },
	]);
	getDraftMock.mockReset();
	consumeDraftMock.mockReset();
});

afterEach(() => __resetForTests());

describe("/new-project — EzContext registration", () => {
	test("registers an EzContext entry with `existingProjectPaths` and a `new-project` form handler", async () => {
		render(NewProjectPage);
		await waitFor(() => {
			const snap = readSnapshot();
			expect(snap.length).toBeGreaterThan(0);
			expect(Object.keys(snap[0]!.forms)).toContain("new-project");
		});
		await waitFor(() => {
			const data = readSnapshot()[0]?.data as { existingProjectPaths?: string[] } | undefined;
			expect(data?.existingProjectPaths).toEqual(["/srv/app", "/srv/site"]);
		});
	});

	test("new-project form handler accepts a name+path prefill payload", async () => {
		render(NewProjectPage);
		await waitFor(() => expect(readSnapshot().length).toBeGreaterThan(0));
		const handler = readSnapshot()[0]?.forms["new-project"];
		expect(handler).toBeDefined();
		expect(() => handler!.fill({ name: "Demo", path: "/srv/demo" })).not.toThrow();
	});
});

describe("/new-project — ?prefill hydration", () => {
	test("active draft: shows the prefill banner in active state", async () => {
		pageState.url = new URL("http://localhost/new-project?prefill=draft-1");
		getDraftMock.mockResolvedValue({
			id: "draft-1",
			kind: "project",
			payload: { name: "Demo", path: "/srv/demo" },
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			consumedAt: null,
			consumed: false,
		});
		const { findByTestId } = render(NewProjectPage);
		const banner = await findByTestId("project-prefill-banner");
		expect(banner).toHaveAttribute("data-state", "active");
		expect(getDraftMock).toHaveBeenCalledWith("draft-1");
	});

	test("expired draft: shows the prefill banner in expired state", async () => {
		pageState.url = new URL("http://localhost/new-project?prefill=draft-2");
		getDraftMock.mockResolvedValue({
			id: "draft-2",
			kind: "project",
			payload: {},
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			consumedAt: new Date().toISOString(),
			consumed: true,
		});
		const { findByTestId } = render(NewProjectPage);
		const banner = await findByTestId("project-prefill-banner");
		expect(banner).toHaveAttribute("data-state", "expired");
	});

	test("getDraft 404: shows the expired banner (fail closed)", async () => {
		pageState.url = new URL("http://localhost/new-project?prefill=draft-404");
		getDraftMock.mockRejectedValue(new Error("HTTP 404"));
		const { findByTestId } = render(NewProjectPage);
		const banner = await findByTestId("project-prefill-banner");
		expect(banner).toHaveAttribute("data-state", "expired");
	});

	test("dismiss button hides the banner", async () => {
		pageState.url = new URL("http://localhost/new-project?prefill=draft-1");
		getDraftMock.mockResolvedValue({
			id: "draft-1",
			kind: "project",
			payload: { name: "Demo" },
			expiresAt: new Date(Date.now() + 60_000).toISOString(),
			consumedAt: null,
			consumed: false,
		});
		const { findByTestId, queryByTestId } = render(NewProjectPage);
		await findByTestId("project-prefill-banner");
		await fireEvent.click(await findByTestId("project-prefill-banner-dismiss"));
		await waitFor(() => expect(queryByTestId("project-prefill-banner")).toBeNull());
	});
});

describe("/new-project — no-prefill path", () => {
	test("does not call getDraft when no `?prefill` is present", async () => {
		render(NewProjectPage);
		await waitFor(() => expect(readSnapshot().length).toBeGreaterThan(0));
		expect(getDraftMock).not.toHaveBeenCalled();
	});
});
