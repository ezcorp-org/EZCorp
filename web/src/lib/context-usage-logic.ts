// Pure logic for the chat "context % used" indicator. Kept in a plain
// module so unit tests can exercise every branch without mounting Svelte.

export type Tone = "muted" | "warn" | "danger";

export interface MessageLike {
	role: string;
	usage?: { inputTokens?: number | null } | null;
}

/**
 * Percentage of the model's context window used by the last turn.
 * Returns null when either input is missing/invalid. Clamped to [0, 100].
 */
export function computePct(usedTokens: number | null | undefined, contextWindow: number | null | undefined): number | null {
	if (usedTokens == null || !Number.isFinite(usedTokens)) return null;
	if (contextWindow == null || !Number.isFinite(contextWindow) || contextWindow <= 0) return null;
	const raw = (usedTokens / contextWindow) * 100;
	if (raw < 0) return 0;
	if (raw > 100) return 100;
	return raw;
}

/**
 * Visual tone bucket. Thresholds are inclusive at the lower bound
 * (70 → warn, 90 → danger) so the indicator flips *at* the boundary.
 */
export function computeTone(pct: number | null): Tone {
	if (pct == null) return "muted";
	if (pct >= 90) return "danger";
	if (pct >= 70) return "warn";
	return "muted";
}

/**
 * Compact human token count: 1_234 → "1.2k", 12_345 → "12k",
 * 1_234_567 → "1.2M". Preserves one decimal for readability in low ranges.
 */
export function fmtTokens(n: number): string {
	if (!Number.isFinite(n)) return "0";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return `${Math.round(n)}`;
}

/**
 * Tooltip text — single source of truth so the component and any future
 * status bar stay consistent.
 */
export function tooltipText(usedTokens: number | null | undefined, contextWindow: number | null | undefined): string {
	const pct = computePct(usedTokens, contextWindow);
	if (pct == null) {
		return "Context usage — appears after the first assistant response";
	}
	return `${fmtTokens(usedTokens as number)} / ${fmtTokens(contextWindow as number)} tokens used (${Math.round(pct)}%)`;
}

/**
 * Pick the `inputTokens` reported by the most recent assistant message that
 * actually has a usage number. Represents "what fit in the prompt last turn".
 * Returns null until the first assistant reply with a positive token count.
 */
export function pickLastTurnInputTokens(messages: readonly MessageLike[]): number | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (!m || m.role !== "assistant") continue;
		const tokens = m.usage?.inputTokens;
		if (typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0) return tokens;
	}
	return null;
}
