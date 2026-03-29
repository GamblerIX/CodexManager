type UsageRefreshSummary = {
  requested: number;
  attempted: number;
  refreshed: number;
  failed: number;
  skipped: number;
};

export function summarizeUsageRefreshOutcome(summary: UsageRefreshSummary): {
  tone: "success" | "info" | "warning" | "error";
  message: string;
} {
  if (summary.failed > 0 && summary.refreshed > 0) {
    return {
      tone: "warning",
      message: `账号用量刷新完成：成功 ${summary.refreshed}，失败 ${summary.failed}`,
    };
  }
  if (summary.failed > 0) {
    return {
      tone: "error",
      message: `账号用量刷新失败：失败 ${summary.failed}`,
    };
  }
  if (summary.refreshed > 0) {
    return {
      tone: "success",
      message: `账号用量已刷新：成功 ${summary.refreshed}`,
    };
  }
  return {
    tone: "info",
    message: "当前没有可刷新的账号",
  };
}