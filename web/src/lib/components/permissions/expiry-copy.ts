/**
 * Phase 4 (capability-expiry) — single source of the design doc § 3.2
 * verbatim copy contract.
 *
 * Two surfaces render the re-approve modal:
 *   1. The in-chat `PermissionGate.svelte` expired branch (chat-side).
 *   2. The settings-page banner's `ExpiredReapproveModal.svelte`
 *      (settings-side).
 *
 * Before this module each surface inlined its own template literal —
 * a paraphrase drift waiting to happen. Both now read from `expiryCopy()`
 * so the title and body strings live in one place; the component tests
 * for either surface assert against the same constants.
 *
 * Pure (no Svelte runes, no DOM); safe to import from anywhere.
 */
import { humanizeDuration } from "$lib/utils/relative-time";

export interface ExpiryCopy {
	title: string;
	body: string;
	approveDefault: string;
	approveForever: string;
	cancel: string;
	ageText: string;
	ttlText: string;
}

/**
 * Return the verbatim § 3.2 copy for a re-approve prompt.
 *
 * @param extensionName  Display name (or id) of the extension whose
 *                       capability expired.
 * @param capability     The expiry-kind string (`"shell"`,
 *                       `"filesystem-write"`, etc).
 * @param ageMs          How long ago the grant expired.
 * @param newTtlMs       Length of the next TTL window if the user
 *                       clicks "Approve $newTtl".
 */
export function expiryCopy(
	extensionName: string,
	capability: string,
	ageMs: number,
	newTtlMs: number,
): ExpiryCopy {
	const ageText = humanizeDuration(ageMs);
	const ttlText = humanizeDuration(newTtlMs);
	return {
		title: `Re-approve ${extensionName}: ${capability}`,
		body: `Your permission for ${capability} expired ${ageText} ago. Continue to grant for another ${ttlText}, or cancel.`,
		approveDefault: `Approve ${ttlText}`,
		approveForever: "Approve forever (admin only)",
		cancel: "Cancel",
		ageText,
		ttlText,
	};
}
