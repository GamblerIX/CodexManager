import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Shield,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { RequestLog } from "@/types";

export function getStatusBadge(statusCode: number | null) {
  if (statusCode == null) {
    return <Badge variant="secondary">-</Badge>;
  }
  if (statusCode >= 200 && statusCode < 300) {
    return (
      <Badge className="border-green-500/20 bg-green-500/10 text-green-500">
        {statusCode}
      </Badge>
    );
  }
  if (statusCode >= 400 && statusCode < 500) {
    return (
      <Badge className="border-yellow-500/20 bg-yellow-500/10 text-yellow-500">
        {statusCode}
      </Badge>
    );
  }
  return (
    <Badge className="border-red-500/20 bg-red-500/10 text-red-500">
      {statusCode}
    </Badge>
  );
}

export function SummaryCard({
  title,
  value,
  description,
  icon: Icon,
  toneClass,
}: {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
  toneClass: string;
}) {
  return (
    <Card
      size="sm"
      className="glass-card border-none shadow-sm backdrop-blur-md transition-all hover:-translate-y-0.5"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
        <CardTitle className="text-[13px] font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-xl",
            toneClass,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      </CardHeader>
      <CardContent className="space-y-0.5">
        <div className="text-[2rem] leading-none font-semibold tracking-tight">
          {value}
        </div>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

export function formatDuration(value: number | null): string {
  if (value == null) return "-";
  if (value >= 10_000) return `${Math.round(value / 1000)}s`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}s`;
  return `${Math.round(value)}ms`;
}

function fallbackAccountNameFromId(accountId: string): string {
  const raw = accountId.trim();
  if (!raw) return "";
  const sep = raw.indexOf("::");
  if (sep < 0) return "";
  return raw.slice(sep + 2).trim();
}

function fallbackAccountDisplayFromKey(keyId: string): string {
  const raw = keyId.trim();
  if (!raw) return "";
  return `Key ${raw.slice(0, 10)}`;
}

function formatCompactKeyLabel(keyId: string): string {
  if (!keyId) return "-";
  if (keyId.length <= 12) return keyId;
  return `${keyId.slice(0, 8)}...`;
}

function resolveDisplayRequestPath(log: RequestLog): string {
  const originalPath = String(log.originalPath || "").trim();
  if (originalPath) {
    return originalPath;
  }
  return String(log.path || log.requestPath || "").trim();
}

function resolveUpstreamDisplay(upstreamUrl: string): string {
  const raw = String(upstreamUrl || "").trim();
  if (!raw) return "";
  if (raw === "默认" || raw === "本地" || raw === "自定义") {
    return raw;
  }
  try {
    const url = new URL(raw);
    const pathname = url.pathname.replace(/\/+$/, "");
    return pathname ? `${url.host}${pathname}` : url.host;
  } catch {
    return raw;
  }
}

function resolveAccountDisplayNameById(
  accountId: string,
  accountNameMap: Map<string, string>,
): string {
  const normalized = String(accountId || "").trim();
  if (!normalized) return "";
  return (
    accountNameMap.get(normalized) ||
    fallbackAccountNameFromId(normalized) ||
    normalized
  );
}

export function resolveAccountDisplayName(
  log: RequestLog,
  accountNameMap: Map<string, string>,
): string {
  if (log.accountId) {
    const label = accountNameMap.get(log.accountId);
    if (label) {
      return label;
    }
    const fallbackName = fallbackAccountNameFromId(log.accountId);
    if (fallbackName) {
      return fallbackName;
    }
  }
  return fallbackAccountDisplayFromKey(log.keyId);
}

function formatModelEffortDisplay(log: RequestLog): string {
  const model = String(log.model || "").trim();
  const effort = String(log.reasoningEffort || "").trim();
  if (model && effort) {
    return `${model}/${effort}`;
  }
  return model || effort || "-";
}

export function AccountKeyInfoCell({
  log,
  accountLabel,
  accountNameMap,
}: {
  log: RequestLog;
  accountLabel: string;
  accountNameMap: Map<string, string>;
}) {
  const displayAccount = accountLabel || log.accountId || "-";
  const hasNamedAccount =
    Boolean(accountLabel) &&
    accountLabel.trim() !== "" &&
    accountLabel !== log.accountId;
  const attemptedAccountLabels = log.attemptedAccountIds
    .map((accountId) =>
      resolveAccountDisplayNameById(accountId, accountNameMap),
    )
    .filter((value) => value.trim().length > 0);
  const initialAccountLabel = resolveAccountDisplayNameById(
    log.initialAccountId,
    accountNameMap,
  );
  const showAttemptHint =
    attemptedAccountLabels.length > 1 &&
    initialAccountLabel &&
    initialAccountLabel !== displayAccount;

  return (
    <Tooltip>
      <TooltipTrigger render={<div />} className="block text-left">
        <div className="flex flex-col gap-0.5 opacity-80">
          <div className="flex items-center gap-1">
            <Zap className="h-3 w-3 text-yellow-500" />
            <span className="max-w-[140px] truncate">{displayAccount}</span>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Shield className="h-2.5 w-2.5" />
            <span className="font-mono">
              {formatCompactKeyLabel(log.keyId)}
            </span>
          </div>
          {showAttemptHint ? (
            <div className="text-[9px] text-amber-500">
              先试 {initialAccountLabel}
            </div>
          ) : null}
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <div className="flex min-w-[240px] flex-col gap-2">
          {initialAccountLabel ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">首尝试账号</div>
              <div className="break-all font-mono text-[11px]">
                {initialAccountLabel}
              </div>
            </div>
          ) : null}
          {attemptedAccountLabels.length > 1 ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">尝试链路</div>
              <div className="break-all font-mono text-[11px]">
                {attemptedAccountLabels.join(" -> ")}
              </div>
            </div>
          ) : null}
          {hasNamedAccount ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">邮箱 / 名称</div>
              <div className="break-all font-mono text-[11px]">
                {accountLabel}
              </div>
            </div>
          ) : null}
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">账号 ID</div>
            <div className="break-all font-mono text-[11px]">
              {log.accountId || "-"}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">密钥</div>
            <div className="break-all font-mono text-[11px]">
              {log.keyId || "-"}
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function RequestRouteInfoCell({ log }: { log: RequestLog }) {
  const displayPath = resolveDisplayRequestPath(log) || "-";
  const recordedPath = String(log.path || log.requestPath || "").trim();
  const originalPath = String(log.originalPath || "").trim();
  const adaptedPath = String(log.adaptedPath || "").trim();
  const upstreamUrl = String(log.upstreamUrl || "").trim();
  const upstreamDisplay = resolveUpstreamDisplay(upstreamUrl);

  return (
    <Tooltip>
      <TooltipTrigger render={<div />} className="block text-left">
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-primary">{log.method || "-"}</span>
          <span className="max-w-[200px] truncate text-muted-foreground">
            {displayPath}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        <div className="flex min-w-[280px] flex-col gap-2">
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">方法</div>
            <div className="font-mono text-[11px]">{log.method || "-"}</div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">显示地址</div>
            <div className="break-all font-mono text-[11px]">{displayPath}</div>
          </div>
          {recordedPath && recordedPath !== displayPath ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">记录地址</div>
              <div className="break-all font-mono text-[11px]">
                {recordedPath}
              </div>
            </div>
          ) : null}
          {originalPath && originalPath !== displayPath ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">原始地址</div>
              <div className="break-all font-mono text-[11px]">
                {originalPath}
              </div>
            </div>
          ) : null}
          {adaptedPath && adaptedPath !== displayPath ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">转发地址</div>
              <div className="break-all font-mono text-[11px]">
                {adaptedPath}
              </div>
            </div>
          ) : null}
          {log.responseAdapter ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">适配器</div>
              <div className="break-all font-mono text-[11px]">
                {log.responseAdapter}
              </div>
            </div>
          ) : null}
          {upstreamDisplay ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">上游</div>
              <div className="break-all font-mono text-[11px]">
                {upstreamDisplay}
              </div>
            </div>
          ) : null}
          {upstreamUrl ? (
            <div className="space-y-0.5">
              <div className="text-[10px] text-background/70">上游地址</div>
              <div className="break-all font-mono text-[11px]">
                {upstreamUrl}
              </div>
            </div>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function ErrorInfoCell({ error }: { error: string }) {
  const text = String(error || "").trim();
  if (!text) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={<div />} className="block text-left">
        <span className="block max-w-[220px] truncate font-medium text-red-400">
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-md">
        <div className="max-w-[360px] break-all font-mono text-[11px]">
          {text}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function ModelEffortCell({ log }: { log: RequestLog }) {
  const model = String(log.model || "").trim();
  const effort = String(log.reasoningEffort || "").trim();
  const display = formatModelEffortDisplay(log);

  return (
    <Tooltip>
      <TooltipTrigger render={<div />} className="block text-left">
        <span className="block max-w-[160px] truncate font-medium text-foreground">
          {display}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <div className="flex min-w-[200px] flex-col gap-2">
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">模型</div>
            <div className="break-all font-mono text-[11px]">
              {model || "-"}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="text-[10px] text-background/70">推理</div>
            <div className="break-all font-mono text-[11px]">
              {effort || "-"}
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export const LogsSummaryIcons = {
  AlertTriangle,
  CheckCircle2,
  Database,
  Zap,
};