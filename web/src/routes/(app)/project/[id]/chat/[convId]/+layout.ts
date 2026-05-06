/**
 * Conversation layout — preloads per-extension settings the chat's tool
 * cards rely on. The kokoro-tts player card reads `voice` + `speed` from
 * the shared `extensionSettings` store synchronously while rendering, so
 * the load has to complete (or at least kick off) before the first card
 * mounts.
 *
 * For v1 we hardcode kokoro-tts. Future extensions that declare a
 * `settings` block will be added here (or, ideally, picked up by a small
 * generic loop that walks the enabled-extensions list).
 */

import { loadExtensionSettings } from "$lib/stores/extensionSettings";

export const load = async () => {
  // Fire the fetch but don't fail the whole layout if the API is
  // unreachable — the card has a sane default fallback.
  await loadExtensionSettings("kokoro-tts").catch(() => undefined);
  return {};
};
