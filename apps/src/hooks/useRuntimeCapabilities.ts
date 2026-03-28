"use client";

import { useSyncExternalStore } from "react";
import {
  getRuntimeCapabilities,
  type RuntimeCapabilities,
} from "@/lib/runtime/runtime-capabilities";

export function useRuntimeCapabilities(): RuntimeCapabilities {
  return useSyncExternalStore(
    () => () => {},
    getRuntimeCapabilities,
    getRuntimeCapabilities,
  );
}
