import test from "node:test";
import assert from "node:assert/strict";

import {
  completePreferredModelSave,
  createPreferredModelSaveState,
  failPreferredModelSave,
  startPreferredModelSave,
} from "./preferred-model-save-state.ts";

test("latest failure rolls back to the last confirmed models instead of the previous optimistic state", () => {
  let state = createPreferredModelSaveState([]);

  const firstSave = startPreferredModelSave(state);
  state = firstSave.state;

  const secondSave = startPreferredModelSave(state);
  state = secondSave.state;

  const firstFailure = failPreferredModelSave(state, firstSave.intentId);
  state = firstFailure.state;
  assert.equal(firstFailure.shouldRollbackToConfirmedModels, false);

  const secondFailure = failPreferredModelSave(state, secondSave.intentId);
  assert.equal(secondFailure.shouldRollbackToConfirmedModels, true);
  assert.deepEqual(secondFailure.confirmedModels, []);
});

test("revisiting the same selection keeps each save intent distinct", () => {
  let state = createPreferredModelSaveState([]);

  const firstSave = startPreferredModelSave(state);
  state = firstSave.state;

  const secondSave = startPreferredModelSave(state);
  state = secondSave.state;

  const thirdSave = startPreferredModelSave(state);
  state = thirdSave.state;

  assert.notEqual(firstSave.intentId, thirdSave.intentId);

  const firstSuccess = completePreferredModelSave(state, firstSave.intentId, ["A"]);
  state = firstSuccess.state;
  assert.equal(firstSuccess.shouldApplyToUi, false);
  assert.equal(state.latestIntentId, thirdSave.intentId);

  const secondSuccess = completePreferredModelSave(state, secondSave.intentId, ["A", "B"]);
  state = secondSuccess.state;
  assert.equal(secondSuccess.shouldApplyToUi, false);
  assert.equal(state.latestIntentId, thirdSave.intentId);

  const thirdFailure = failPreferredModelSave(state, thirdSave.intentId);
  assert.equal(thirdFailure.shouldRollbackToConfirmedModels, true);
  assert.deepEqual(thirdFailure.confirmedModels, ["A", "B"]);
});
