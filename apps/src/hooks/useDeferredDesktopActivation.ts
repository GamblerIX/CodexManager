"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useDesktopPageActive } from "@/hooks/useDesktopPageActive";
import { useRuntimeCapabilities } from "@/hooks/useRuntimeCapabilities";
import { type RootPagePath } from "@/lib/routes/root-page-paths";

export function useDeferredDesktopActivation(
  pagePath: RootPagePath,
  activationDelayMs = 120,
): boolean {
  const runtimeCapabilities = useRuntimeCapabilities();
  const isActive = useDesktopPageActive(pagePath);
  const deferredActive = useDeferredValue(isActive);
  const [activationReady, setActivationReady] = useState(
    () => !runtimeCapabilities.supportsRootPageKeepAlive || isActive,
  );

  useEffect(() => {
    if (!runtimeCapabilities.supportsRootPageKeepAlive) {
      return;
    }

    if (!isActive) {
      const timer = window.setTimeout(() => {
        setActivationReady(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setActivationReady(true);
    }, activationDelayMs);
    return () => window.clearTimeout(timer);
  }, [activationDelayMs, isActive, runtimeCapabilities.supportsRootPageKeepAlive]);

  if (!runtimeCapabilities.supportsRootPageKeepAlive) {
    return true;
  }

  return deferredActive && activationReady;
}
