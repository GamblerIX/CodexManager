import { invoke, withAddr } from "./transport";
import {
  normalizeAccountList,
  normalizeApiKeyCreateResult,
  normalizeApiKeyList,
  normalizeApiKeyUsageStats,
  normalizeLoginStartResult,
  normalizeModelOptions,
  normalizeUsageAggregateSummary,
  normalizeUsageRefreshSummary,
  normalizeUsageList,
  normalizeUsageSnapshot,
} from "./normalize";
import {
  AccountListResult,
  AccountUsage,
  ApiKey,
  ApiKeyCreateResult,
  ApiKeyUsageStat,
  ChatgptAuthTokensRefreshResult,
  CurrentAccessTokenAccountReadResult,
  LoginStatusResult,
  LoginStartResult,
  ModelOption,
  UsageRefreshSummary,
  UsageAggregateSummary,
} from "../../types";

interface AccountImportResult {
  canceled?: boolean;
  total?: number;
  created?: number;
  updated?: number;
  failed?: number;
  errors?: AccountImportError[];
  fileCount?: number;
  directoryPath?: string;
  contents?: string[];
}

interface AccountImportError {
  index: number;
  message: string;
}

interface AccountExportResult {
  canceled?: boolean;
  exported?: number;
  outputDir?: string;
}

interface DeleteUnavailableFreeResult {
  deleted?: number;
}

interface LoginStartPayload {
  loginType?: string;
  openBrowser?: boolean;
  note?: string | null;
  tags?: string[] | string | null;
  group?: string | null;
  groupName?: string | null;
  workspaceId?: string | null;
}

interface AccountUpdatePayload {
  sort?: number | null;
  status?: string | null;
  label?: string | null;
  note?: string | null;
  tags?: string[] | string | null;
}

interface ChatgptAuthTokensLoginPayload {
  accessToken: string;
  refreshToken?: string | null;
  idToken?: string | null;
  chatgptAccountId?: string | null;
  workspaceId?: string | null;
  chatgptPlanType?: string | null;
}

interface ApiKeyPayload {
  name?: string | null;
  modelSlug?: string | null;
  reasoningEffort?: string | null;
  serviceTier?: string | null;
  protocolType?: string | null;
  upstreamBaseUrl?: string | null;
  staticHeadersJson?: string | null;
}

const MAX_IMPORT_RPC_BODY_BYTES = 4 * 1024 * 1024;
const MAX_IMPORT_ERROR_ITEMS = 50;

function createEmptyImportResult(): AccountImportResult {
  return {
    total: 0,
    created: 0,
    updated: 0,
    failed: 0,
    errors: [],
  };
}

function estimateImportRequestBytes(contents: string[]): number {
  return new Blob([JSON.stringify({ contents })]).size;
}

function splitImportContents(contents: string[]): string[][] {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];

  for (const content of contents) {
    const nextChunk = currentChunk.concat(content);
    if (
      currentChunk.length > 0 &&
      estimateImportRequestBytes(nextChunk) > MAX_IMPORT_RPC_BODY_BYTES
    ) {
      chunks.push(currentChunk);
      currentChunk = [content];

      if (estimateImportRequestBytes(currentChunk) > MAX_IMPORT_RPC_BODY_BYTES) {
        throw new Error("单条导入内容过大，请拆分后重试");
      }
      continue;
    }

    currentChunk = nextChunk;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function estimateEntryCount(contents: string[]): number {
  let count = 0;
  for (const content of contents) {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        count += parsed.length;
      } else {
        count += 1;
      }
    } catch {
      // Fallback: count non-empty lines for text formats
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      count += lines.length > 0 ? lines.length : 1;
    }
  }
  return count;
}

function mergeImportResult(
  target: AccountImportResult,
  source: AccountImportResult,
  indexOffset: number
): AccountImportResult {
  const mergedErrors = [...(target.errors || [])];

  for (const error of source.errors || []) {
    if (mergedErrors.length >= MAX_IMPORT_ERROR_ITEMS) {
      break;
    }

    mergedErrors.push({
      index: indexOffset + Math.max(1, error.index || 0),
      message: error.message || "",
    });
  }

  return {
    ...target,
    total: (target.total || 0) + (source.total || 0),
    created: (target.created || 0) + (source.created || 0),
    updated: (target.updated || 0) + (source.updated || 0),
    failed: (target.failed || 0) + (source.failed || 0),
    errors: mergedErrors,
  };
}

async function importAccountContents(contents: string[]): Promise<AccountImportResult> {
  const batches = splitImportContents(contents);
  if (batches.length === 0) {
    return createEmptyImportResult();
  }

  let merged = createEmptyImportResult();
  let processed = 0;

  for (const batch of batches) {
    const estimatedCount = estimateEntryCount(batch);
    try {
      const imported = await invoke<AccountImportResult>(
        "service_account_import",
        withAddr({ contents: batch })
      );
      merged = mergeImportResult(merged, imported, processed);
      processed += (typeof imported.total === "number" ? imported.total : estimatedCount);
    } catch (err) {
      // 前面的批次已经落库，不能丢弃已有结果。
      // 把 IPC/RPC 错误记录到 merged 里，让调用方知道部分成功。
      const batchError = {
        index: processed + 1,
        message: `Batch failed: ${err instanceof Error ? err.message : String(err)}`,
      };
      merged = {
        ...merged,
        total: (merged.total || 0) + estimatedCount,
        failed: (merged.failed || 0) + estimatedCount,
        errors: [...(merged.errors || []), batchError],
      };
      // 后续批次不再继续，返回已有的部分结果
      break;
    }
  }

  return merged;
}

export const accountClient = {
  async list(params?: Record<string, unknown>): Promise<AccountListResult> {
    const result = await invoke<unknown>("service_account_list", withAddr(params));
    return normalizeAccountList(result);
  },
  delete: (accountId: string) =>
    invoke("service_account_delete", withAddr({ accountId })),
  deleteMany: (accountIds: string[]) =>
    invoke("service_account_delete_many", withAddr({ accountIds })),
  deleteUnavailableFree: () =>
    invoke<DeleteUnavailableFreeResult>("service_account_delete_unavailable_free", withAddr()),
  updateSort: (accountId: string, sort: number) =>
    invoke("service_account_update", withAddr({ accountId, sort })),
  updateProfile: (accountId: string, params: AccountUpdatePayload) =>
    invoke("service_account_update", withAddr(buildAccountUpdatePayload(accountId, params))),
  disableAccount: (accountId: string) =>
    invoke("service_account_update", withAddr({ accountId, status: "disabled" })),
  enableAccount: (accountId: string) =>
    invoke("service_account_update", withAddr({ accountId, status: "active" })),
  import: importAccountContents,
  async importByDirectory(): Promise<AccountImportResult> {
    const picked = await invoke<AccountImportResult>(
      "service_account_import_by_directory",
      withAddr()
    );
    if (picked?.canceled || !Array.isArray(picked?.contents) || picked.contents.length === 0) {
      return picked;
    }

    const imported = await importAccountContents(picked.contents);
    return {
      ...imported,
      canceled: false,
      directoryPath: picked.directoryPath || "",
      fileCount: picked.fileCount || picked.contents.length,
    };
  },
  async importByFile(): Promise<AccountImportResult> {
    const picked = await invoke<AccountImportResult>(
      "service_account_import_by_file",
      withAddr()
    );
    if (picked?.canceled || !Array.isArray(picked?.contents) || picked.contents.length === 0) {
      return picked;
    }

    const imported = await importAccountContents(picked.contents);
    return {
      ...imported,
      canceled: false,
      fileCount: picked.fileCount || picked.contents.length,
    };
  },
  export: () =>
    invoke<AccountExportResult>("service_account_export_by_account_files", withAddr()),

  async getUsage(accountId: string): Promise<AccountUsage | null> {
    const result = await invoke<unknown>("service_usage_read", withAddr({ accountId }));
    const source =
      result && typeof result === "object" && "snapshot" in result
        ? (result as { snapshot?: unknown }).snapshot
        : result;
    return normalizeUsageSnapshot(source);
  },
  async listUsage(): Promise<AccountUsage[]> {
    const result = await invoke<unknown>("service_usage_list", withAddr());
    return normalizeUsageList(result);
  },
  async refreshUsage(accountId?: string): Promise<UsageRefreshSummary> {
    const result = await invoke<unknown>(
      "service_usage_refresh",
      withAddr(accountId ? { accountId } : {})
    );
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("账号用量刷新返回了无效结果");
    }
    const source = result as Record<string, unknown>;
    const requiredFields = ["requested", "attempted", "refreshed", "failed", "skipped"];
    if (requiredFields.some((field) => typeof source[field] !== "number")) {
      throw new Error("账号用量刷新返回缺少统计字段");
    }
    return normalizeUsageRefreshSummary(result);
  },
  async aggregateUsage(): Promise<UsageAggregateSummary> {
    const result = await invoke<unknown>("service_usage_aggregate", withAddr());
    return normalizeUsageAggregateSummary(result);
  },

  async startLogin(params: LoginStartPayload): Promise<LoginStartResult> {
    const result = await invoke<unknown>(
      "service_login_start",
      withAddr({
        loginType: params?.loginType || "chatgpt",
        openBrowser: params?.openBrowser ?? true,
        note: params?.note || null,
        tags: Array.isArray(params?.tags)
          ? params.tags
              .map((item: string) => String(item || "").trim())
              .filter(Boolean)
              .join(",")
          : params?.tags || null,
        groupName: params?.group || params?.groupName || null,
        workspaceId: params?.workspaceId || null,
      })
    );
    return normalizeLoginStartResult(result);
  },
  async getLoginStatus(loginId: string): Promise<LoginStatusResult> {
    const result = await invoke<unknown>("service_login_status", withAddr({ loginId }));
    const source =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};
    return {
      status: typeof source.status === "string" ? source.status.trim() : "",
      error: typeof source.error === "string" ? source.error.trim() : "",
    };
  },
  completeLogin: (state: string, code: string, redirectUri: string) =>
    invoke("service_login_complete", withAddr({ state, code, redirectUri })),
  loginWithChatgptAuthTokens: (params: ChatgptAuthTokensLoginPayload) =>
    invoke("service_login_chatgpt_auth_tokens", withAddr({
      accessToken: params.accessToken,
      refreshToken: params.refreshToken || null,
      idToken: params.idToken || null,
      chatgptAccountId: params.chatgptAccountId || null,
      workspaceId: params.workspaceId || null,
      chatgptPlanType: params.chatgptPlanType || null,
    })),
  async readCurrentAccessTokenAccount(
    refreshToken = false
  ): Promise<CurrentAccessTokenAccountReadResult> {
    const result = await invoke<unknown>(
      "service_account_read",
      withAddr({ refreshToken })
    );
    const source =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};
    return {
      account:
        source.account && typeof source.account === "object" && !Array.isArray(source.account)
          ? (source.account as CurrentAccessTokenAccountReadResult["account"])
          : null,
      authMode: typeof source.authMode === "string" ? source.authMode : null,
      requiresOpenaiAuth: Boolean(source.requiresOpenaiAuth),
    };
  },
  logoutCurrentAccessTokenAccount: () =>
    invoke("service_account_logout", withAddr()),
  async refreshChatgptAuthTokens(
    previousAccountId?: string
  ): Promise<ChatgptAuthTokensRefreshResult> {
    const result = await invoke<unknown>(
      "service_chatgpt_auth_tokens_refresh",
      withAddr({ previousAccountId: previousAccountId || null })
    );
    const source =
      result && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {};
    return {
      accountId: String(source.accountId || "").trim(),
      accessToken: String(source.accessToken || "").trim(),
      chatgptAccountId: String(source.chatgptAccountId || "").trim(),
      chatgptPlanType:
        typeof source.chatgptPlanType === "string"
          ? source.chatgptPlanType.trim()
          : null,
      chatgptPlanTypeRaw:
        typeof source.chatgptPlanTypeRaw === "string"
          ? source.chatgptPlanTypeRaw.trim()
          : null,
    };
  },

  async listApiKeys(): Promise<ApiKey[]> {
    const result = await invoke<unknown>("service_apikey_list", withAddr());
    return normalizeApiKeyList(result);
  },
  async createApiKey(params: ApiKeyPayload): Promise<ApiKeyCreateResult> {
    const result = await invoke<unknown>(
      "service_apikey_create",
      withAddr({
        name: params.name || null,
        modelSlug: params.modelSlug || null,
        reasoningEffort: params.reasoningEffort || null,
        serviceTier: params.serviceTier || null,
        protocolType: params.protocolType || null,
        upstreamBaseUrl: params.upstreamBaseUrl || null,
        staticHeadersJson: params.staticHeadersJson || null,
      })
    );
    return normalizeApiKeyCreateResult(result);
  },
  async listApiKeyUsageStats(): Promise<ApiKeyUsageStat[]> {
    const result = await invoke<unknown>("service_apikey_usage_stats", withAddr());
    return normalizeApiKeyUsageStats(result);
  },
  deleteApiKey: (keyId: string) =>
    invoke("service_apikey_delete", withAddr({ keyId })),
  updateApiKey: (keyId: string, params: ApiKeyPayload) =>
    invoke(
      "service_apikey_update_model",
      withAddr({
        keyId,
        name: params.name || null,
        modelSlug: params.modelSlug || null,
        reasoningEffort: params.reasoningEffort || null,
        serviceTier: params.serviceTier || null,
        protocolType: params.protocolType || null,
        upstreamBaseUrl: params.upstreamBaseUrl || null,
        staticHeadersJson: params.staticHeadersJson || null,
      })
    ),
  disableApiKey: (keyId: string) =>
    invoke("service_apikey_disable", withAddr({ keyId })),
  enableApiKey: (keyId: string) =>
    invoke("service_apikey_enable", withAddr({ keyId })),
  async listModels(refreshRemote?: boolean): Promise<ModelOption[]> {
    const result = await invoke<unknown>(
      "service_apikey_models",
      withAddr({ refreshRemote })
    );
    return normalizeModelOptions(result);
  },
  async readApiKeySecret(keyId: string): Promise<string> {
    const result = await invoke<{ key?: string }>(
      "service_apikey_read_secret",
      withAddr({ keyId })
    );
    return String(result?.key || "").trim();
  },
};

function buildAccountUpdatePayload(
  accountId: string,
  params: AccountUpdatePayload
): Record<string, unknown> {
  const payload: Record<string, unknown> = { accountId };

  if (params.sort !== undefined) {
    payload.sort = params.sort;
  }
  if (params.status !== undefined) {
    payload.status = params.status || null;
  }
  if (params.label !== undefined) {
    payload.label = params.label;
  }
  if (Object.prototype.hasOwnProperty.call(params, "note")) {
    payload.note = params.note ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(params, "tags")) {
    payload.tags = Array.isArray(params.tags)
      ? params.tags
          .map((item: string) => String(item || "").trim())
          .filter(Boolean)
          .join(",")
      : params.tags ?? null;
  }

  return payload;
}
