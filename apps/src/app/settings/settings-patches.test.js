import test from "node:test";
import assert from "node:assert/strict";

import {
  createBackgroundTasksPatch,
  createEnvOverridePatch,
  createEnvOverrideResetPatch,
} from "./settings-patches.ts";

test("background task patch only includes the changed keys", () => {
  assert.deepEqual(createBackgroundTasksPatch({ usagePollingEnabled: false }), {
    backgroundTasks: {
      usagePollingEnabled: false,
    },
  });

  assert.deepEqual(createBackgroundTasksPatch({ usageRefreshWorkers: 6 }), {
    backgroundTasks: {
      usageRefreshWorkers: 6,
    },
  });
});

test("env override save patch only includes the selected key", () => {
  assert.deepEqual(
    createEnvOverridePatch("CODEXMANAGER_UPSTREAM_TOTAL_TIMEOUT_MS", "321000"),
    {
      envOverrides: {
        CODEXMANAGER_UPSTREAM_TOTAL_TIMEOUT_MS: "321000",
      },
    }
  );
});

test("env override reset uses an explicit empty-string patch", () => {
  assert.deepEqual(createEnvOverrideResetPatch("CODEXMANAGER_UPSTREAM_TOTAL_TIMEOUT_MS"), {
    envOverrides: {
      CODEXMANAGER_UPSTREAM_TOTAL_TIMEOUT_MS: "",
    },
  });
});
