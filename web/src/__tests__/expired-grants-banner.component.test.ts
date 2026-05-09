/**
 * Phase 4 (capability-expiry) — DOM tests for ExpiredGrantsBanner.svelte.
 *
 * Covers:
 *   - Empty list → component renders nothing (no banner DOM).
 *   - Single row → row renders with capability + age, click reapprove
 *     calls onReapprove with the right grant metadata.
 *   - Multiple rows → all rendered, each click invokes the callback
 *     with its own grant.
 *   - `isAdmin: false` does NOT hide the row's reapprove button — the
 *     role gate lives on the modal's "Approve forever (admin only)"
 *     button, NOT on the banner action.
 */
import "@testing-library/jest-dom/vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { describe, test, expect, vi } from "vitest";
import ExpiredGrantsBanner from "$lib/components/permissions/ExpiredGrantsBanner.svelte";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeGrant(overrides: Partial<{
	auditId: string;
	extensionId: string;
	capability: string;
	ageMs: number;
	expiredAt: number;
}> = {}) {
	return {
		auditId: "audit-row-1",
		extensionId: "scratchpad",
		capability: "shell",
		ageMs: 2 * DAY_MS,
		expiredAt: Date.now() - 2 * DAY_MS,
		...overrides,
	};
}

describe("ExpiredGrantsBanner — empty list", () => {
	test("renders nothing when expiredGrants is empty", () => {
		const { queryByTestId } = render(ExpiredGrantsBanner, {
			props: {
				expiredGrants: [],
				isAdmin: false,
				onReapprove: vi.fn(),
			},
		});
		expect(queryByTestId("expired-grants-banner")).toBeNull();
	});
});

describe("ExpiredGrantsBanner — single row", () => {
	test("renders capability + age and click reapprove invokes callback", async () => {
		const onReapprove = vi.fn();
		const grant = makeGrant({ capability: "shell", ageMs: 3 * DAY_MS });
		const { getByTestId } = render(ExpiredGrantsBanner, {
			props: {
				expiredGrants: [grant],
				isAdmin: false,
				onReapprove,
			},
		});
		expect(getByTestId("expired-grants-banner")).toBeInTheDocument();
		expect(getByTestId("expired-grants-row")).toBeInTheDocument();
		expect(getByTestId("expired-grants-row-capability")).toHaveTextContent("shell");
		expect(getByTestId("expired-grants-row-age")).toHaveTextContent(/3 days/);
		expect(getByTestId("expired-grants-row-age")).toHaveTextContent(/expired/);

		const btn = getByTestId("expired-grants-row-reapprove");
		expect(btn).toHaveTextContent(/Re-approve/);
		await fireEvent.click(btn);
		expect(onReapprove).toHaveBeenCalledTimes(1);
		expect(onReapprove).toHaveBeenCalledWith({
			capability: "shell",
			ageMs: 3 * DAY_MS,
		});
	});

	test("non-admin still sees the reapprove button on the banner", () => {
		const { getByTestId } = render(ExpiredGrantsBanner, {
			props: {
				expiredGrants: [makeGrant()],
				isAdmin: false,
				onReapprove: vi.fn(),
			},
		});
		// Banner's reapprove is not gated by role; role-gating is on the
		// modal's "Approve forever (admin only)" button.
		expect(getByTestId("expired-grants-row-reapprove")).toBeInTheDocument();
	});
});

describe("ExpiredGrantsBanner — multiple rows", () => {
	test("renders all rows; each click forwards the row's own grant", async () => {
		const onReapprove = vi.fn();
		const grants = [
			makeGrant({ auditId: "a1", capability: "shell", ageMs: 1 * DAY_MS }),
			makeGrant({ auditId: "a2", capability: "filesystem-write", ageMs: 5 * DAY_MS }),
			makeGrant({ auditId: "a3", capability: "network", ageMs: 7 * DAY_MS }),
		];
		const { getAllByTestId } = render(ExpiredGrantsBanner, {
			props: {
				expiredGrants: grants,
				isAdmin: true,
				onReapprove,
			},
		});
		const rows = getAllByTestId("expired-grants-row");
		expect(rows).toHaveLength(3);

		const buttons = getAllByTestId("expired-grants-row-reapprove");
		expect(buttons).toHaveLength(3);

		await fireEvent.click(buttons[0]!);
		await fireEvent.click(buttons[1]!);
		await fireEvent.click(buttons[2]!);

		expect(onReapprove).toHaveBeenCalledTimes(3);
		expect(onReapprove).toHaveBeenNthCalledWith(1, {
			capability: "shell",
			ageMs: 1 * DAY_MS,
		});
		expect(onReapprove).toHaveBeenNthCalledWith(2, {
			capability: "filesystem-write",
			ageMs: 5 * DAY_MS,
		});
		expect(onReapprove).toHaveBeenNthCalledWith(3, {
			capability: "network",
			ageMs: 7 * DAY_MS,
		});
	});
});
