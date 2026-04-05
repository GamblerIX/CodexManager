export const ENV_DESCRIPTION_MAP: Record<string, string> = {
  CODEXMANAGER_UPSTREAM_TOTAL_TIMEOUT_MS:
    "控制单次上游请求允许持续的最长时间，单位毫秒；超过后会主动结束请求并返回超时错误。",
  CODEXMANAGER_UPSTREAM_STREAM_TIMEOUT_MS:
    "控制流式上游请求允许持续的最长时间，单位毫秒；填 0 可关闭流式超时上限。",
  CODEXMANAGER_SSE_KEEPALIVE_INTERVAL_MS:
    "控制向下游补发 SSE keep-alive 帧的间隔，单位毫秒；上游长时间安静时可避免客户端误判连接中断。",
  CODEXMANAGER_UPSTREAM_CONNECT_TIMEOUT_SECS:
    "控制连接上游服务器时的超时时间，单位秒；主要影响握手和网络建立阶段。",
  CODEXMANAGER_UPSTREAM_BASE_URL:
    "控制默认上游地址；修改后，网关会把请求转发到新的目标地址。",
  CODEXMANAGER_WEB_ADDR:
    "控制 codexmanager-web / codexmanager-start 的监听地址；设置为 0.0.0.0 用于允许局域网访问，但浏览器应使用 127.0.0.1 或本机 IP 打开。该项需要重启相关进程；若同目录 codexmanager.env 已设置该变量，启动时会优先使用文件值。",
};

export const THEMES = [
  { id: "tech", name: "企业蓝", color: "#2563eb" },
  { id: "dark", name: "极夜黑", color: "#09090b" },
  { id: "dark-one", name: "深邃黑", color: "#282c34" },
  { id: "business", name: "事务金", color: "#c28100" },
  { id: "mint", name: "薄荷绿", color: "#059669" },
  { id: "sunset", name: "晚霞橙", color: "#ea580c" },
  { id: "grape", name: "葡萄灰紫", color: "#7c3aed" },
  { id: "ocean", name: "海湾青", color: "#0284c7" },
  { id: "forest", name: "松林绿", color: "#166534" },
  { id: "rose", name: "玫瑰粉", color: "#db2777" },
  { id: "slate", name: "石板灰", color: "#475569" },
  { id: "aurora", name: "极光青", color: "#0d9488" },
] as const;

export const ROUTE_STRATEGY_LABELS: Record<string, string> = {
  ordered: "顺序优先 (Ordered)",
  balanced: "均衡轮询 (Balanced)",
};

export const SERVICE_LISTEN_MODE_LABELS: Record<string, string> = {
  loopback: "仅本机 (localhost)",
  all_interfaces: "全部网卡 (0.0.0.0)",
};

export const RESIDENCY_REQUIREMENT_LABELS: Record<string, string> = {
  "": "不限制",
  us: "仅美国 (us)",
};

export const EMPTY_RESIDENCY_OPTION = "__none__";

export const DEFAULT_FREE_ACCOUNT_MAX_MODEL_OPTIONS = [
  "auto",
  "gpt-5",
  "gpt-5-codex",
  "gpt-5-codex-mini",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
  "gpt-5.2",
  "gpt-5.2-codex",
  "gpt-5.3-codex",
  "gpt-5.4-mini",
  "gpt-5.4",
] as const;

export const DEFAULT_FREE_ACCOUNT_PREFERRED_MODEL_OPTIONS =
  DEFAULT_FREE_ACCOUNT_MAX_MODEL_OPTIONS.filter((model) => model !== "auto");

export const DEFAULT_GATEWAY_USER_AGENT_VERSION = "0.117.0";

export const UPSTREAM_PROXY_QUICK_OPTIONS = [
  {
    value: "socks5://127.0.0.1:10808",
    label: "socks5://127.0.0.1:10808",
    hint: "常用本地代理",
  },
] as const;

export function formatFreeAccountModelLabel(value: string | null | undefined): string {
  const normalized = String(value || "").trim();
  if (!normalized || normalized === "auto") {
    return "跟随请求";
  }
  return normalized;
}

export function arraysEqual(
  left: readonly string[] | null | undefined,
  right: readonly string[] | null | undefined,
): boolean {
  const normalizedLeft = left ?? [];
  const normalizedRight = right ?? [];
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((item, index) => item === normalizedRight[index]);
}

export function normalizePreferredModels(
  nextModels: readonly string[],
  knownOptions: readonly string[],
): string[] {
  const uniqueModels = nextModels.filter(
    (model, index) => Boolean(model) && nextModels.indexOf(model) === index,
  );
  const ordered = knownOptions.filter((model) => uniqueModels.includes(model));
  const extras = uniqueModels.filter((model) => !ordered.includes(model));
  return [...ordered, ...extras];
}

export const SETTINGS_TABS = ["general", "appearance", "gateway", "tasks", "env"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export const SETTINGS_ACTIVE_TAB_KEY = "codexmanager.settings.active-tab";

export function readInitialSettingsTab(): SettingsTab {
  if (typeof window === "undefined") return "general";
  const savedTab = window.sessionStorage.getItem(SETTINGS_ACTIVE_TAB_KEY);
  if (savedTab && SETTINGS_TABS.includes(savedTab as SettingsTab)) {
    return savedTab as SettingsTab;
  }
  return "general";
}

export function stringifyNumber(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

export function parseIntegerInput(value: string, minimum = 0): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.trunc(numeric);
  if (rounded < minimum) return null;
  return rounded;
}

export type UpdateCheckSummary = {
  repo: string;
  mode: string;
  isPortable: boolean;
  hasUpdate: boolean;
  canPrepare: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseTag: string;
  releaseName: string;
  reason: string;
};

export type UpdatePrepareSummary = {
  prepared: boolean;
  mode: string;
  isPortable: boolean;
  releaseTag: string;
  latestVersion: string;
  assetName: string;
  assetPath: string;
  downloaded: boolean;
};

export type UpdateStatusSummary = {
  pending: UpdatePrepareSummary | null;
  lastCheck: UpdateCheckSummary | null;
};

export type CheckUpdateRequest = {
  silent?: boolean;
};

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function readStringField(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function readBooleanField(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

export function normalizeUpdateCheckSummary(payload: unknown): UpdateCheckSummary {
  const source = asRecord(payload) ?? {};
  return {
    repo: readStringField(source, "repo"),
    mode: readStringField(source, "mode"),
    isPortable: readBooleanField(source, "isPortable"),
    hasUpdate: readBooleanField(source, "hasUpdate"),
    canPrepare: readBooleanField(source, "canPrepare"),
    currentVersion: readStringField(source, "currentVersion"),
    latestVersion: readStringField(source, "latestVersion"),
    releaseTag: readStringField(source, "releaseTag"),
    releaseName: readStringField(source, "releaseName"),
    reason: readStringField(source, "reason"),
  };
}

export function normalizeUpdatePrepareSummary(payload: unknown): UpdatePrepareSummary {
  const source = asRecord(payload) ?? {};
  return {
    prepared: readBooleanField(source, "prepared"),
    mode: readStringField(source, "mode"),
    isPortable: readBooleanField(source, "isPortable"),
    releaseTag: readStringField(source, "releaseTag"),
    latestVersion: readStringField(source, "latestVersion"),
    assetName: readStringField(source, "assetName"),
    assetPath: readStringField(source, "assetPath"),
    downloaded: readBooleanField(source, "downloaded"),
  };
}

export function normalizePendingUpdateSummary(payload: unknown): UpdatePrepareSummary | null {
  const source = asRecord(payload);
  if (!source) {
    return null;
  }
  return {
    prepared: true,
    mode: readStringField(source, "mode"),
    isPortable: readBooleanField(source, "isPortable"),
    releaseTag: readStringField(source, "releaseTag"),
    latestVersion: readStringField(source, "latestVersion"),
    assetName: readStringField(source, "assetName"),
    assetPath: readStringField(source, "assetPath"),
    downloaded: true,
  };
}

export function normalizeUpdateStatusSummary(payload: unknown): UpdateStatusSummary {
  const source = asRecord(payload) ?? {};
  return {
    pending: normalizePendingUpdateSummary(source.pending),
    lastCheck: source.lastCheck ? normalizeUpdateCheckSummary(source.lastCheck) : null,
  };
}

export function buildReleaseUrl(summary: UpdateCheckSummary | null): string {
  if (!summary?.repo) {
    return "https://github.com/GamblerIX/CodexManager/releases";
  }
  const normalizedTag =
    summary.releaseTag || (summary.latestVersion ? `v${summary.latestVersion}` : "");
  if (!normalizedTag) {
    return `https://github.com/${summary.repo}/releases`;
  }
  return `https://github.com/${summary.repo}/releases/tag/${normalizedTag}`;
}