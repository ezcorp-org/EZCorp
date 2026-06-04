/**
 * Regression guard: every concierge `propose_*` tool must declare
 * `cardType: "ez-propose"` so its `{ draftId, openUrl }` result routes to
 * the frontend EzToolResultCard ("Open prefilled form" button).
 *
 * The real-world bug: a `propose_create_project` turn created the draft
 * server-side, but the tool shipped `cardType: "default"`, so the chat
 * pipeline rendered a generic DefaultCard and the prefilled form was
 * never surfaced — exactly contradicting the EZ system prompt's promise
 * of "a card with a button that opens the prefilled form". The
 * component/e2e tests missed it because they bypass the tool-call
 * pipeline (render the card directly / seed the propose JSON as message
 * content). This test pins the tool-side half of the contract.
 *
 * Factories build the tool def without touching the DB (createDraft only
 * runs inside execute), so a dummy ctx is enough.
 */

import { test, expect, describe } from "bun:test";
import { createProposeCreateProjectTool } from "../runtime/tools/ez/propose-create-project";
import { createProposeCreateAgentTool } from "../runtime/tools/ez/propose-create-agent";
import { createProposeInstallExtensionTool } from "../runtime/tools/ez/propose-install-extension";

const ctx = { userId: "user-propose-1" };

const TOOLS = [
  ["propose_create_project", createProposeCreateProjectTool],
  ["propose_create_agent", createProposeCreateAgentTool],
  ["propose_install_extension", createProposeInstallExtensionTool],
] as const;

describe("propose_* tools route to the prefilled-form card", () => {
  for (const [name, factory] of TOOLS) {
    test(`${name} declares cardType 'ez-propose' (category ez)`, () => {
      const def = factory(ctx);
      expect(def.name).toBe(name);
      expect(def.cardType).toBe("ez-propose");
      expect(def.category).toBe("ez");
    });
  }
});
