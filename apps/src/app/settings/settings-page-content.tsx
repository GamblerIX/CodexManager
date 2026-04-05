import {
  Check,
  Cpu,
  Info,
  Palette,
  RotateCcw,
  Save,
  Search,
  Settings as SettingsIcon,
  Variable,
} from "lucide-react";
import {
  APPEARANCE_PRESETS,
  normalizeAppearancePreset,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";
import { AppSettings, BackgroundTaskSettings } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsGeneralTab } from "./settings-general-tab";
import {
  DEFAULT_FREE_ACCOUNT_MAX_MODEL_OPTIONS,
  DEFAULT_GATEWAY_USER_AGENT_VERSION,
  EMPTY_RESIDENCY_OPTION,
  ENV_DESCRIPTION_MAP,
  formatFreeAccountModelLabel,
  RESIDENCY_REQUIREMENT_LABELS,
  ROUTE_STRATEGY_LABELS,
  SETTINGS_TABS,
  stringifyNumber,
  THEMES,
  type SettingsTab,
  type UpdateCheckSummary,
  type UpdatePrepareSummary,
  UPSTREAM_PROXY_QUICK_OPTIONS,
} from "./settings-page-utils";

type SettingsPageContentProps = {
  activeTab: SettingsTab;
  onActiveTabChange: (tab: SettingsTab) => void;
  snapshot: AppSettings;
  supportsLocalServiceControl: boolean;
  isDesktopRuntime: boolean;
  listenState: {
    effectiveBindAddr: string;
    restartRequired: boolean;
    savedBindAddr: string;
  };
  general: {
    canDownloadUpdate: boolean;
    hasPreparedUpdate: boolean;
    isApplyingPreparedUpdate: boolean;
    isPreparingUpdate: boolean;
    isRestartingService: boolean;
    lastUpdateCheck: UpdateCheckSummary | null;
    manualUpdateCheckPending: boolean;
    onCloseToTrayChange: (value: boolean) => void;
    onLowTransparencyChange: (value: boolean) => void;
    onOpenUpdateLogsDir: () => void;
    onRestartService: () => void;
    onServiceListenModeChange: (value: string) => void;
    onUpdateAction: () => void;
    onUpdateAutoCheckChange: (value: boolean) => void;
    preparedUpdate: UpdatePrepareSummary | null;
    shouldShowUpdateLogsEntry: boolean;
    updateActionBusy: boolean;
    updateActionBusyLabel: string;
    updateActionDescription: string;
    updateActionLabel: string;
  };
  appearance: {
    theme: string | undefined;
    onAppearancePresetChange: (value: string) => void;
    onThemeChange: (value: string) => void;
  };
  gateway: {
    effectiveFreeAccountPreferredModels: string[];
    freeAccountPreferredModelOptions: string[];
    gatewayOriginatorInput: string;
    gatewayUserAgentVersionInput: string;
    onApplyUpstreamProxyQuickFill: (value: string) => void;
    onFreeAccountMaxModelChange: (value: string) => void;
    onGatewayOriginatorBlur: () => void;
    onGatewayOriginatorInputChange: (value: string) => void;
    onGatewayResidencyRequirementChange: (value: string) => void;
    onGatewayUserAgentVersionBlur: () => void;
    onGatewayUserAgentVersionInputChange: (value: string) => void;
    onRequestCompressionEnabledChange: (value: boolean) => void;
    onRouteStrategyChange: (value: string) => void;
    onSaveTransportField: (
      key: "sseKeepaliveIntervalMs" | "upstreamStreamTimeoutMs",
      minimum: number,
    ) => void;
    onSetFreeAccountPreferredModels: (models: string[]) => void;
    onToggleFreeAccountPreferredModel: (value: string) => void;
    onTransportDraftChange: (
      key: "sseKeepaliveIntervalMs" | "upstreamStreamTimeoutMs",
      value: string,
    ) => void;
    onUpstreamProxyBlur: () => void;
    onUpstreamProxyInputChange: (value: string) => void;
    onUpstreamProxyQuickFillOpenChange: (open: boolean) => void;
    transportInputValues: {
      sseKeepaliveIntervalMs: string;
      upstreamStreamTimeoutMs: string;
    };
    upstreamProxyInput: string;
    upstreamProxyQuickFillOpen: boolean;
  };
  tasks: {
    backgroundTaskDraft: Record<string, string>;
    onBackgroundTaskDraftChange: (key: string, value: string) => void;
    onSaveBackgroundTaskField: (
      key: keyof BackgroundTaskSettings,
      minimum: number,
    ) => void;
    onUpdateBackgroundTasks: (
      patch: Partial<BackgroundTaskSettings>,
    ) => void;
  };
  env: {
    envSearch: string;
    filteredEnvCatalog: Array<{
      defaultValue?: string;
      key: string;
      label: string;
    }>;
    onEnvSearchChange: (value: string) => void;
    onResetEnv: () => void;
    onSaveEnv: () => void;
    onSelectedEnvKeyChange: (value: string) => void;
    onSelectedEnvValueChange: (value: string) => void;
    selectedEnvItem: { defaultValue?: string; label: string } | null;
    selectedEnvKey: string | null;
    selectedEnvValue: string;
  };
};

export function SettingsPageContent({
  activeTab,
  appearance,
  env,
  gateway,
  general,
  isDesktopRuntime,
  listenState,
  onActiveTabChange,
  snapshot,
  supportsLocalServiceControl,
  tasks,
}: SettingsPageContentProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">系统设置</h2>
        <p className="mt-1 text-sm text-muted-foreground">管理应用行为、网关策略及后台任务</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value && SETTINGS_TABS.includes(value as SettingsTab)) {
            onActiveTabChange(value as SettingsTab);
          }
        }}
        className="w-full"
      >
        <TabsList className="glass-card mb-6 flex h-11 w-full justify-start overflow-x-auto rounded-xl border-none p-1 no-scrollbar lg:w-fit">
          <TabsTrigger value="general" className="gap-2 px-5 shrink-0">
            <SettingsIcon className="h-4 w-4" /> 通用
          </TabsTrigger>
          <TabsTrigger value="appearance" className="gap-2 px-5 shrink-0">
            <Palette className="h-4 w-4" /> 外观
          </TabsTrigger>
          <TabsTrigger value="gateway" className="gap-2 px-5 shrink-0">
            <SettingsIcon className="h-4 w-4" /> 网关
          </TabsTrigger>
          <TabsTrigger value="tasks" className="gap-2 px-5 shrink-0">
            <Cpu className="h-4 w-4" /> 任务
          </TabsTrigger>
          <TabsTrigger value="env" className="gap-2 px-5 shrink-0">
            <Variable className="h-4 w-4" /> 环境
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <SettingsGeneralTab
            canDownloadUpdate={general.canDownloadUpdate}
            hasPreparedUpdate={general.hasPreparedUpdate}
            isApplyingPreparedUpdate={general.isApplyingPreparedUpdate}
            isDesktopRuntime={isDesktopRuntime}
            isPreparingUpdate={general.isPreparingUpdate}
            isRestartingService={general.isRestartingService}
            lastUpdateCheck={general.lastUpdateCheck}
            listenState={listenState}
            manualUpdateCheckPending={general.manualUpdateCheckPending}
            onCloseToTrayChange={general.onCloseToTrayChange}
            onLowTransparencyChange={general.onLowTransparencyChange}
            onOpenUpdateLogsDir={general.onOpenUpdateLogsDir}
            onRestartService={general.onRestartService}
            onServiceListenModeChange={general.onServiceListenModeChange}
            onUpdateAction={general.onUpdateAction}
            onUpdateAutoCheckChange={general.onUpdateAutoCheckChange}
            preparedUpdate={general.preparedUpdate}
            shouldShowUpdateLogsEntry={general.shouldShowUpdateLogsEntry}
            snapshot={snapshot}
            supportsLocalServiceControl={supportsLocalServiceControl}
            updateActionBusy={general.updateActionBusy}
            updateActionBusyLabel={general.updateActionBusyLabel}
            updateActionDescription={general.updateActionDescription}
            updateActionLabel={general.updateActionLabel}
          />
        </TabsContent>

        <TabsContent value="appearance" className="space-y-6">
          <Card className="glass-card border-none shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">样式版本</CardTitle>
              </div>
              <CardDescription>在渐变版本和默认版本之间切换</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {APPEARANCE_PRESETS.map((item) => {
                  const currentPreset = normalizeAppearancePreset(snapshot.appearancePreset);
                  const isActive = currentPreset === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => appearance.onAppearancePresetChange(item.id)}
                      className={cn(
                        "group relative rounded-2xl border p-4 text-left transition-all duration-300 hover:-translate-y-0.5",
                        isActive
                          ? "border-primary bg-primary/10 shadow-lg ring-1 ring-primary"
                          : "border-border/60 bg-background/50 hover:bg-accent/30",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1.5">
                          <div className="text-sm font-semibold">{item.name}</div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {item.description}
                          </p>
                        </div>
                        {isActive ? (
                          <div className="rounded-full bg-primary p-1 text-primary-foreground shadow-sm">
                            <Check className="h-3 w-3" />
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-end gap-2.5">
                        <div
                          className={cn(
                            "settings-preset-preview h-14 flex-1 rounded-xl border",
                            item.id === "modern"
                              ? "border-primary/20 bg-[linear-gradient(160deg,rgba(255,255,255,0.88),rgba(37,99,235,0.1)),linear-gradient(180deg,rgba(191,219,254,0.6),rgba(255,255,255,0.85))]"
                              : "border-slate-300/70 bg-[radial-gradient(at_0%_0%,#bfdbfe_0px,transparent_50%),radial-gradient(at_100%_0%,#cffafe_0px,transparent_50%),radial-gradient(at_50%_100%,#ffffff_0px,transparent_50%),rgba(255,255,255,0.86)]",
                          )}
                        />
                        <div className="flex w-16 flex-col gap-1.5">
                          <div
                            className={cn(
                              "settings-preset-preview-tile h-4 rounded-lg border",
                              item.id === "modern"
                                ? "border-primary/15 bg-white/80 shadow-sm"
                                : "border-slate-300/70 bg-white/70",
                            )}
                          />
                          <div
                            className={cn(
                              "settings-preset-preview-tile h-4 rounded-lg border",
                              item.id === "modern"
                                ? "border-primary/15 bg-white/70 shadow-sm"
                                : "border-slate-300/70 bg-white/60",
                            )}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-card border-none shadow-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">界面主题</CardTitle>
              </div>
              <CardDescription>选择您喜爱的配色方案，适配不同工作心情</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
                {THEMES.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => appearance.onThemeChange(item.id)}
                    className={cn(
                      "group relative flex flex-col items-center gap-2.5 rounded-2xl border p-4 transition-all duration-300 hover:scale-105",
                      appearance.theme === item.id
                        ? "border-primary bg-primary/10 shadow-lg ring-1 ring-primary"
                        : "border-transparent bg-muted/20 hover:bg-accent/40",
                    )}
                  >
                    <div
                      className="h-10 w-10 rounded-full border-2 border-white/20 shadow-md"
                      style={{ backgroundColor: item.color }}
                    />
                    <span
                      className={cn(
                        "whitespace-nowrap text-[10px] font-semibold transition-colors",
                        appearance.theme === item.id
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground",
                      )}
                    >
                      {item.name}
                    </span>
                    {appearance.theme === item.id ? (
                      <div className="absolute right-2 top-2 rounded-full bg-primary p-0.5 text-primary-foreground shadow-sm">
                        <Check className="h-2.5 w-2.5" />
                      </div>
                    ) : null}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gateway" className="space-y-4">
          <Card className="glass-card border-none shadow-md">
            <CardHeader>
              <CardTitle className="text-base">网关策略</CardTitle>
              <CardDescription>配置账号选路和请求头处理方式</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-2">
                <Label>账号选路策略</Label>
                <Select
                  value={snapshot.routeStrategy || "ordered"}
                  onValueChange={(value) => gateway.onRouteStrategyChange(value || "ordered")}
                >
                  <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="选择策略">
                      {(value) => {
                        const nextValue = String(value || "").trim();
                        if (!nextValue) return "选择策略";
                        return ROUTE_STRATEGY_LABELS[nextValue] || nextValue;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ordered">顺序优先 (Ordered)</SelectItem>
                    <SelectItem value="balanced">均衡轮询 (Balanced)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  顺序优先：按账号候选顺序优先尝试，默认只会在头部小窗口内按健康度做轻微换头；
                  均衡轮询：按“平台密钥 + 模型”维度严格轮询可用账号，默认不做健康度换头。
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Free 账号使用模型</Label>
                <Select
                  value={snapshot.freeAccountMaxModel || "auto"}
                  onValueChange={(value) => gateway.onFreeAccountMaxModelChange(value || "auto")}
                >
                  <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="选择 free 账号使用模型">
                      {(value) => formatFreeAccountModelLabel(String(value || ""))}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(snapshot.freeAccountMaxModelOptions?.length
                      ? snapshot.freeAccountMaxModelOptions
                      : DEFAULT_FREE_ACCOUNT_MAX_MODEL_OPTIONS
                    ).map((model) => (
                      <SelectItem key={model} value={model}>
                        {formatFreeAccountModelLabel(model)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  设为“跟随请求”时，不会额外改写 free / 7天单窗口账号的模型；
                  只有你选了具体模型后，命中这些账号时才会统一改写为该模型。
                </p>
              </div>

              <div className="grid gap-3 rounded-xl border border-border/60 bg-accent/15 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <Label>对于这些模型，总是优先请求 Free 账号</Label>
                    <p className="text-[10px] text-muted-foreground">
                      命中选中模型时，会先尝试仍可参与路由的 Free 账号；若没有可用 Free 账号，再回退到其他账号。
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => gateway.onSetFreeAccountPreferredModels([])}
                    >
                      无
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => gateway.onSetFreeAccountPreferredModels(gateway.freeAccountPreferredModelOptions)}
                    >
                      全部
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {gateway.freeAccountPreferredModelOptions.map((model) => {
                    const selected = gateway.effectiveFreeAccountPreferredModels.includes(model);
                    return (
                      <button
                        key={model}
                        type="button"
                        onClick={() => gateway.onToggleFreeAccountPreferredModel(model)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/70 bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {model}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-between border-t pt-6">
                <div className="space-y-0.5">
                  <Label>请求体压缩</Label>
                  <p className="text-xs text-muted-foreground">
                    对齐官方 Codex：流式 <code>/responses</code> 请求发往 ChatGPT Codex backend 时，默认使用
                    <code>zstd</code> 压缩请求体。
                  </p>
                </div>
                <Switch
                  checked={snapshot.requestCompressionEnabled}
                  onCheckedChange={gateway.onRequestCompressionEnabledChange}
                />
              </div>

              <div className="grid gap-2 border-t pt-6">
                <Label>Originator</Label>
                <Input
                  className="h-10 max-w-md font-mono"
                  value={gateway.gatewayOriginatorInput}
                  onChange={(event) => gateway.onGatewayOriginatorInputChange(event.target.value)}
                  onBlur={gateway.onGatewayOriginatorBlur}
                />
                <p className="text-[10px] text-muted-foreground">
                  对齐官方 Codex 的上游 Originator。默认值为 <code>codex_cli_rs</code>，会同步影响登录和网关上游请求头。
                </p>
              </div>

              <div className="grid gap-2">
                <Label>User-Agent 版本</Label>
                <Input
                  className="h-10 max-w-md font-mono"
                  value={gateway.gatewayUserAgentVersionInput}
                  onChange={(event) => gateway.onGatewayUserAgentVersionInputChange(event.target.value)}
                  onBlur={gateway.onGatewayUserAgentVersionBlur}
                />
                <p className="text-[10px] text-muted-foreground">
                  控制真实出站 <code>User-Agent</code> 里的版本号，默认值为 <code>{DEFAULT_GATEWAY_USER_AGENT_VERSION}</code>。
                  官方 Codex 升级后，可以在这里手动同步。
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Residency Requirement</Label>
                <Select
                  value={(snapshot.gatewayResidencyRequirement ?? "") || EMPTY_RESIDENCY_OPTION}
                  onValueChange={(value) =>
                    gateway.onGatewayResidencyRequirementChange(value ?? EMPTY_RESIDENCY_OPTION)
                  }
                >
                  <SelectTrigger className="w-full md:w-[300px]">
                    <SelectValue placeholder="选择地域约束">
                      {(value) => {
                        const nextValue = String(value || "") === EMPTY_RESIDENCY_OPTION ? "" : String(value || "");
                        return RESIDENCY_REQUIREMENT_LABELS[nextValue] || nextValue;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {(snapshot.gatewayResidencyRequirementOptions?.length
                      ? snapshot.gatewayResidencyRequirementOptions
                      : ["", "us"]
                    ).map((value) => (
                      <SelectItem key={value || EMPTY_RESIDENCY_OPTION} value={value || EMPTY_RESIDENCY_OPTION}>
                        {RESIDENCY_REQUIREMENT_LABELS[value] || value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  对齐官方 Codex 的 <code>x-openai-internal-codex-residency</code> 头。
                  当前只支持留空或 <code>us</code>。
                </p>
              </div>

              <div className="grid gap-2 pt-2">
                <Label>上游代理 (Proxy)</Label>
                <div className="relative max-w-md">
                  <Input
                    placeholder="socks5://127.0.0.1:10808"
                    className="h-10 font-mono"
                    value={gateway.upstreamProxyInput}
                    onChange={(event) => gateway.onUpstreamProxyInputChange(event.target.value)}
                    onFocus={() => gateway.onUpstreamProxyQuickFillOpenChange(true)}
                    onClick={() => gateway.onUpstreamProxyQuickFillOpenChange(true)}
                    onBlur={() => {
                      gateway.onUpstreamProxyQuickFillOpenChange(false);
                      gateway.onUpstreamProxyBlur();
                    }}
                  />
                  {gateway.upstreamProxyQuickFillOpen ? (
                    <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border border-border/70 bg-popover p-2 shadow-lg">
                      <p className="px-2 pb-1 text-[10px] text-muted-foreground">快速填入</p>
                      {UPSTREAM_PROXY_QUICK_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            gateway.onApplyUpstreamProxyQuickFill(option.value);
                          }}
                        >
                          <span className="font-mono text-xs">{option.label}</span>
                          <span className="text-[10px] text-muted-foreground">{option.hint}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <p className="text-[10px] text-muted-foreground">支持 http/https/socks5，留空表示直连。</p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-6">
                <div className="grid gap-2">
                  <Label>SSE 保活间隔 (ms)</Label>
                  <Input
                    type="number"
                    value={gateway.transportInputValues.sseKeepaliveIntervalMs}
                    onChange={(event) => gateway.onTransportDraftChange("sseKeepaliveIntervalMs", event.target.value)}
                    onBlur={() => gateway.onSaveTransportField("sseKeepaliveIntervalMs", 1)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>上游流式超时 (ms)</Label>
                  <Input
                    type="number"
                    value={gateway.transportInputValues.upstreamStreamTimeoutMs}
                    onChange={(event) => gateway.onTransportDraftChange("upstreamStreamTimeoutMs", event.target.value)}
                    onBlur={() => gateway.onSaveTransportField("upstreamStreamTimeoutMs", 0)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <Card className="glass-card border-none shadow-md">
            <CardHeader>
              <CardTitle className="text-base">后台任务线程</CardTitle>
              <CardDescription>管理自动轮询和保活任务；用量轮询会跳过手动禁用账号</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {[
                {
                  label: "用量轮询线程",
                  enabledKey: "usagePollingEnabled",
                  intervalKey: "usagePollIntervalSecs",
                },
                {
                  label: "网关保活线程",
                  enabledKey: "gatewayKeepaliveEnabled",
                  intervalKey: "gatewayKeepaliveIntervalSecs",
                },
                {
                  label: "令牌刷新轮询",
                  enabledKey: "tokenRefreshPollingEnabled",
                  intervalKey: "tokenRefreshPollIntervalSecs",
                },
              ].map((task) => (
                <div
                  key={task.enabledKey}
                  className="flex items-center justify-between gap-4 rounded-lg bg-accent/20 p-3"
                >
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={snapshot.backgroundTasks[task.enabledKey as keyof BackgroundTaskSettings] as boolean}
                      onCheckedChange={(value) =>
                        tasks.onUpdateBackgroundTasks({
                          [task.enabledKey]: value,
                        } as Partial<BackgroundTaskSettings>)
                      }
                    />
                    <Label>{task.label}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">间隔(秒)</span>
                    <Input
                      className="h-8 w-20"
                      type="number"
                      value={
                        tasks.backgroundTaskDraft[task.intervalKey] ||
                        stringifyNumber(
                          snapshot.backgroundTasks[task.intervalKey as keyof BackgroundTaskSettings] as number,
                        )
                      }
                      onChange={(event) =>
                        tasks.onBackgroundTaskDraftChange(task.intervalKey, event.target.value)
                      }
                      onBlur={() =>
                        tasks.onSaveBackgroundTaskField(task.intervalKey as keyof BackgroundTaskSettings, 1)
                      }
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-card border-none shadow-md">
            <CardHeader>
              <CardTitle className="text-base">Worker 并发参数</CardTitle>
              <CardDescription>调整执行单元并发规模；用量刷新并发会直接影响手动刷新和后台轮询</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {[
                { label: "用量刷新并发", key: "usageRefreshWorkers" },
                { label: "HTTP 因子", key: "httpWorkerFactor" },
                { label: "HTTP 最小并发", key: "httpWorkerMin" },
                { label: "流式因子", key: "httpStreamWorkerFactor" },
                { label: "流式最小并发", key: "httpStreamWorkerMin" },
              ].map((worker) => (
                <div key={worker.key} className="grid gap-1.5">
                  <Label className="text-xs">{worker.label}</Label>
                  <Input
                    type="number"
                    className="h-9"
                    value={
                      tasks.backgroundTaskDraft[worker.key] ||
                      stringifyNumber(
                        snapshot.backgroundTasks[worker.key as keyof BackgroundTaskSettings] as number,
                      )
                    }
                    onChange={(event) => tasks.onBackgroundTaskDraftChange(worker.key, event.target.value)}
                    onBlur={() =>
                      tasks.onSaveBackgroundTaskField(worker.key as keyof BackgroundTaskSettings, 1)
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="env" className="space-y-4">
          <div className="grid gap-6 md:grid-cols-[300px_1fr]">
            <Card className="glass-card flex h-[500px] flex-col border-none shadow-md">
              <CardHeader className="pb-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索变量..."
                    className="h-9 pl-9"
                    value={env.envSearch}
                    onChange={(event) => env.onEnvSearchChange(event.target.value)}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                  {env.filteredEnvCatalog.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => env.onSelectedEnvKeyChange(item.key)}
                      className={cn(
                        "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                        env.selectedEnvKey === item.key
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent",
                      )}
                    >
                      <div className="truncate font-medium">{item.label}</div>
                      <code className="block truncate text-[10px] opacity-70">{item.key}</code>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card min-h-[500px] border-none shadow-md">
              {env.selectedEnvKey ? (
                <>
                  <CardHeader>
                    <div className="flex flex-col gap-1">
                      <CardTitle className="text-lg">{env.selectedEnvItem?.label}</CardTitle>
                      <code className="w-fit rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {env.selectedEnvKey}
                      </code>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="rounded-lg border bg-accent/30 p-4 text-sm leading-relaxed text-muted-foreground">
                      <Info className="mr-2 inline-block h-4 w-4 text-primary" />
                      {ENV_DESCRIPTION_MAP[env.selectedEnvKey] ||
                        `${env.selectedEnvItem?.label} 对应环境变量，修改后会应用到相关模块。`}
                    </div>

                    <div className="space-y-2">
                      <Label>当前值</Label>
                      <Input
                        value={env.selectedEnvValue}
                        onChange={(event) => env.onSelectedEnvValueChange(event.target.value)}
                        className="h-11 font-mono"
                        placeholder="输入变量值"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        默认值: <span className="font-mono italic">{env.selectedEnvItem?.defaultValue || "空"}</span>
                      </p>
                    </div>

                    <div className="flex gap-3 border-t pt-4">
                      <Button onClick={env.onSaveEnv} className="gap-2">
                        <Save className="h-4 w-4" /> 保存修改
                      </Button>
                      <Button variant="outline" onClick={env.onResetEnv} className="gap-2">
                        <RotateCcw className="h-4 w-4" /> 恢复默认
                      </Button>
                    </div>
                  </CardContent>
                </>
              ) : (
                <CardContent className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
                  <div className="rounded-full bg-accent/30 p-4">
                    <Variable className="h-12 w-12 opacity-20" />
                  </div>
                  <p>请从左侧列表选择一个环境变量进行配置</p>
                </CardContent>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}