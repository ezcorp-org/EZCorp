#!/usr/bin/env bun
// substack-engagement — JSON-RPC tool dispatcher + cron wiring.
//
// Draft-and-approve Substack engagement agent. Every outbound message
// (comment reply, welcome DM, note comment) is drafted into a review
// queue; the human approves/edits/rejects/sends. Nothing sends
// autonomously (locked decision #1).
//
// Wiring contract:
//   - tools/call → the handlers in `lib/tools.ts` (+ Phase 2/3 modules).
//     The Phase 4 review card (SubstackReviewCard.svelte) is just another
//     tools/call client: its Approve & Send / Edit / Reject buttons POST
//     the approve_item / edit_item / send_approved / reject_item tools to
//     the host's `/api/tool-invoke` route, which dispatches into the same
//     handlers below (open-question #2 resolution — no bidirectional
//     canvas-event channel; the card needs no eventSubscriptions).
//   - the `*/15 * * * *` cron → `runScheduledScan` (drafts only, never
//     sends). The SDK's Schedule class registers the handler; the host's
//     ScheduleDaemon fires it ownerless — `Storage("global")` is the only
//     ownerless scope the cron can reach (see the start() comment).
//
// Production stores are bound here once: the review queue + subscriber
// cursor + pacing state use ownerless `Storage("global")`; the user-
// scoped entities (voice-profile, follow-up-sequence, targeted-notes-
// list) use `Storage("user")`. The drafting LLM is `new Llm()`. Every
// binding is an injectable seam so unit tests run channel-free.

import {
  createToolDispatcher,
  getChannel,
  Llm,
  Schedule,
  Storage,
  type ToolHandler,
  type ToolHandlerContext,
} from "@ezcorp/sdk/runtime";

import {
  scanComments,
  listQueue,
  approveItem,
  rejectItem,
  editItem,
  sendApproved,
  openReviewQueue,
  setLlm,
  setVoiceStore,
  setDraftConfig,
  setPacingStore,
  setPacingConfig,
} from "./lib/tools";
import { setQueueStore } from "./lib/review-queue";
import {
  scanSubscribers,
  runDueFollowups,
  setCursorStore,
  setSequenceStore,
} from "./lib/subscribers";
import { scanNotes, setNotesStore } from "./lib/notes";

// ── Tool handlers ───────────────────────────────────────────────

const scan_comments: ToolHandler = (args, ctx) =>
  scanComments(args as Record<string, unknown>, ctx as ToolHandlerContext | undefined);
const scan_subscribers: ToolHandler = (args, ctx) =>
  scanSubscribers(args as Record<string, unknown>, ctx as ToolHandlerContext | undefined);
const scan_notes: ToolHandler = (args, ctx) =>
  scanNotes(args as Record<string, unknown>, ctx as ToolHandlerContext | undefined);
const list_queue: ToolHandler = (args) => listQueue(args as Record<string, unknown>);
const approve_item: ToolHandler = (args) => approveItem(args as Record<string, unknown>);
const reject_item: ToolHandler = (args) => rejectItem(args as Record<string, unknown>);
const edit_item: ToolHandler = (args) => editItem(args as Record<string, unknown>);
const send_approved: ToolHandler = (args, ctx) =>
  sendApproved(args as Record<string, unknown>, ctx as ToolHandlerContext | undefined);
const open_review_queue: ToolHandler = () => openReviewQueue();

export const tools: Record<string, ToolHandler> = {
  scan_comments,
  scan_subscribers,
  scan_notes,
  list_queue,
  approve_item,
  reject_item,
  edit_item,
  send_approved,
  open_review_queue,
};

// ── Cron handler ────────────────────────────────────────────────
//
// Drafts only — never sends (locked decision #1; the cron is ownerless
// and there is no human in the loop to approve a send). On every fire:
//   1. scan own-post comments → draft replies (Phase 1)
//   2. poll new subscribers → draft welcome DMs + schedule follow-ups
//      (Phase 2)
//   3. draft any due, not-yet-drafted follow-up rows lazily (Phase 2)
//   4. scan targeted Notes → draft comments (Phase 3)
//
// The cron passes no `ctx.invocationMetadata.settings`; credential-
// gated reads soft-fail (drafting needs no creds — `getCredential()`
// resolves global/user creds without a conversation per locked
// decision #5; the SubstackClient reads needed for scans surface
// MISSING_CREDENTIALS cleanly when the user hasn't configured creds yet).

export async function runScheduledScan(): Promise<void> {
  // Each scan is independent; one failing must not abort the others.
  await safe(() => scanComments({}, undefined));
  await safe(() => scanSubscribers({}, undefined));
  await safe(() => runDueFollowups());
  await safe(() => scanNotes({}, undefined));
}

async function safe(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // Cron fires are best-effort; a scan failure is logged, never thrown.
    console.error("[substack-engagement] scheduled scan step failed:", (err as Error).message);
  }
}

// ── Production wiring ───────────────────────────────────────────
//
// Extracted so a test can cover the wiring branch without opening
// stdin. Binds the project-scope queue store, the user-scope voice
// store, the LLM, the tool dispatcher, and the cron handler. The
// Phase 4 review card reaches the approve/edit/send/reject tools via
// the host's `/api/tool-invoke` route (the same dispatcher), so there
// is no separate canvas-event surface to register here.

export function start(): void {
  const ch = getChannel();

  // Bind production stores + LLM (all injectable seams; tests swap them).
  //
  // Locked decision #4 mandated a PROJECT-scope queue so an OWNERLESS cron
  // fire can read/write it (user scope needs an owner the cron lacks). The
  // SDK runtime `Storage` exposes no "project" scope — its scopes are
  // "global" | "conversation" | "user", and the host storage-handler
  // rejects any other value with -32602 (storage-handler.ts:157). "global"
  // is the SDK's only OWNERLESS scope (resolveScopeId → null), which is
  // exactly what the locked decision's rationale requires: the ownerless
  // */15 cron can reach it without a user or conversation. We therefore
  // satisfy the DECISION'S INTENT (ownerless, cron-reachable) with the
  // scope that actually exists. Deviation documented in the Phase 1 commit.
  setQueueStore(new Storage("global"));
  setVoiceStore(new Storage("user"));
  // The subscriber poll cursor + Notes pacing state share the ownerless
  // queue store (both must be cron-reachable too); the user-scoped
  // entities (follow-up-sequence, targeted-notes-list) use user scope.
  setCursorStore(new Storage("global"));
  setSequenceStore(new Storage("user"));
  setPacingStore(new Storage("global"));
  setNotesStore(new Storage("user"));
  setLlm(new Llm());
  setDraftConfig({});
  // Pacing config is recomputed per send from the call's settings; this
  // sets the cron-time fallback (no settings on an ownerless fire) to the
  // documented defaults. The cron never SENDS, so pacing is effectively a
  // no-op there — it gates the human-driven send_approved path.
  setPacingConfig({});

  createToolDispatcher(tools);

  // Register the cron handler. The SDK silently drops `on()` for crons
  // not in the manifest, so this matches `permissions.schedule.crons`.
  const schedule = new Schedule();
  schedule.on("*/15 * * * *", async () => {
    await runScheduledScan();
  });

  ch.start();
}

// Gated on `import.meta.main` so test imports don't open stdin.
if (import.meta.main) start();
