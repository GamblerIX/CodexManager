"use client";

import { usePathname } from "next/navigation";
import { useRuntimeCapabilities } from "@/hooks/useRuntimeCapabilities";
import {
  normalizeRootPagePath,
  type RootPagePath,
} from "@/lib/routes/root-page-paths";

export function useDesktopPageActive(pagePath: RootPagePath): boolean {
  const pathname = usePathname();
  const runtimeCapabilities = useRuntimeCapabilities();
  const activePath = normalizeRootPagePath(pathname);

  if (!runtimeCapabilities.supportsRootPageKeepAlive) {
    return true;
  }

  return activePath === pagePath;
}
