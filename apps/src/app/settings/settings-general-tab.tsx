import {
  AppWindow,
  Check,
  Download,
  FolderOpen,
  Globe,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { AppSettings } from "@/types";
import {
  SERVICE_LISTEN_MODE_LABELS,
  type UpdateCheckSummary,
  type UpdatePrepareSummary,
} from "./settings-page-utils";

type ListenState = {
  effectiveBindAddr: string;
  restartRequired: boolean;
  savedBindAddr: string;
};

export function SettingsGeneralTab({
  canDownloadUpdate,
  hasPreparedUpdate,
  isApplyingPreparedUpdate,
  isDesktopRuntime,
  isPreparingUpdate,
  isRestartingService,
  lastUpdateCheck,
  listenState,
  manualUpdateCheckPending,
  onCloseToTrayChange,
  onLowTransparencyChange,
  onOpenUpdateLogsDir,
  onRestartService,
  onServiceListenModeChange,
  onUpdateAction,
  onUpdateAutoCheckChange,
  preparedUpdate,
  shouldShowUpdateLogsEntry,
  snapshot,
  supportsLocalServiceControl,
  updateActionBusy,
  updateActionBusyLabel,
  updateActionDescription,
  updateActionLabel,
}: {
  canDownloadUpdate: boolean;
  hasPreparedUpdate: boolean;
  isApplyingPreparedUpdate: boolean;
  isDesktopRuntime: boolean;
  isPreparingUpdate: boolean;
  isRestartingService: boolean;
  lastUpdateCheck: UpdateCheckSummary | null;
  listenState: ListenState;
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
  snapshot: AppSettings;
  supportsLocalServiceControl: boolean;
  updateActionBusy: boolean;
  updateActionBusyLabel: string;
  updateActionDescription: string;
  updateActionLabel: string;
}) {
  return (
    <>
      <Card className="glass-card border-none shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AppWindow className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">基础设置</CardTitle>
          </div>
          <CardDescription>控制应用启动和窗口行为</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>自动检查更新</Label>
              <p className="text-xs text-muted-foreground">启动时自动检测新版本</p>
            </div>
            <Switch
              checked={snapshot.updateAutoCheck}
              onCheckedChange={onUpdateAutoCheckChange}
            />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/45 p-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <Label>{updateActionLabel}</Label>
              <p className="text-xs text-muted-foreground">{updateActionDescription}</p>
              {lastUpdateCheck ? (
                <p className="text-xs text-muted-foreground">
                  {preparedUpdate
                    ? `已下载 ${preparedUpdate.latestVersion || preparedUpdate.releaseTag || "新版本"}，等待替换更新`
                    : lastUpdateCheck.hasUpdate
                      ? `发现新版本 ${lastUpdateCheck.latestVersion || lastUpdateCheck.releaseTag || "可用"}`
                      : lastUpdateCheck.reason ||
                        `当前版本 ${lastUpdateCheck.currentVersion || "未知"} 已是最新`}
                </p>
              ) : null}
              {shouldShowUpdateLogsEntry ? (
                <div className="pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onOpenUpdateLogsDir}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    打开日志目录
                  </Button>
                </div>
              ) : null}
            </div>
            <Button
              variant="outline"
              className="gap-2 self-start md:self-auto"
              disabled={!isDesktopRuntime || updateActionBusy}
              onClick={onUpdateAction}
            >
              {manualUpdateCheckPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : isPreparingUpdate ? (
                <Download className="h-4 w-4 animate-pulse" />
              ) : isApplyingPreparedUpdate ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : hasPreparedUpdate ? (
                <Check className="h-4 w-4" />
              ) : canDownloadUpdate ? (
                <Download className="h-4 w-4" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {updateActionBusyLabel}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>关闭时最小化到托盘</Label>
              <p className="text-xs text-muted-foreground">点击关闭按钮不会直接退出程序</p>
            </div>
            <Switch
              checked={snapshot.closeToTrayOnClose}
              disabled={!snapshot.closeToTraySupported}
              onCheckedChange={onCloseToTrayChange}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>视觉性能模式</Label>
              <p className="text-xs text-muted-foreground">关闭毛玻璃等特效以提升低配电脑性能</p>
            </div>
            <Switch
              checked={snapshot.lowTransparency}
              onCheckedChange={onLowTransparencyChange}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="glass-card border-none shadow-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">服务监听</CardTitle>
          </div>
          <CardDescription>控制服务仅本机访问，或开放给局域网中的其他设备访问</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-2">
            <Label>监听地址</Label>
            <Select
              value={snapshot.serviceListenModeEffective || snapshot.serviceListenMode || "loopback"}
              onValueChange={(value) => {
                const nextValue = String(value || "").trim() || "loopback";
                if (nextValue === snapshot.serviceListenMode) {
                  return;
                }
                onServiceListenModeChange(nextValue);
              }}
            >
              <SelectTrigger className="w-full md:w-[320px]">
                <SelectValue placeholder="选择监听地址模式">
                  {(value) =>
                    SERVICE_LISTEN_MODE_LABELS[String(value || "").trim()] ||
                    String(value || "").trim() ||
                    "仅本机 (localhost)"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(snapshot.serviceListenModeOptions?.length
                  ? snapshot.serviceListenModeOptions
                  : ["loopback", "all_interfaces"]
                ).map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {SERVICE_LISTEN_MODE_LABELS[mode] || mode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-2xl border border-border/50 bg-background/45 p-4 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">当前访问地址</span>
              <code className="text-xs text-primary">{snapshot.serviceAddr}</code>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="text-muted-foreground">已保存监听地址</span>
              <code className="text-xs text-primary">{listenState.savedBindAddr}</code>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="text-muted-foreground">当前生效监听地址</span>
              <code className="text-xs text-primary">{listenState.effectiveBindAddr}</code>
            </div>
          </div>

          {isDesktopRuntime && supportsLocalServiceControl && listenState.restartRequired ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-medium text-amber-700 dark:text-amber-300">监听地址变更已保存</p>
                  <p className="text-xs text-muted-foreground">
                    当前生效：<code>{listenState.effectiveBindAddr}</code>，重启后切换为 <code>{listenState.savedBindAddr}</code>
                  </p>
                </div>
                <Button className="gap-2" onClick={onRestartService} disabled={isRestartingService}>
                  <RefreshCw className={cn("h-4 w-4", isRestartingService && "animate-spin")} />
                  {isRestartingService ? "正在重启..." : "重启生效"}
                </Button>
              </div>
            </div>
          ) : null}

          <p className="text-[10px] text-muted-foreground">
            切换到 <code>0.0.0.0</code> 后，局域网设备可通过当前机器 IP 访问；
            设置保存后需要重启服务才会生效。
          </p>
        </CardContent>
      </Card>
    </>
  );
}