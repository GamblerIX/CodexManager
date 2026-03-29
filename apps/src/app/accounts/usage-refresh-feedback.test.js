import test from "node:test";
import assert from "node:assert/strict";

import { summarizeUsageRefreshOutcome } from "./usage-refresh-feedback.ts";

test("reports partial failure instead of blanket success", () => {
  assert.deepEqual(
    summarizeUsageRefreshOutcome({
      requested: 8,
      attempted: 8,
      refreshed: 3,
      failed: 5,
      skipped: 0,
    }),
    {
      tone: "warning",
      message: "账号用量刷新完成：成功 3，失败 5",
    }
  );
});

test("reports no-op refresh when every account was skipped", () => {
  assert.deepEqual(
    summarizeUsageRefreshOutcome({
      requested: 4,
      attempted: 0,
      refreshed: 0,
      failed: 0,
      skipped: 4,
    }),
    {
      tone: "info",
      message: "当前没有可刷新的账号",
    }
  );
});