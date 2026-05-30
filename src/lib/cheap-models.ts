/**
 * Canonical "cheapest model per provider family" registry for
 * **host-internal** LLM calls (the `/goal` evaluator and the memory
 * compaction merge). One definition so a model deprecation is a single
 * edit for every host-internal caller.
 *
 * NOTE: this is deliberately NOT shared with the per-extension
 * `allowedModels` ceilings in `bundled.ts` / `bundled-ceiling.ts`. Those
 * are security boundaries kept verbatim per extension — widening them must
 * be an explicit, reviewed change, not a side effect of editing this map.
 */

/** Explicit provider keys (always present) plus a string index signature so
 *  callers can also look up by a dynamic provider string. Dynamic access
 *  returns `string | undefined` under `noUncheckedIndexedAccess`; the four
 *  named keys are guaranteed defined. */
interface CheapModelRegistry extends Record<string, string> {
  anthropic: string;
  google: string;
  openai: string;
  ollama: string;
}

export const CHEAP_MODEL_BY_PROVIDER: Readonly<CheapModelRegistry> = {
  anthropic: "claude-haiku-4-5-20250514",
  google: "gemini-2.0-flash-lite",
  openai: "gpt-4o-mini",
  ollama: "gemma4:e2b",
};
