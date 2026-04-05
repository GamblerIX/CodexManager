import { Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UpdateCheckSummary, UpdatePrepareSummary } from "./settings-page-utils";

type SettingsUpdateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preparedUpdate: UpdatePrepareSummary | null;
  updateCheck: UpdateCheckSummary | null;
  isPreparingUpdate: boolean;
  isApplyingPreparedUpdate: boolean;
  onPrepareUpdate: () => void;
  onApplyPreparedUpdate: (payload: { isPortable: boolean }) => void;
  onOpenReleasePage: () => void;
};

export function SettingsUpdateDialog({
  isApplyingPreparedUpdate,
  isPreparingUpdate,
  onApplyPreparedUpdate,
  onOpenChange,
  onOpenReleasePage,
  onPrepareUpdate,
  open,
  preparedUpdate,
  updateCheck,
}: SettingsUpdateDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isPreparingUpdate || isApplyingPreparedUpdate) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="glass-card border-none p-6 sm:max-w-[480px]"
      >
        <DialogHeader>
          <DialogTitle>{preparedUpdate ? "替换更新" : "发现新版本"}</DialogTitle>
          <DialogDescription>
            {preparedUpdate
              ? preparedUpdate.isPortable
                ? "更新包已下载完成。确认后将重启应用并替换当前程序。"
                : "更新包已下载完成。确认后会开始替换流程。"
              : `当前版本 ${updateCheck?.currentVersion || "未知"}，发现新版本 ${
                  updateCheck?.latestVersion || updateCheck?.releaseTag || "可用"
                }。`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-2xl border border-border/50 bg-background/45 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">当前版本</span>
              <span className="font-medium">{updateCheck?.currentVersion || "未知"}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="text-muted-foreground">目标版本</span>
              <span className="font-medium">
                {preparedUpdate?.latestVersion ||
                  updateCheck?.latestVersion ||
                  updateCheck?.releaseTag ||
                  "未知"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-4">
              <span className="text-muted-foreground">更新模式</span>
              <span className="font-medium">
                {(preparedUpdate?.isPortable ?? updateCheck?.isPortable)
                  ? "便携包更新"
                  : "安装包更新"}
              </span>
            </div>
            {preparedUpdate?.assetName ? (
              <div className="mt-2 flex items-center justify-between gap-4">
                <span className="text-muted-foreground">更新文件</span>
                <span className="max-w-[240px] truncate font-mono text-xs">
                  {preparedUpdate.assetName}
                </span>
              </div>
            ) : null}
          </div>

          {preparedUpdate ? null : updateCheck?.reason ? (
            <div className="rounded-2xl border border-border/50 bg-muted/40 p-4 text-xs leading-5 text-muted-foreground">
              {updateCheck.reason}
            </div>
          ) : (
            <div className="rounded-2xl border border-border/50 bg-muted/40 p-4 text-xs leading-5 text-muted-foreground">
              建议先下载更新包，下载完成后再执行安装或重启更新。
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            disabled={isPreparingUpdate || isApplyingPreparedUpdate}
            onClick={() => onOpenChange(false)}
          >
            稍后
          </Button>
          {preparedUpdate ? (
            <Button
              className="gap-2"
              disabled={isApplyingPreparedUpdate}
              onClick={() => onApplyPreparedUpdate({ isPortable: preparedUpdate.isPortable })}
            >
              <Download className="h-4 w-4" />
              {isApplyingPreparedUpdate
                ? preparedUpdate.isPortable
                  ? "正在替换更新..."
                  : "正在启动替换..."
                : "替换更新"}
            </Button>
          ) : updateCheck?.canPrepare ? (
            <Button className="gap-2" disabled={isPreparingUpdate} onClick={onPrepareUpdate}>
              <Download className="h-4 w-4" />
              {isPreparingUpdate ? "正在下载更新..." : "下载更新"}
            </Button>
          ) : (
            <Button className="gap-2" onClick={onOpenReleasePage}>
              <ExternalLink className="h-4 w-4" />
              打开发布页
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}