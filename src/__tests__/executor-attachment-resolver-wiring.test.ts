/**
 * Structural guard: every `new ToolExecutor(...)` inside `streamChat` must
 * be followed by `setArgsResolver(attachmentArgsResolver)` so attachment
 * handles resolve regardless of WHICH ToolExecutor (agent-config tools,
 * conversation-extension tools, scratchpad auto-wire) dispatches the call.
 *
 * Full behavioral coverage of the resolver contract itself lives in
 * `ext-registry-executor.test.ts` (argsResolver transforms input,
 * back-compat no-op) and `attachment-handle-resolver.test.ts`. This test
 * exists purely to catch someone adding a new ToolExecutor call site in
 * streamChat and forgetting to thread the resolver through it.
 */

import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXECUTOR_PATH = join(import.meta.dir, "..", "runtime", "executor.ts");
const source = readFileSync(EXECUTOR_PATH, "utf-8");

/** Extract the body of `async streamChat(...): Promise<AgentRun> { ... }`
 *  by brace-matching from the opening body brace to its matching close. */
function extractStreamChatBody(src: string): string {
	const signature = /async\s+streamChat\s*\(/;
	const start = src.search(signature);
	if (start < 0) throw new Error("streamChat declaration not found in executor.ts");
	// Skip to `)` of the signature, then to `{` of the body.
	let i = start;
	let parens = 0;
	let sawOpenParen = false;
	while (i < src.length) {
		const c = src[i]!;
		if (c === "(") { parens++; sawOpenParen = true; }
		else if (c === ")") { parens--; if (sawOpenParen && parens === 0) { i++; break; } }
		i++;
	}
	while (i < src.length && src[i] !== "{") i++;
	if (src[i] !== "{") throw new Error("could not locate streamChat body");
	const bodyStart = i;
	let depth = 0;
	for (; i < src.length; i++) {
		const c = src[i]!;
		if (c === "{") depth++;
		else if (c === "}") { depth--; if (depth === 0) return src.slice(bodyStart, i + 1); }
	}
	throw new Error("streamChat body is unbalanced");
}

const body = extractStreamChatBody(source);

describe("streamChat attachment-resolver wiring", () => {
	test("constructs the attachment-aware args resolver at the top of the method", () => {
		expect(body).toContain("attachmentArgsResolver");
		expect(body).toContain("buildAttachmentHandleResolver");
	});

	test("every ToolExecutor instance in streamChat threads the resolver", () => {
		// Count construction sites and resolver assignments. Any mismatch
		// means a new call site was added without the `setArgsResolver` line.
		const constructions = body.match(/new\s+ToolExecutor\s*\(/g) ?? [];
		const wires = body.match(/\.setArgsResolver\s*\(\s*attachmentArgsResolver\s*\)/g) ?? [];
		expect(constructions.length).toBeGreaterThan(0);
		expect(wires.length).toBe(constructions.length);
	});

	test("resolver wiring uses the single shared variable (not a fresh build per call site)", () => {
		// One construction of attachmentArgsResolver, many uses.
		const builds = body.match(/const\s+attachmentArgsResolver\s*=/g) ?? [];
		expect(builds.length).toBe(1);
	});

	test("resolver union includes current-turn AND past-branch attachments", () => {
		// The current-turn spread comes from options.attachments; the past
		// set is `allPastAttachments` loaded via the rehydrate helper. Both
		// must feed the resolver so prior-turn handles still work.
		expect(body).toContain("options.attachments");
		expect(body).toContain("allPastAttachments");
	});

	test("past-attachment rehydration runs before history materialization", () => {
		// loadPastAttachments must be called before `history` is built, and
		// rehydrateUserMessageContent must be applied per user message.
		const loadIdx = body.indexOf("loadPastAttachments");
		const historyIdx = body.indexOf("const history");
		expect(loadIdx).toBeGreaterThan(-1);
		expect(historyIdx).toBeGreaterThan(-1);
		expect(loadIdx).toBeLessThan(historyIdx);
		expect(body).toContain("rehydrateUserMessageContent");
	});
});
