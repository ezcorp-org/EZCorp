/**
 * Phase 4 (capability-expiry) — direct DOM tests for
 * `ExpiredReapproveModal.svelte` (the settings-side re-approve prompt).
 *
 * Companion to `extension-permission-modal-expired-branch.component.test.ts`
 * (which covers the chat-side surface in `PermissionGate.svelte`). Both
 * surfaces render the same design-doc § 3.2 copy via the shared
 * `expiry-copy.ts` module — pinning the verbatim contract on this
 * surface independently catches paraphrase drift even if the chat-side
 * tests pass.
 *
 * Covers:
 *   - Title `Re-approve {extensionName}: {capability}` (verbatim § 3.2).
 *   - Body
 *     `Your permission for {capability} expired {age} ago. Continue to
 *     grant for another {newTtl}, or cancel.`
 *     (verbatim § 3.2; uses `humanizeDuration` rounding rules).
 *   - Three action buttons: `Approve {newTtl}`, `Approve forever
 *     (admin only)` (admin-only), `Cancel`.
 *   - `isAdmin: false` hides the "Approve forever" button.
 *   - `isAdmin: true` reveals the "Approve forever" button.
 *   - Each button click invokes its callback prop exactly once.
 *   - `loading: true` disables all action buttons (so a double click
 *     can't fire a second request mid-flight).
 */
import "@testing-library/jest-dom/vitest";
import { render, fireEvent } from "@testing-library/svelte";
import { describe, test, expect, vi } from "vitest";
import ExpiredReapproveModal from "$lib/components/permissions/ExpiredReapproveModal.svelte";

const DAY_MS = 24 * 60 * 60 * 1000;

function makeProps(overrides: Partial<{
	extensionName: string;
	capability: string;
	ageMs: number;
	newTtlMs: number;
	isAdmin: boolean;
	loading: boolean;
	onApproveDefault: () => void;
	onApproveForever: () => void;
	onCancel: () => void;
}> = {}) {
	return {
		extensionName: "scratchpad",
		capability: "shell",
		ageMs: 90 * DAY_MS,
		newTtlMs: 30 * DAY_MS,
		isAdmin: false,
		loading: false,
		onApproveDefault: vi.fn(),
		onApproveForever: vi.fn(),
		onCancel: vi.fn(),
		...overrides,
	};
}

describe("ExpiredReapproveModal — verbatim § 3.2 copy", () => {
	test("renders the Re-approve title with extension name and capability", () => {
		const { getByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({ extensionName: "scratchpad", capability: "shell" }),
		});
		const title = getByTestId("expired-reapprove-title");
		// Verbatim § 3.2: "Re-approve $extensionName: $capability"
		expect(title).toHaveTextContent("Re-approve scratchpad: shell");
	});

	test("renders the body sentence verbatim with age and ttl", () => {
		const { getByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({
				capability: "shell",
				ageMs: 90 * DAY_MS,
				newTtlMs: 30 * DAY_MS,
			}),
		});
		const body = getByTestId("expired-reapprove-body");
		// Verbatim § 3.2: "Your permission for $cap expired $age ago.
		// Continue to grant for another $newTtl, or cancel."
		expect(body).toHaveTextContent(
			"Your permission for shell expired 90 days ago. Continue to grant for another 30 days, or cancel.",
		);
	});

	test("renders all three action buttons by default (non-admin hides forever)", () => {
		const { getByTestId, queryByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({ isAdmin: false, newTtlMs: 30 * DAY_MS }),
		});
		expect(getByTestId("expired-reapprove-approve-default")).toHaveTextContent(
			"Approve 30 days",
		);
		// Forever button is admin-gated — must NOT render for non-admins.
		expect(queryByTestId("expired-reapprove-approve-forever")).toBeNull();
		expect(getByTestId("expired-reapprove-cancel")).toHaveTextContent("Cancel");
	});
});

describe("ExpiredReapproveModal — role gating on 'Approve forever'", () => {
	test("admin sees the 'Approve forever (admin only)' button verbatim", () => {
		const { getByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({ isAdmin: true }),
		});
		const foreverBtn = getByTestId("expired-reapprove-approve-forever");
		expect(foreverBtn).toBeInTheDocument();
		expect(foreverBtn).toHaveTextContent("Approve forever (admin only)");
	});

	test("non-admin: 'Approve forever' button is NOT rendered", () => {
		const { queryByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({ isAdmin: false }),
		});
		expect(queryByTestId("expired-reapprove-approve-forever")).toBeNull();
	});
});

describe("ExpiredReapproveModal — callbacks", () => {
	test("'Approve $newTtl' click invokes onApproveDefault exactly once", async () => {
		const onApproveDefault = vi.fn();
		const onApproveForever = vi.fn();
		const onCancel = vi.fn();
		const { getByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({ onApproveDefault, onApproveForever, onCancel }),
		});
		await fireEvent.click(getByTestId("expired-reapprove-approve-default"));
		expect(onApproveDefault).toHaveBeenCalledTimes(1);
		expect(onApproveForever).not.toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
	});

	test("'Approve forever' click (admin) invokes onApproveForever exactly once", async () => {
		const onApproveDefault = vi.fn();
		const onApproveForever = vi.fn();
		const onCancel = vi.fn();
		const { getByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({
				isAdmin: true,
				onApproveDefault,
				onApproveForever,
				onCancel,
			}),
		});
		await fireEvent.click(getByTestId("expired-reapprove-approve-forever"));
		expect(onApproveForever).toHaveBeenCalledTimes(1);
		expect(onApproveDefault).not.toHaveBeenCalled();
		expect(onCancel).not.toHaveBeenCalled();
	});

	test("'Cancel' click invokes onCancel exactly once", async () => {
		const onApproveDefault = vi.fn();
		const onApproveForever = vi.fn();
		const onCancel = vi.fn();
		const { getByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({ onApproveDefault, onApproveForever, onCancel }),
		});
		await fireEvent.click(getByTestId("expired-reapprove-cancel"));
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onApproveDefault).not.toHaveBeenCalled();
		expect(onApproveForever).not.toHaveBeenCalled();
	});
});

describe("ExpiredReapproveModal — loading state", () => {
	test("loading=true disables all action buttons (no admin)", () => {
		const { getByTestId, queryByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({ loading: true, isAdmin: false }),
		});
		expect(getByTestId("expired-reapprove-approve-default")).toBeDisabled();
		expect(getByTestId("expired-reapprove-cancel")).toBeDisabled();
		// Forever still hidden for non-admin.
		expect(queryByTestId("expired-reapprove-approve-forever")).toBeNull();
	});

	test("loading=true disables all action buttons (admin)", () => {
		const { getByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({ loading: true, isAdmin: true }),
		});
		expect(getByTestId("expired-reapprove-approve-default")).toBeDisabled();
		expect(getByTestId("expired-reapprove-approve-forever")).toBeDisabled();
		expect(getByTestId("expired-reapprove-cancel")).toBeDisabled();
	});

	test("loading=true swaps the default button label to 'Working...'", () => {
		const { getByTestId } = render(ExpiredReapproveModal, {
			props: makeProps({ loading: true }),
		});
		expect(getByTestId("expired-reapprove-approve-default")).toHaveTextContent(
			"Working...",
		);
	});
});
