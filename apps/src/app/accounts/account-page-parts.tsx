import {
  Download,
  FileUp,
  FolderOpen,
  MoreVertical,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatTsFromSeconds } from "@/lib/utils/usage";
import { Account } from "@/types";

export type StatusFilter = "all" | "available" | "low_quota" | "banned";

export type AccountSortDialogState = {
  accountId: string;
  accountName: string;
  currentSort: number;
} | null;

export function formatAccountPlanLabel(account: Account): string | null {
  const rawValue = String(account.planType || account.planTypeRaw || "").trim();
  if (!rawValue) {
    return null;
  }

  switch (rawValue.toLowerCase()) {
    case "free":
      return "Free";
    case "go":
      return "Go";
    case "plus":
      return "Plus";
    case "pro":
      return "Pro";
    case "team":
      return "Team";
    case "business":
      return "Business";
    case "enterprise":
      return "Enterprise";
    case "edu":
      return "Edu";
    case "unknown":
      return account.planTypeRaw || "Unknown";
    default:
      return account.planTypeRaw || rawValue;
  }
}

export function QuotaProgress({
  label,
  remainPercent,
  resetsAt,
  icon: Icon,
  tone,
  emptyText = "--",
  emptyResetText = "未知",
}: {
  label: string;
  remainPercent: number | null;
  resetsAt: number | null;
  icon: LucideIcon;
  tone: "green" | "blue";
  emptyText?: string;
  emptyResetText?: string;
}) {
  const value = remainPercent ?? 0;
  const trackClassName = tone === "blue" ? "bg-blue-500/20" : "bg-green-500/20";
  const indicatorClassName = tone === "blue" ? "bg-blue-500" : "bg-green-500";

  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <div className="flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </div>
        <span className="font-medium">
          {remainPercent == null ? emptyText : `${value}%`}
        </span>
      </div>
      <Progress
        value={value}
        trackClassName={trackClassName}
        indicatorClassName={indicatorClassName}
      />
      <div className="text-[10px] text-muted-foreground">
        重置: {formatTsFromSeconds(resetsAt, emptyResetText)}
      </div>
    </div>
  );
}

export function getAccountStatusAction(account: Account): {
  enable: boolean;
  label: string;
  icon: LucideIcon;
} {
  const normalizedStatus = String(account.status || "")
    .trim()
    .toLowerCase();
  if (normalizedStatus === "disabled") {
    return { enable: true, label: "启用账号", icon: Power };
  }
  if (normalizedStatus === "inactive") {
    return { enable: true, label: "恢复账号", icon: Power };
  }
  return { enable: false, label: "禁用账号", icon: PowerOff };
}

function formatGroupFilterLabel(value: string) {
  const nextValue = String(value || "").trim();
  if (!nextValue || nextValue === "all") {
    return "全部分组";
  }
  return nextValue;
}

function formatStatusFilterLabel(value: string) {
  const nextValue = String(value || "").trim();
  switch (nextValue) {
    case "available":
      return "可用";
    case "low_quota":
      return "低配额";
    case "banned":
      return "封禁";
    case "all":
    default:
      return "全部";
  }
}

export function AccountsToolbar({
  accountsCount,
  effectiveSelectedCount,
  groupFilter,
  groups,
  isDeletingMany,
  isExporting,
  isRefreshingAllAccounts,
  onDeleteBanned,
  onDeleteSelected,
  onDeleteUnavailableFree,
  onExportAccounts,
  onGroupFilterChange,
  onImportByDirectory,
  onImportByFile,
  onOpenAddAccount,
  onRefreshAllAccounts,
  onSearchChange,
  onStatusFilterChange,
  search,
  statusFilter,
  statusFilterOptions,
}: {
  accountsCount: number;
  effectiveSelectedCount: number;
  groupFilter: string;
  groups: Array<{ label: string; count: number }>;
  isDeletingMany: boolean;
  isExporting: boolean;
  isRefreshingAllAccounts: boolean;
  onDeleteBanned: () => void;
  onDeleteSelected: () => void;
  onDeleteUnavailableFree: () => void;
  onExportAccounts: () => void;
  onGroupFilterChange: (value: string) => void;
  onImportByDirectory: () => void;
  onImportByFile: () => void;
  onOpenAddAccount: () => void;
  onRefreshAllAccounts: () => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
  search: string;
  statusFilter: StatusFilter;
  statusFilterOptions: Array<{ id: StatusFilter; label: string }>;
}) {
  return (
    <Card className="glass-card border-none shadow-md backdrop-blur-md">
      <CardContent className="grid gap-3 pt-0 lg:grid-cols-[200px_auto_minmax(0,1fr)_auto] lg:items-center">
        <div className="min-w-0">
          <Input
            placeholder="搜索账号名 / 编号..."
            className="glass-card h-10 rounded-xl px-3"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Select value={groupFilter} onValueChange={(value) => onGroupFilterChange(value || "all")}>
            <SelectTrigger className="h-10 w-[140px] shrink-0 rounded-xl bg-card/50">
              <SelectValue placeholder="全部分组">
                {(value) => formatGroupFilterLabel(String(value || ""))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部分组 ({accountsCount})</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.label} value={group.label}>
                  {group.label} ({group.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              onStatusFilterChange((value || "all") as StatusFilter)
            }
          >
            <SelectTrigger className="h-10 w-[152px] shrink-0 rounded-xl bg-card/50">
              <SelectValue placeholder="全部状态">
                {(value) => formatStatusFilterLabel(String(value || ""))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {statusFilterOptions.map((filter) => (
                <SelectItem key={filter.id} value={filter.id}>
                  {filter.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="hidden min-w-0 lg:block" />

        <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0 lg:justify-self-end">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                variant="outline"
                className="glass-card h-10 min-w-[50px] justify-between gap-2 rounded-xl px-3"
                render={<span />}
                nativeButton={false}
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium">账号操作</span>
                  {effectiveSelectedCount > 0 ? (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      {effectiveSelectedCount}
                    </span>
                  ) : null}
                </span>
                <MoreVertical className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-64 rounded-xl border border-border/70 bg-popover/95 p-2 shadow-xl backdrop-blur-md"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80">
                  账号管理
                </DropdownMenuLabel>
                <DropdownMenuItem className="h-9 rounded-lg px-2" onClick={onOpenAddAccount}>
                  <Plus className="mr-2 h-4 w-4" /> 添加账号
                </DropdownMenuItem>
                <DropdownMenuItem className="h-9 rounded-lg px-2" onClick={onImportByFile}>
                  <FileUp className="mr-2 h-4 w-4" /> 按文件导入
                  <DropdownMenuShortcut>FILE</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem className="h-9 rounded-lg px-2" onClick={onImportByDirectory}>
                  <FolderOpen className="mr-2 h-4 w-4" /> 按文件夹导入
                  <DropdownMenuShortcut>DIR</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem className="h-9 rounded-lg px-2" disabled={isExporting} onClick={onExportAccounts}>
                  <Download className="mr-2 h-4 w-4" /> 导出账号
                  <DropdownMenuShortcut>{isExporting ? "..." : "ZIP"}</DropdownMenuShortcut>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="px-2 py-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80">
                  清理
                </DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={!effectiveSelectedCount || isDeletingMany}
                  variant="destructive"
                  className="h-9 rounded-lg px-2"
                  onClick={onDeleteSelected}
                >
                  <Trash2 className="mr-2 h-4 w-4" /> 删除选中账号
                  <DropdownMenuShortcut>{effectiveSelectedCount || "-"}</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" className="h-9 rounded-lg px-2" onClick={onDeleteUnavailableFree}>
                  <Trash2 className="mr-2 h-4 w-4" /> 一键清理不可用免费
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" className="h-9 rounded-lg px-2" onClick={onDeleteBanned}>
                  <Trash2 className="mr-2 h-4 w-4" /> 一键清理封禁账号
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            className="h-10 w-30 gap-1 rounded-xl shadow-lg shadow-primary/20"
            onClick={onRefreshAllAccounts}
            disabled={isRefreshingAllAccounts}
          >
            <RefreshCw
              className={cn(
                "h-4 w-1",
                isRefreshingAllAccounts && "animate-spin",
              )}
            />
            刷新账号用量
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function AccountSortDialog({
  isUpdatingSortAccountId,
  onClose,
  onConfirm,
  onSortDraftChange,
  sortDialogState,
  sortDraft,
}: {
  isUpdatingSortAccountId: string | null;
  onClose: () => void;
  onConfirm: () => void;
  onSortDraftChange: (value: string) => void;
  sortDialogState: AccountSortDialogState;
  sortDraft: string;
}) {
  return (
    <Dialog
      open={Boolean(sortDialogState)}
      onOpenChange={(open) => {
        if (!open && !isUpdatingSortAccountId) {
          onClose();
        }
      }}
    >
      <DialogContent className="glass-card border-none sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>编辑账号顺序</DialogTitle>
          <DialogDescription>
            {sortDialogState
              ? `修改 ${sortDialogState.accountName} 的排序值。值越小越靠前。`
              : "修改账号的排序值。"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="account-sort-input">顺序值</Label>
          <Input
            id="account-sort-input"
            type="number"
            min={0}
            step={1}
            value={sortDraft}
            disabled={Boolean(isUpdatingSortAccountId)}
            onChange={(event) => onSortDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onConfirm();
              }
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            仅修改当前账号的排序值，不会自动重排其它账号。
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" disabled={Boolean(isUpdatingSortAccountId)} onClick={onClose}>
            取消
          </Button>
          <Button disabled={Boolean(isUpdatingSortAccountId)} onClick={onConfirm}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}