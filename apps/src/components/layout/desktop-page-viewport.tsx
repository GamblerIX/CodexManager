"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { usePageTransitionReady } from "@/hooks/usePageTransitionReady";
import { useRuntimeCapabilities } from "@/hooks/useRuntimeCapabilities";
import {
  normalizeRootPagePath,
  ROOT_PAGE_PATHS,
  type RootPagePath,
} from "@/lib/routes/root-page-paths";
import { cn } from "@/lib/utils";
import { RouteTransitionOverlay } from "@/components/layout/route-transition-overlay";

type CachedRootPageMap = Partial<Record<RootPagePath, ReactNode>>;

export function DesktopPageViewport({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const runtimeCapabilities = useRuntimeCapabilities();
  const activePath = normalizeRootPagePath(pathname);
  const transitionReady = usePageTransitionReady(
    activePath ?? pathname,
    runtimeCapabilities.supportsRootPageKeepAlive && activePath !== null,
  );
  const [cachedPages, setCachedPages] = useState<CachedRootPageMap>(() =>
    activePath ? { [activePath]: children } : {},
  );

  useEffect(() => {
    if (!runtimeCapabilities.supportsRootPageKeepAlive || !activePath) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCachedPages((current) => {
        if (current[activePath] === children) {
          return current;
        }
        return {
          ...current,
          [activePath]: children,
        };
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activePath, children, runtimeCapabilities.supportsRootPageKeepAlive]);

  if (!runtimeCapabilities.supportsRootPageKeepAlive || !activePath) {
    return <>{children}</>;
  }

  return (
    <div className="relative min-h-full">
      <RouteTransitionOverlay visible={!transitionReady} />
      {ROOT_PAGE_PATHS.map((pagePath) => {
        const cachedPage = cachedPages[pagePath];
        if (!cachedPage) {
          return null;
        }
        const isActive = pagePath === activePath;
        return (
          <section
            key={pagePath}
            aria-hidden={!isActive}
            {...(!isActive ? { inert: true } : {})}
            data-root-page={pagePath}
            className={cn(
              "min-h-full transition-opacity duration-200",
              isActive
                ? "relative z-10 opacity-100"
                : "pointer-events-none absolute inset-0 z-0 overflow-hidden opacity-0",
            )}
          >
            {cachedPage}
          </section>
        );
      })}
    </div>
  );
}
