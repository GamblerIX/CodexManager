import test from "node:test";
import assert from "node:assert/strict";

import { readServiceListenState } from "./service-listen-state.ts";

test("shows pending restart when saved and effective modes differ", () => {
  assert.deepEqual(
    readServiceListenState({
      serviceAddr: "localhost:48760",
      serviceListenMode: "all_interfaces",
      serviceListenModeEffective: "loopback",
      serviceListenModeRestartRequired: true,
    }),
    {
      savedBindAddr: "0.0.0.0:48760",
      effectiveBindAddr: "localhost:48760",
      restartRequired: true,
    }
  );
});

test("preserves explicit host previews instead of forcing localhost", () => {
  assert.deepEqual(
    readServiceListenState({
      serviceAddr: "192.168.1.10:48760",
      serviceListenMode: "all_interfaces",
      serviceListenModeEffective: "all_interfaces",
      serviceListenModeRestartRequired: false,
    }),
    {
      savedBindAddr: "192.168.1.10:48760",
      effectiveBindAddr: "192.168.1.10:48760",
      restartRequired: false,
    }
  );
});