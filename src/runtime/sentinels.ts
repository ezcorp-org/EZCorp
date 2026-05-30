/**
 * Autonomous-loop output sentinels (D11).
 *
 * A cooperative main model can end a goal / assignment in zero evaluator
 * calls by emitting one of these tokens on its own line. The patterns are
 * shared by {@link import("./start-assignment").startAssignment}'s
 * autonomous continuation loop and {@link import("./goal-host").GoalHost}'s
 * sentinel detection — keeping a single definition here prevents the two
 * loops from silently drifting apart.
 */

/** Matches `<<TASK_DONE>>` (whitespace-tolerant). */
export const TASK_DONE_RE = /<<\s*TASK_DONE\s*>>/;

/** Matches `<<TASK_BLOCKED: reason>>`; capture group 1 is the reason text. */
export const TASK_BLOCKED_RE = /<<\s*TASK_BLOCKED\s*:?\s*([^>]*)>>/;

/** Global variant of {@link TASK_DONE_RE} for strip-from-output passes. */
export const TASK_DONE_RE_G = /<<\s*TASK_DONE\s*>>/g;

/** Global variant of {@link TASK_BLOCKED_RE} for strip-from-output passes. */
export const TASK_BLOCKED_RE_G = /<<\s*TASK_BLOCKED\s*:?\s*[^>]*>>/g;
