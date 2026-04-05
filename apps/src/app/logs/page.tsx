"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  Shield,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/modals/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeferredDesktopActivation } from "@/hooks/useDeferredDesktopActivation";
import { accountClient } from "@/lib/api/account-client";
import { ROOT_PAGE_LOGS } from "@/lib/routes/root-page-paths";
import { serviceClient } from "@/lib/api/service-client";
import { useAppStore } from "@/lib/store/useAppStore";
import { formatCompactNumber, formatTsFromSeconds } from "@/lib/utils/usage";
import { cn } from "@/lib/utils";
import { RequestLog } from "@/types";
import {
  AccountKeyInfoCell,
  ErrorInfoCell,
  formatDuration,
  getStatusBadge,
  ModelEffortCell,
  RequestRouteInfoCell,
  resolveAccountDisplayName,
  SummaryCard,
} from "./logs-table-parts";

type StatusFilter = "all" | "2xx" | "4xx" | "5xx";

function LogsPageSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-28 w-full rounded-3xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 w-full rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-[420px] w-full rounded-3xl" />
    </div>
  );
}

function LogsPageContent() {
  const searchParams = useSearchParams();
  const { serviceStatus } = useAppStore();
  const dataEnabled = useDeferredDesktopActivation(ROOT_PAGE_LOGS);
  const queryClient = useQueryClient();
  const [search, setSearch] = useState(() => searchParams.get("query") || "");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [pageSize, setPageSize] = useState("10");
  const [page, setPage] = useState(1);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const pageSizeNumber = Number(pageSize) || 10;

  const { data: accountsResult } = useQuery({
    queryKey: ["accounts", "lookup"],
    queryFn: () => accountClient.list(),
    enabled: serviceStatus.connected && dataEnabled,
    placeholderData: (previousData) => previousData,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: logsResult, isLoading } = useQuery({
    queryKey: ["logs", "list", search, filter, page, pageSizeNumber],
    queryFn: () =>
      serviceClient.listRequestLogs({
        query: search,
        statusFilter: filter,
        page,
        pageSize: pageSizeNumber,
      }),
    enabled: serviceStatus.connected && dataEnabled,
    refetchInterval: 5000,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const { data: summaryResult } = useQuery({
    queryKey: ["logs", "summary", search, filter],
    queryFn: () =>
      serviceClient.getRequestLogSummary({
        query: search,
        statusFilter: filter,
      }),
    enabled: serviceStatus.connected && dataEnabled,
    refetchInterval: 5000,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const clearMutation = useMutation({
    mutationFn: () => serviceClient.clearRequestLogs(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["logs"] }),
        queryClient.invalidateQueries({ queryKey: ["today-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["startup-snapshot"] }),
      ]);
      toast.success("日志已清空");
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : String(error));
    },
  });

  const accountNameMap = useMemo(() => {
    return new Map(
      (accountsResult?.items || []).map((account) => [
        account.id,
        account.label || account.name || account.id,
      ]),
    );
  }, [accountsResult?.items]);

  const logs = logsResult?.items || [];
  const currentPage = logsResult?.page || page;
  const summary = summaryResult || {
    totalCount: logsResult?.total || 0,
    filteredCount: logsResult?.total || 0,
    successCount: 0,
    errorCount: 0,
    totalTokens: 0,
  };
  const totalPages = Math.max(
    1,
    Math.ceil((logsResult?.total || 0) / pageSizeNumber),
  );

  const currentFilterLabel =
    filter === "all"
      ? "全部状态"
      : filter === "2xx"
        ? "成功请求"
        : filter === "4xx"
          ? "客户端错误"
          : "服务端错误";
  const compactMetaText = `${summary.filteredCount}/${summary.totalCount} 条 · ${currentFilterLabel} · ${
    serviceStatus.connected ? "5 秒刷新" : "服务未连接"
  }`;

  return (
    <div className="animate-in space-y-5 fade-in duration-500">
      <Card className="glass-card border-none shadow-md backdrop-blur-md">
        <CardContent className="grid gap-3 pt-0 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center">
          <div className="min-w-0">
            <Input
              placeholder="搜索路径、账号或密钥..."
              className="glass-card h-10 rounded-xl px-3"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
            {["all", "2xx", "4xx", "5xx"].map((item) => (
              <button
                key={item}
                onClick={() => {
                  setFilter(item as StatusFilter);
                  setPage(1);
                }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-all",
                  filter === item
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="glass-card h-9 rounded-xl px-3.5"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["logs"] })
              }
            >
              <RefreshCw className="mr-1.5 h-4 w-4" /> 刷新
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-9 rounded-xl px-3.5"
              onClick={() => setClearConfirmOpen(true)}
              disabled={clearMutation.isPending}
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> 清空日志
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground lg:justify-self-end lg:text-right">
            <span className="font-medium text-foreground">
              {compactMetaText}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="当前结果"
          value={`${summary.filteredCount}`}
          description={`总日志 ${summary.totalCount} 条`}
          icon={Zap}
          toneClass="bg-primary/12 text-primary"
        />
        <SummaryCard
          title="2XX 成功"
          value={`${summary.successCount}`}
          description="状态码 200-299"
          icon={CheckCircle2}
          toneClass="bg-green-500/12 text-green-500"
        />
        <SummaryCard
          title="异常请求"
          value={`${summary.errorCount}`}
          description="4xx / 5xx 或显式错误"
          icon={AlertTriangle}
          toneClass="bg-red-500/12 text-red-500"
        />
        <SummaryCard
          title="累计令牌"
          value={formatCompactNumber(summary.totalTokens, "0")}
          description="当前筛选结果中的 total tokens"
          icon={Database}
          toneClass="bg-amber-500/12 text-amber-500"
        />
      </div>

      <Card className="glass-card overflow-hidden border-none gap-0 py-0 shadow-xl backdrop-blur-md">
        <CardHeader className="flex min-h-1 items-center border-b border-border/40 bg-[var(--table-section-bg)] py-3">
          <div className="flex w-full flex-col gap-1 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <CardTitle className="text-[15px] font-semibold">
                请求明细 按{" "}
                <span className="font-medium text-foreground">
                  {currentFilterLabel}
                </span>{" "}
                展示
              </CardTitle>
            </div>
            <div className="text-xs text-muted-foreground"></div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table className="min-w-[1320px] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="h-12 w-[150px] px-4 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  时间
                </TableHead>
                <TableHead className="w-[120px] px-4 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  方法 / 路径
                </TableHead>
                <TableHead className="w-[224px] px-4 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  账号 / 密钥
                </TableHead>
                <TableHead className="w-[180px] px-4 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  模型 / 推理
                </TableHead>
                <TableHead className="w-[92px] px-4 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  状态
                </TableHead>
                <TableHead className="w-[110px] px-4 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  请求时长
                </TableHead>
                <TableHead className="w-[148px] px-4 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  令牌
                </TableHead>
                <TableHead className="w-[240px] px-4 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                  错误
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-40" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-6 w-12 rounded-full" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-12" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-52 px-4 text-center text-sm text-muted-foreground"
                  >
                    {!serviceStatus.connected
                      ? "服务未连接，无法获取日志"
                      : "暂无请求日志"}
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log: RequestLog) => (
                  <TableRow
                    key={log.id}
                    className="group text-xs hover:bg-muted/20"
                  >
                    <TableCell className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                      {formatTsFromSeconds(log.createdAt, "未知时间")}
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top">
                      <RequestRouteInfoCell log={log} />
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top">
                      <AccountKeyInfoCell
                        log={log}
                        accountLabel={resolveAccountDisplayName(
                          log,
                          accountNameMap,
                        )}
                        accountNameMap={accountNameMap}
                      />
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top">
                      <ModelEffortCell log={log} />
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top">
                      {getStatusBadge(log.statusCode)}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-primary">
                      {formatDuration(log.durationMs)}
                    </TableCell>
                    <TableCell className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                        <span>总 {log.totalTokens?.toLocaleString() || 0}</span>
                        <span>
                          输入 {log.inputTokens?.toLocaleString() || 0}
                        </span>
                        <span className="opacity-60">
                          缓存 {log.cachedInputTokens?.toLocaleString() || 0}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-left align-top">
                      <ErrorInfoCell error={log.error} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between px-2">
        <div className="text-xs text-muted-foreground">
          共 {summary.filteredCount} 条匹配日志
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              每页显示
            </span>
            <Select
              value={pageSize}
              onValueChange={(value) => {
                setPageSize(value || "10");
                setPage(1);
              }}
            >
              <SelectTrigger className="h-8 w-[78px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {["5", "10", "20", "50", "100", "200"].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={currentPage <= 1}
              onClick={() => setPage(Math.max(1, currentPage - 1))}
            >
              上一页
            </Button>
            <div className="min-w-[68px] text-center text-xs font-medium">
              第 {currentPage} / {totalPages} 页
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={clearConfirmOpen}
        onOpenChange={setClearConfirmOpen}
        title="清空请求日志"
        description="确定清空全部请求日志吗？该操作不可恢复。"
        confirmText="清空"
        confirmVariant="destructive"
        onConfirm={() => clearMutation.mutate()}
      />
    </div>
  );
}

function LogsPageKeyedContent() {
  const searchParams = useSearchParams();
  const queryKey = searchParams.get("query") || "";

  return <LogsPageContent key={queryKey} />;
}

export default function LogsPage() {
  return (
    <Suspense fallback={<LogsPageSkeleton />}>
      <LogsPageKeyedContent />
    </Suspense>
  );
}
