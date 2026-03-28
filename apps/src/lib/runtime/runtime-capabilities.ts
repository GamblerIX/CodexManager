import { isTauriRuntime } from "@/lib/api/transport";

export type RuntimeMode = "desktop" | "web";

export interface RuntimeCapabilities {
  mode: RuntimeMode;
  isDesktop: boolean;
  isWeb: boolean;
  supportsLocalServiceControl: boolean;
  supportsNativeWindowControls: boolean;
  supportsNativeFileDialog: boolean;
  supportsRootPageKeepAlive: boolean;
  supportsRouteDocumentWarmup: boolean;
}

const WEB_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  mode: "web",
  isDesktop: false,
  isWeb: true,
  supportsLocalServiceControl: false,
  supportsNativeWindowControls: false,
  supportsNativeFileDialog: false,
  supportsRootPageKeepAlive: false,
  supportsRouteDocumentWarmup: true,
};

const DESKTOP_RUNTIME_CAPABILITIES: RuntimeCapabilities = {
  mode: "desktop",
  isDesktop: true,
  isWeb: false,
  supportsLocalServiceControl: true,
  supportsNativeWindowControls: true,
  supportsNativeFileDialog: true,
  supportsRootPageKeepAlive: true,
  supportsRouteDocumentWarmup: false,
};

export function getRuntimeCapabilities(): RuntimeCapabilities {
  return isTauriRuntime()
    ? DESKTOP_RUNTIME_CAPABILITIES
    : WEB_RUNTIME_CAPABILITIES;
}
