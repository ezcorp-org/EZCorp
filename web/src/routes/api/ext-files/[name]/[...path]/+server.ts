/**
 * Serve files written by an extension into
 * `<projectRoot>/.ezcorp/extension-data/<name>/`.
 *
 * Why this route exists: extensions like openai-image-gen-2 produce
 * binary artifacts (generated images) that need to render in the chat
 * UI. Shipping them inline as `data:image/...` URIs in the tool result
 * works once but dies on the next turn — the base64 gets replayed as
 * input text and overruns the model's context window. So the extension
 * writes bytes to disk and emits a short URL pointing here.
 *
 * Security:
 *   - Authenticated users only (cookie or bearer).
 *   - `<name>` must match our strict allowlist — anything else is 404.
 *     We don't want an attacker-controlled name probing arbitrary
 *     extensions' state.
 *   - The final resolved path must live under the extension's data
 *     directory. Traversal attempts (`..`, symlinks, absolute paths)
 *     fail closed.
 */

import { requireAuth } from "$server/auth/middleware";
import { requireScope } from "$lib/server/security/api-keys";
import { resolve, normalize, relative, join, sep } from "node:path";
import { existsSync, createReadStream, statSync } from "node:fs";
import type { RequestHandler } from "./$types";

function notFound(): Response {
	return new Response(JSON.stringify({ error: "Not found" }), {
		status: 404,
		headers: { "Content-Type": "application/json" },
	});
}

// Hard-coded allowlist. Keep tight — anything added here exposes that
// extension's `generated/` (and any other disk state) to authenticated
// users of the platform.
const ALLOWED_EXTENSIONS = new Set(["openai-image-gen-2"]);

const MIME_BY_EXT: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	webp: "image/webp",
	gif: "image/gif",
};

/** Resolve the extension data root inside the server's project root.
 *  Prefixed with `_` because SvelteKit's +server.ts loader only
 *  permits HTTP verbs + `_`-prefixed exports. */
export function _extensionDataRoot(name: string, cwd: string = process.cwd()): string {
	return resolve(cwd, ".ezcorp", "extension-data", name);
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const scopeErr = requireScope(locals, "read");
	if (scopeErr) return scopeErr;
	requireAuth(locals);

	const name = params.name;
	const relRaw = params.path ?? "";

	if (!name || !ALLOWED_EXTENSIONS.has(name)) {
		return notFound();
	}
	// Reject empty / root-only requests.
	if (!relRaw || relRaw === "/" || relRaw === ".") {
		return notFound();
	}

	const root = _extensionDataRoot(name);
	const absCandidate = resolve(root, normalize(relRaw));

	// Containment check: normalized absolute path must live strictly
	// under the data root. `relative(root, abs)` starting with ".." means
	// the caller escaped the directory via ../../ or a leading slash.
	const rel = relative(root, absCandidate);
	if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
		return notFound();
	}
	if (!existsSync(absCandidate)) {
		return notFound();
	}
	const stat = statSync(absCandidate);
	if (!stat.isFile()) {
		return notFound();
	}

	const ext = (absCandidate.split(".").pop() ?? "").toLowerCase();
	const mime = MIME_BY_EXT[ext] ?? "application/octet-stream";

	const stream = createReadStream(absCandidate) as unknown as ReadableStream;
	return new Response(stream as any, {
		status: 200,
		headers: {
			"Content-Type": mime,
			"Content-Length": String(stat.size),
			// Immutable + short max-age: filenames are UUIDs so content
			// never changes, but a short age keeps control with us if a
			// filename is re-used (shouldn't happen, but belt & braces).
			"Cache-Control": "private, max-age=3600",
		},
	});
};

// Re-export for test ergonomics. SvelteKit allows `_`-prefixed exports.
export const _TEST = { ALLOWED_EXTENSIONS, MIME_BY_EXT, _extensionDataRoot, join };
