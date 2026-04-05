"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useDeferredDesktopActivation } from "@/hooks/useDeferredDesktopActivation";
import { useRuntimeCapabilities } from "@/hooks/useRuntimeCapabilities";
import { appClient } from "@/lib/api/app-client";
import { serviceClient } from "@/lib/api/service-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { ROOT_PAGE_SETTINGS } from "@/lib/routes/root-page-paths";
import { useAppStore } from "@/lib/store/useAppStore";
import { createSerializedTaskQueue } from "@/lib/utils/serialized-task-queue";
import { isExpectedInitializeResult } from "@/lib/utils/service";
import {
  completePreferredModelSave,
  createPreferredModelSaveState,
  failPreferredModelSave,
  startPreferredModelSave,
  syncPreferredModelSaveConfirmedModels,
} from "./preferred-model-save-state";
import {
  createBackgroundTasksPatch,
  createEnvOverridePatch,
  createEnvOverrideResetPatch,
} from "./settings-patches";
import {
  applyAppearancePreset,
  normalizeAppearancePreset,
} from "@/lib/appearance";
import { AppSettings, AppSettingsPatch, BackgroundTaskSettings } from "@/types";
import { readServiceListenState } from "./service-listen-state";
import { SettingsPageContent } from "./settings-page-content";
import { SettingsUpdateDialog } from "./settings-update-dialog";
import {
  asRecord,
  arraysEqual,
  buildReleaseUrl,
  type CheckUpdateRequest,
  DEFAULT_FREE_ACCOUNT_PREFERRED_MODEL_OPTIONS,
  DEFAULT_GATEWAY_USER_AGENT_VERSION,
  normalizePreferredModels,
  normalizeUpdateCheckSummary,
  normalizeUpdatePrepareSummary,
  normalizeUpdateStatusSummary,
  parseIntegerInput,
  readInitialSettingsTab,
  readStringField,
  SETTINGS_ACTIVE_TAB_KEY,
  type SettingsTab,
  stringifyNumber,
  type UpdateCheckSummary,
  type UpdatePrepareSummary,
} from "./settings-page-utils";

export default function SettingsPage() {
  const { setAppSettings: setStoreSettings, setServiceStatus } = useAppStore();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const runtimeCapabilities = useRuntimeCapabilities();
  const isDesktopRuntime = runtimeCapabilities.isDesktop;
  const dataEnabled = useDeferredDesktopActivation(ROOT_PAGE_SETTINGS);
  const lastSyncedSnapshotThemeRef = useRef<string | null>(null);
  const lastSyncedAppearancePresetRef = useRef<string | null>(null);
  const autoUpdateCheckedRef = useRef(false);
  const manualUpdateCheckPendingRef = useRef(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>(readInitialSettingsTab);
  const [envSearch, setEnvSearch] = useState("");
  const [selectedEnvKey, setSelectedEnvKey] = useState<string | null>(null);
  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({});
  const [upstreamProxyDraft, setUpstreamProxyDraft] = useState<string | null>(null);
  const [upstreamProxyQuickFillOpen, setUpstreamProxyQuickFillOpen] = useState(false);
  const [gatewayOriginatorDraft, setGatewayOriginatorDraft] = useState<string | null>(null);
  const [gatewayUserAgentVersionDraft, setGatewayUserAgentVersionDraft] = useState<string | null>(null);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<UpdateCheckSummary | null>(null);
  const [updateDialogCheck, setUpdateDialogCheck] = useState<UpdateCheckSummary | null>(null);
  const [preparedUpdate, setPreparedUpdate] = useState<UpdatePrepareSummary | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [manualUpdateCheckPending, setManualUpdateCheckPending] = useState(false);
  const [transportDraft, setTransportDraft] = useState<
    Partial<Record<"sseKeepaliveIntervalMs" | "upstreamStreamTimeoutMs", string>>
  >({});
  const [backgroundTaskDraft, setBackgroundTaskDraft] = useState<Record<string, string>>({});
  const [pendingFreeAccountPreferredModels, setPendingFreeAccountPreferredModels] = useState<
    string[] | null
  >(null);

  const { data: snapshot, isLoading } = useQuery({
    queryKey: ["app-settings-snapshot"],
    queryFn: () => appClient.getSettings(),
    enabled: dataEnabled,
    placeholderData: (previousData) => previousData,
  });

  const syncSettingsSnapshot = (nextSnapshot: AppSettings) => {
    queryClient.setQueryData(["app-settings-snapshot"], nextSnapshot);
    setStoreSettings(nextSnapshot);
    if (nextSnapshot.lowTransparency) {
      document.body.classList.add("low-transparency");
    } else {
      document.body.classList.remove("low-transparency");
    }
    applyAppearancePreset(nextSnapshot.appearancePreset);
  };
  const getCurrentSettingsSnapshot = (): AppSettings | null => {
    const current = queryClient.getQueryData(["app-settings-snapshot"]);
    return (current as AppSettings | undefined) ?? snapshot ?? null;
  };

  const updateSettings = useMutation({
    mutationFn: (patch: AppSettingsPatch & { _silent?: boolean; _skipAutoSync?: boolean }) => {
      const actualPatch = { ...patch };
      delete actualPatch._silent;
      delete actualPatch._skipAutoSync;
      return appClient.setSettings(actualPatch);
    },
    onSuccess: (nextSnapshot, variables) => {
      if (!variables._skipAutoSync) {
        syncSettingsSnapshot(nextSnapshot);
      }
      if (!variables._silent) {
        toast.success("设置已更新");
      }
    },
    onError: (error: unknown) => {
      toast.error(`更新失败: ${getAppErrorMessage(error)}`);
    },
  });

  const restartServiceForListenMode = useMutation({
    mutationFn: async () => {
      const addr = snapshot?.serviceAddr || "localhost:48760";
      await serviceClient.start(addr);
      const init = await serviceClient.initialize(addr);
      if (!isExpectedInitializeResult(init)) {
        throw new Error("Port is in use or unexpected service responded (missing server_name)");
      }
      return { init, settings: await appClient.getSettings(), addr };
    },
    onSuccess: async ({ init, settings, addr }) => {
      syncSettingsSnapshot(settings);
      setServiceStatus({ connected: true, version: init.version, addr });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["startup-snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["usage"] }),
      ]);
      toast.success("服务已按新的监听地址重启");
    },
    onError: (error: unknown) => {
      toast.error(`重启服务失败: ${getAppErrorMessage(error)}`);
    },
  });

  const checkUpdate = useMutation({
    mutationFn: (request?: CheckUpdateRequest) => {
      void request;
      return appClient.checkUpdate();
    },
    onSuccess: (result, request) => {
      const summary = normalizeUpdateCheckSummary(result);
      setLastUpdateCheck(summary);
      setUpdateDialogCheck(summary);
      if (summary.hasUpdate) {
        setPreparedUpdate((current) =>
          current && current.latestVersion === summary.latestVersion ? current : null
        );
        if (!request?.silent) {
          toast.success(`发现新版本 ${summary.latestVersion || summary.releaseTag || "可用"}，可立即下载更新`);
        }
        return;
      }
      setPreparedUpdate(null);
      setUpdateDialogOpen(false);
      if (!request?.silent) {
        toast.success(
          summary.reason
            ? `已检查更新：${summary.reason}`
            : `当前已是最新版本 ${summary.currentVersion || ""}`.trim()
        );
      }
    },
    onError: (error: unknown) => {
      toast.error(`检查更新失败: ${getAppErrorMessage(error)}`);
    },
    onSettled: () => {
      if (manualUpdateCheckPendingRef.current) {
        manualUpdateCheckPendingRef.current = false;
        setManualUpdateCheckPending(false);
      }
    },
  });

  const prepareUpdate = useMutation({
    mutationFn: () => appClient.prepareUpdate(),
    onSuccess: (result) => {
      const summary = normalizeUpdatePrepareSummary(result);
      setPreparedUpdate(summary);
      setUpdateDialogOpen(true);
      toast.success(
        summary.isPortable
          ? `更新已下载完成，确认后即可替换到 ${summary.latestVersion || "新版本"}`
          : `更新包已下载完成，确认后开始替换到 ${summary.latestVersion || "新版本"}`
      );
    },
    onError: (error: unknown) => {
      toast.error(`下载更新失败: ${getAppErrorMessage(error)}`);
    },
  });

  const applyPreparedUpdate = useMutation({
    mutationFn: (payload: { isPortable: boolean }) =>
      payload.isPortable ? appClient.applyUpdatePortable() : appClient.launchInstaller(),
    onSuccess: (result, payload) => {
      setPreparedUpdate(null);
      setLastUpdateCheck(null);
      setUpdateDialogCheck(null);
      setUpdateDialogOpen(false);
      const message = readStringField(asRecord(result) ?? {}, "message");
      toast.success(message || (payload.isPortable ? "即将重启并替换更新" : "已开始替换更新流程"));
    },
    onError: (error: unknown, payload) => {
      toast.error(
        `${payload.isPortable ? "替换更新" : "启动安装程序"}失败: ${getAppErrorMessage(error)}`
      );
    },
  });

  useEffect(() => {
    if (!isDesktopRuntime) {
      return;
    }

    let cancelled = false;
    void appClient
      .getStatus()
      .then((result) => {
        if (cancelled) {
          return;
        }
        const summary = normalizeUpdateStatusSummary(result);
        if (summary.lastCheck) {
          setLastUpdateCheck(summary.lastCheck);
          setUpdateDialogCheck(summary.lastCheck);
        }
        if (summary.pending) {
          setPreparedUpdate(summary.pending);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isDesktopRuntime]);

  useEffect(() => {
    if (!snapshot?.theme) return;
    if (lastSyncedSnapshotThemeRef.current === snapshot.theme) return;

    lastSyncedSnapshotThemeRef.current = snapshot.theme;
    const currentAppliedTheme =
      typeof document !== "undefined"
        ? document.documentElement.getAttribute("data-theme")
        : null;

    if (snapshot.theme !== currentAppliedTheme) {
      setTheme(snapshot.theme);
    }
  }, [setTheme, snapshot?.theme]);

  useEffect(() => {
    if (!snapshot) return;
    const nextPreset = normalizeAppearancePreset(snapshot.appearancePreset);
    if (lastSyncedAppearancePresetRef.current === nextPreset) return;

    lastSyncedAppearancePresetRef.current = nextPreset;
    applyAppearancePreset(nextPreset);
  }, [snapshot]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SETTINGS_ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (!isDesktopRuntime || !snapshot?.updateAutoCheck || autoUpdateCheckedRef.current) {
      return;
    }
    autoUpdateCheckedRef.current = true;
    checkUpdate.mutate({ silent: true });
  }, [checkUpdate, isDesktopRuntime, snapshot?.updateAutoCheck]);

  const handleOpenReleasePage = () => {
    void appClient
      .openInBrowser(buildReleaseUrl(updateDialogCheck ?? lastUpdateCheck))
      .catch((error) => {
        toast.error(`打开发布页失败: ${getAppErrorMessage(error)}`);
      });
  };

  const handleManualCheckUpdate = () => {
    manualUpdateCheckPendingRef.current = true;
    setManualUpdateCheckPending(true);
    checkUpdate.mutate({ silent: false });
  };

  const hasPreparedUpdate = Boolean(preparedUpdate);
  const canDownloadUpdate = Boolean(
    !preparedUpdate && lastUpdateCheck?.hasUpdate && lastUpdateCheck.canPrepare
  );
  const shouldShowUpdateLogsEntry = Boolean(
    isDesktopRuntime && (preparedUpdate || lastUpdateCheck)
  );
  const updateActionLabel = hasPreparedUpdate
    ? "替换更新"
    : canDownloadUpdate
      ? "下载更新"
      : "检查更新";
  const updateActionDescription = !isDesktopRuntime
    ? "Web 版不提供桌面应用更新检查"
    : hasPreparedUpdate
      ? "更新包已下载完成，点击后确认替换当前版本"
      : canDownloadUpdate
        ? "已发现新版本，点击后开始下载更新包"
        : "立即检查 GitHub Releases 是否有新版本可用";
  const updateActionBusy = Boolean(
    manualUpdateCheckPending || prepareUpdate.isPending || applyPreparedUpdate.isPending
  );
  const updateActionBusyLabel = manualUpdateCheckPending
    ? "正在检查..."
    : prepareUpdate.isPending
      ? "正在下载..."
      : applyPreparedUpdate.isPending
        ? "正在替换..."
        : updateActionLabel;

  const listenState = snapshot
    ? readServiceListenState(snapshot)
    : {
        savedBindAddr: "localhost:48760",
        effectiveBindAddr: "localhost:48760",
        restartRequired: false,
      };

  const handleUpdateAction = () => {
    if (preparedUpdate) {
      setUpdateDialogCheck((current) => current ?? lastUpdateCheck);
      setUpdateDialogOpen(true);
      return;
    }

    if (lastUpdateCheck?.hasUpdate && lastUpdateCheck.canPrepare) {
      setUpdateDialogCheck(lastUpdateCheck);
      prepareUpdate.mutate();
      return;
    }

    handleManualCheckUpdate();
  };

  const handleOpenUpdateLogsDir = () => {
    void appClient.openUpdateLogsDir(preparedUpdate?.assetPath).catch((error) => {
      toast.error(`打开日志目录失败: ${getAppErrorMessage(error)}`);
    });
  };

  const filteredEnvCatalog = useMemo(() => {
    const catalog = snapshot?.envOverrideCatalog || [];
    if (!envSearch) return catalog;
    const keyword = envSearch.toLowerCase();
    return catalog.filter(
      (item) =>
        item.key.toLowerCase().includes(keyword) ||
        item.label.toLowerCase().includes(keyword)
    );
  }, [envSearch, snapshot?.envOverrideCatalog]);

  const selectedEnvItem = useMemo(
    () => snapshot?.envOverrideCatalog.find((item) => item.key === selectedEnvKey),
    [selectedEnvKey, snapshot?.envOverrideCatalog]
  );
  const freeAccountPreferredModelOptions = useMemo(() => {
    const options =
      snapshot?.freeAccountPreferredModelOptions?.length
        ? snapshot.freeAccountPreferredModelOptions
        : DEFAULT_FREE_ACCOUNT_PREFERRED_MODEL_OPTIONS;
    return options.filter(
      (model, index) => model && options.indexOf(model) === index
    );
  }, [snapshot?.freeAccountPreferredModelOptions]);

  const upstreamProxyInput = upstreamProxyDraft ?? (snapshot?.upstreamProxyUrl || "");
  const gatewayOriginatorInput =
    gatewayOriginatorDraft ?? (snapshot?.gatewayOriginator || "codex_cli_rs");
  const gatewayUserAgentVersionInput =
    gatewayUserAgentVersionDraft ??
    (snapshot?.gatewayUserAgentVersion || DEFAULT_GATEWAY_USER_AGENT_VERSION);
  const transportInputValues = {
    sseKeepaliveIntervalMs:
      transportDraft.sseKeepaliveIntervalMs ??
      stringifyNumber(snapshot?.sseKeepaliveIntervalMs),
    upstreamStreamTimeoutMs:
      transportDraft.upstreamStreamTimeoutMs ??
      stringifyNumber(snapshot?.upstreamStreamTimeoutMs),
  };
  const selectedEnvValue = selectedEnvKey
    ? envDrafts[selectedEnvKey] ??
      snapshot?.envOverrides[selectedEnvKey] ??
      selectedEnvItem?.defaultValue ??
      ""
    : "";

  const lastIntentThemeRef = useRef<string | null>(null);
  const lastIntentAppearancePresetRef = useRef<string | null>(null);
  const freeAccountPreferredSaveQueueRef = useRef(createSerializedTaskQueue());
  const freeAccountPreferredSaveStateRef = useRef(createPreferredModelSaveState());
  const effectiveFreeAccountPreferredModels =
    pendingFreeAccountPreferredModels ?? (snapshot?.freeAccountPreferredModels || []);

  useEffect(() => {
    if (!snapshot || pendingFreeAccountPreferredModels != null) {
      return;
    }
    freeAccountPreferredSaveStateRef.current = syncPreferredModelSaveConfirmedModels(
      freeAccountPreferredSaveStateRef.current,
      snapshot.freeAccountPreferredModels || []
    );
  }, [pendingFreeAccountPreferredModels, snapshot]);

  const handleThemeChange = (nextTheme: string) => {
    const currentSnapshot = getCurrentSettingsSnapshot();
    if (!currentSnapshot || nextTheme === currentSnapshot.theme) return;
    const previousSnapshot = currentSnapshot;
    const previousTheme = currentSnapshot.theme || "tech";

    // 1. Immediately update local UI and intent lock
    lastIntentThemeRef.current = nextTheme;
    lastSyncedSnapshotThemeRef.current = nextTheme;
    
    setActiveTab("appearance");
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SETTINGS_ACTIVE_TAB_KEY, "appearance");
    }
    
    setTheme(nextTheme);

    // 2. Optimistic local update
    syncSettingsSnapshot({
      ...currentSnapshot,
      theme: nextTheme,
    });

    // 3. Immediate persist to backend (No debounce)
    updateSettings.mutate(
      { theme: nextTheme, _silent: true, _skipAutoSync: true },
      {
        onSuccess: (updatedSnapshot) => {
          // 二次确认这仍是当前意图
          if (lastIntentThemeRef.current === nextTheme) {
            syncSettingsSnapshot(updatedSnapshot);
          }
        },
        onError: () => {
          // 仅在没有更新的意图时才回滚
          if (lastIntentThemeRef.current === nextTheme) {
            syncSettingsSnapshot(previousSnapshot);
            setTheme(previousTheme);
          }
        },
      }
    );
  };

  const handleAppearancePresetChange = (nextPreset: string) => {
    const currentSnapshot = getCurrentSettingsSnapshot();
    if (!currentSnapshot) return;

    const normalizedPreset = normalizeAppearancePreset(nextPreset);
    const previousSnapshot = currentSnapshot;
    const previousPreset = normalizeAppearancePreset(currentSnapshot.appearancePreset);
    if (normalizedPreset === previousPreset) return;

    lastIntentAppearancePresetRef.current = normalizedPreset;
    lastSyncedAppearancePresetRef.current = normalizedPreset;
    applyAppearancePreset(normalizedPreset);

    syncSettingsSnapshot({
      ...currentSnapshot,
      appearancePreset: normalizedPreset,
    });

    updateSettings.mutate(
      { appearancePreset: normalizedPreset, _silent: true, _skipAutoSync: true },
      {
        onSuccess: (updatedSnapshot) => {
          if (lastIntentAppearancePresetRef.current === normalizedPreset) {
            syncSettingsSnapshot(updatedSnapshot);
          }
        },
        onError: () => {
          if (lastIntentAppearancePresetRef.current === normalizedPreset) {
            syncSettingsSnapshot(previousSnapshot);
          }
        },
      }
    );
  };

  const updateBackgroundTasks = (patch: Partial<BackgroundTaskSettings>) => {
    if (!snapshot) return;
    updateSettings.mutate(createBackgroundTasksPatch(patch));
  };

  const setFreeAccountPreferredModels = (nextModels: string[]) => {
    const currentSnapshot = getCurrentSettingsSnapshot();
    if (!currentSnapshot) return;
    const normalizedModels = normalizePreferredModels(
      nextModels,
      freeAccountPreferredModelOptions
    );
    if (
      pendingFreeAccountPreferredModels == null &&
      arraysEqual(normalizedModels, currentSnapshot.freeAccountPreferredModels || [])
    ) {
      return;
    }

    const previousSnapshot = currentSnapshot;
    const optimisticSnapshot = {
      ...currentSnapshot,
      freeAccountPreferredModels: normalizedModels,
    };
    const { intentId, state: nextSaveState } = startPreferredModelSave(
      freeAccountPreferredSaveStateRef.current
    );

    freeAccountPreferredSaveStateRef.current = nextSaveState;
    setPendingFreeAccountPreferredModels(normalizedModels);
    syncSettingsSnapshot(optimisticSnapshot);

    void freeAccountPreferredSaveQueueRef.current
      .run(() =>
        updateSettings.mutateAsync({
          freeAccountPreferredModels: normalizedModels,
          _silent: true,
          _skipAutoSync: true,
        } as AppSettingsPatch & { _silent: boolean; _skipAutoSync: boolean })
      )
      .then((updatedSnapshot) => {
        const successResult = completePreferredModelSave(
          freeAccountPreferredSaveStateRef.current,
          intentId,
          updatedSnapshot.freeAccountPreferredModels || []
        );
        freeAccountPreferredSaveStateRef.current = successResult.state;

        if (successResult.shouldApplyToUi) {
          setPendingFreeAccountPreferredModels(null);
          syncSettingsSnapshot(updatedSnapshot);
        }
      })
      .catch(() => {
        const failureResult = failPreferredModelSave(
          freeAccountPreferredSaveStateRef.current,
          intentId
        );
        freeAccountPreferredSaveStateRef.current = failureResult.state;

        if (failureResult.shouldRollbackToConfirmedModels) {
          const rollbackSnapshot = getCurrentSettingsSnapshot() ?? previousSnapshot;
          setPendingFreeAccountPreferredModels(null);
          syncSettingsSnapshot({
            ...rollbackSnapshot,
            freeAccountPreferredModels: failureResult.confirmedModels,
          });
        }
      });
  };

  const toggleFreeAccountPreferredModel = (model: string) => {
    if (!snapshot) return;
    const current = effectiveFreeAccountPreferredModels;
    const nextModels = current.includes(model)
      ? current.filter((item) => item !== model)
      : [...current, model];
    setFreeAccountPreferredModels(nextModels);
  };

  const saveUpstreamProxy = (nextValue: string) => {
    if (!snapshot) return;
    const normalized = nextValue.trim();
    if (normalized === (snapshot.upstreamProxyUrl || "")) {
      setUpstreamProxyDraft(null);
      return;
    }
    void updateSettings
      .mutateAsync({ upstreamProxyUrl: normalized })
      .then(() => setUpstreamProxyDraft(null))
      .catch(() => undefined);
  };

  const applyUpstreamProxyQuickFill = (nextValue: string) => {
    setUpstreamProxyQuickFillOpen(false);
    setUpstreamProxyDraft(nextValue);
    saveUpstreamProxy(nextValue);
  };

  const saveTransportField = (
    key: "sseKeepaliveIntervalMs" | "upstreamStreamTimeoutMs",
    minimum: number
  ) => {
    const nextValue = parseIntegerInput(transportInputValues[key], minimum);
    if (nextValue == null) {
      toast.error("请输入合法的数值");
      setTransportDraft((current) => {
        const nextDraft = { ...current };
        delete nextDraft[key];
        return nextDraft;
      });
      return;
    }
    void updateSettings
      .mutateAsync({ [key]: nextValue } as AppSettingsPatch)
      .then(() => {
        setTransportDraft((current) => {
          const nextDraft = { ...current };
          delete nextDraft[key];
          return nextDraft;
        });
      })
      .catch(() => undefined);
  };

  const saveBackgroundTaskField = (key: keyof BackgroundTaskSettings, minimum = 1) => {
    if (!snapshot) return;
    const draftKey = String(key);
    const sourceValue =
      backgroundTaskDraft[draftKey] ?? stringifyNumber(snapshot.backgroundTasks[key] as number);
    const nextValue = parseIntegerInput(sourceValue, minimum);
    if (nextValue == null) {
      toast.error("请输入合法的数值");
      setBackgroundTaskDraft((current) => {
        const nextDraft = { ...current };
        delete nextDraft[draftKey];
        return nextDraft;
      });
      return;
    }
    void updateSettings
      .mutateAsync(createBackgroundTasksPatch({ [key]: nextValue } as Partial<BackgroundTaskSettings>))
      .then(() => {
        setBackgroundTaskDraft((current) => {
          const nextDraft = { ...current };
          delete nextDraft[draftKey];
          return nextDraft;
        });
      })
      .catch(() => undefined);
  };

  const handleSaveEnv = () => {
    if (!selectedEnvKey || !snapshot) return;
    void updateSettings
      .mutateAsync(createEnvOverridePatch(selectedEnvKey, selectedEnvValue))
      .then(() => {
        setEnvDrafts((current) => {
          const nextDraft = { ...current };
          delete nextDraft[selectedEnvKey];
          return nextDraft;
        });
      })
      .catch(() => undefined);
  };

  const handleResetEnv = () => {
    if (!selectedEnvKey || !snapshot) return;
    void updateSettings
      .mutateAsync(createEnvOverrideResetPatch(selectedEnvKey))
      .then(() => {
        setEnvDrafts((current) => {
          const nextDraft = { ...current };
          delete nextDraft[selectedEnvKey];
          return nextDraft;
        });
      })
      .catch(() => undefined);
  };

  if (isLoading || !snapshot) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">加载配置中...</div>;
  }

  return (
    <>
      <SettingsPageContent
        activeTab={activeTab}
        appearance={{
          onAppearancePresetChange: handleAppearancePresetChange,
          onThemeChange: handleThemeChange,
          theme,
        }}
        env={{
          envSearch,
          filteredEnvCatalog,
          onEnvSearchChange: setEnvSearch,
          onResetEnv: handleResetEnv,
          onSaveEnv: handleSaveEnv,
          onSelectedEnvKeyChange: setSelectedEnvKey,
          onSelectedEnvValueChange: (value) => {
            if (!selectedEnvKey) return;
            setEnvDrafts((current) => ({
              ...current,
              [selectedEnvKey]: value,
            }));
          },
          selectedEnvItem: selectedEnvItem ?? null,
          selectedEnvKey,
          selectedEnvValue,
        }}
        gateway={{
          effectiveFreeAccountPreferredModels,
          freeAccountPreferredModelOptions,
          gatewayOriginatorInput,
          gatewayUserAgentVersionInput,
          onApplyUpstreamProxyQuickFill: applyUpstreamProxyQuickFill,
          onFreeAccountMaxModelChange: (value) =>
            updateSettings.mutate({ freeAccountMaxModel: value }),
          onGatewayOriginatorBlur: () => {
            if (gatewayOriginatorDraft == null) return;
            if (gatewayOriginatorInput === (snapshot.gatewayOriginator || "codex_cli_rs")) {
              setGatewayOriginatorDraft(null);
              return;
            }
            void updateSettings
              .mutateAsync({ gatewayOriginator: gatewayOriginatorInput })
              .then(() => setGatewayOriginatorDraft(null))
              .catch(() => undefined);
          },
          onGatewayOriginatorInputChange: setGatewayOriginatorDraft,
          onGatewayResidencyRequirementChange: (value) =>
            updateSettings.mutate({
              gatewayResidencyRequirement: value === "__none__" ? "" : (value ?? ""),
            }),
          onGatewayUserAgentVersionBlur: () => {
            if (gatewayUserAgentVersionDraft == null) return;
            if (
              gatewayUserAgentVersionInput ===
              (snapshot.gatewayUserAgentVersion || DEFAULT_GATEWAY_USER_AGENT_VERSION)
            ) {
              setGatewayUserAgentVersionDraft(null);
              return;
            }
            void updateSettings
              .mutateAsync({ gatewayUserAgentVersion: gatewayUserAgentVersionInput })
              .then(() => setGatewayUserAgentVersionDraft(null))
              .catch(() => undefined);
          },
          onGatewayUserAgentVersionInputChange: setGatewayUserAgentVersionDraft,
          onRequestCompressionEnabledChange: (value) =>
            updateSettings.mutate({ requestCompressionEnabled: value }),
          onRouteStrategyChange: (value) =>
            updateSettings.mutate({ routeStrategy: value }),
          onSaveTransportField: saveTransportField,
          onSetFreeAccountPreferredModels: setFreeAccountPreferredModels,
          onToggleFreeAccountPreferredModel: toggleFreeAccountPreferredModel,
          onTransportDraftChange: (key, value) =>
            setTransportDraft((current) => ({
              ...current,
              [key]: value,
            })),
          onUpstreamProxyBlur: () => {
            if (upstreamProxyDraft == null) return;
            saveUpstreamProxy(upstreamProxyInput);
          },
          onUpstreamProxyInputChange: setUpstreamProxyDraft,
          onUpstreamProxyQuickFillOpenChange: setUpstreamProxyQuickFillOpen,
          transportInputValues,
          upstreamProxyInput,
          upstreamProxyQuickFillOpen,
        }}
        general={{
          canDownloadUpdate,
          hasPreparedUpdate,
          isApplyingPreparedUpdate: applyPreparedUpdate.isPending,
          isPreparingUpdate: prepareUpdate.isPending,
          isRestartingService: restartServiceForListenMode.isPending,
          lastUpdateCheck,
          manualUpdateCheckPending,
          onCloseToTrayChange: (value) => updateSettings.mutate({ closeToTrayOnClose: value }),
          onLowTransparencyChange: (value) => updateSettings.mutate({ lowTransparency: value }),
          onOpenUpdateLogsDir: handleOpenUpdateLogsDir,
          onRestartService: () => restartServiceForListenMode.mutate(),
          onServiceListenModeChange: (value) => updateSettings.mutate({ serviceListenMode: value }),
          onUpdateAction: handleUpdateAction,
          onUpdateAutoCheckChange: (value) => updateSettings.mutate({ updateAutoCheck: value }),
          preparedUpdate,
          shouldShowUpdateLogsEntry,
          updateActionBusy,
          updateActionBusyLabel,
          updateActionDescription,
          updateActionLabel,
        }}
        isDesktopRuntime={isDesktopRuntime}
        listenState={listenState}
        onActiveTabChange={setActiveTab}
        snapshot={snapshot}
        supportsLocalServiceControl={runtimeCapabilities.supportsLocalServiceControl}
        tasks={{
          backgroundTaskDraft,
          onBackgroundTaskDraftChange: (key, value) =>
            setBackgroundTaskDraft((current) => ({
              ...current,
              [key]: value,
            })),
          onSaveBackgroundTaskField: saveBackgroundTaskField,
          onUpdateBackgroundTasks: updateBackgroundTasks,
        }}
      />

      <SettingsUpdateDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        preparedUpdate={preparedUpdate}
        updateCheck={updateDialogCheck}
        isPreparingUpdate={prepareUpdate.isPending}
        isApplyingPreparedUpdate={applyPreparedUpdate.isPending}
        onPrepareUpdate={() => prepareUpdate.mutate()}
        onApplyPreparedUpdate={(payload) => applyPreparedUpdate.mutate(payload)}
        onOpenReleasePage={handleOpenReleasePage}
      />
    </>
  );
}
