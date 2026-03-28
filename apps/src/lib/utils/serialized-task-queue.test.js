import test from "node:test";
import assert from "node:assert/strict";

import { createSerializedTaskQueue } from "./serialized-task-queue.ts";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("serialized task queue waits for the previous save before starting the next one", async () => {
  const queue = createSerializedTaskQueue();
  const first = deferred();
  const second = deferred();
  const started = [];

  const firstRun = queue.run(async () => {
    started.push("first");
    return first.promise;
  });
  const secondRun = queue.run(async () => {
    started.push("second");
    return second.promise;
  });

  await Promise.resolve();
  assert.deepEqual(started, ["first"]);

  first.resolve("first");
  await firstRun;
  await Promise.resolve();
  assert.deepEqual(started, ["first", "second"]);

  second.resolve("second");
  assert.equal(await secondRun, "second");
});

test("serialized task queue keeps later saves running after an earlier failure", async () => {
  const queue = createSerializedTaskQueue();
  const started = [];

  const firstRun = queue.run(async () => {
    started.push("first");
    throw new Error("boom");
  });
  const secondRun = queue.run(async () => {
    started.push("second");
    return "ok";
  });

  await assert.rejects(firstRun, /boom/);
  assert.equal(await secondRun, "ok");
  assert.deepEqual(started, ["first", "second"]);
});
