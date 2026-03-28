"use client";

import { cn } from "@/lib/utils";

export function RouteTransitionOverlay({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-4 top-4 z-20 h-20 rounded-[28px] transition-opacity duration-200",
        "bg-gradient-to-b from-background/70 via-background/20 to-transparent",
        "[body.low-transparency_&]:bg-background/50 [body.low-transparency_&]:bg-none",
        visible ? "opacity-100" : "opacity-0",
      )}
    />
  );
}
