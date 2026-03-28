export const ROOT_PAGE_DASHBOARD = "/";
export const ROOT_PAGE_ACCOUNTS = "/accounts";
export const ROOT_PAGE_API_KEYS = "/apikeys";
export const ROOT_PAGE_LOGS = "/logs";
export const ROOT_PAGE_SETTINGS = "/settings";

export const ROOT_PAGE_PATHS = [
  ROOT_PAGE_DASHBOARD,
  ROOT_PAGE_ACCOUNTS,
  ROOT_PAGE_API_KEYS,
  ROOT_PAGE_LOGS,
  ROOT_PAGE_SETTINGS,
] as const;

export type RootPagePath = (typeof ROOT_PAGE_PATHS)[number];

export function normalizeRootPageCandidate(pathname: string): string {
  const trimmed = String(pathname || "").trim();
  if (!trimmed || trimmed === "/") {
    return ROOT_PAGE_DASHBOARD;
  }
  return trimmed.replace(/\/+$/, "");
}

export function normalizeRootPagePath(pathname: string): RootPagePath | null {
  const normalized = normalizeRootPageCandidate(pathname);
  return ROOT_PAGE_PATHS.includes(normalized as RootPagePath)
    ? (normalized as RootPagePath)
    : null;
}

export function toRootPageHref(pathname: RootPagePath): string {
  return pathname === ROOT_PAGE_DASHBOARD ? "/" : `${pathname}/`;
}
