import assert from "node:assert/strict";
import test from "node:test";
import { decideRotation } from "../src/rotation_workflow.js";

test("keeps the grace overlap while a deployment reports the old key reference", () => {
  const logs = {
    entries: [
      { deployment: "leasing-api", message: "credential key_old_42 loaded" },
      { deployment: "inspection-worker", message: "credential replaced" },
    ],
  };

  assert.deepEqual(decideRotation(logs, "key_old_42"), {
    canRevoke: false,
    matchingRecords: 1,
    nextAction: "keep-overlap-and-redeploy",
  });
});

test("permits revocation after the old key reference disappears", () => {
  assert.deepEqual(decideRotation({ entries: [{ message: "new credential active" }] }, "key_old_42"), {
    canRevoke: true,
    matchingRecords: 0,
    nextAction: "revoke-temporary-key",
  });
});
