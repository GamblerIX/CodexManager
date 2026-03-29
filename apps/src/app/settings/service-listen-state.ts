export function inferServiceBindPreview(addr: string, mode: string): string {
  const normalizedAddr = String(addr || "").trim() || "localhost:48760";
  const sanitizedAddr = normalizedAddr
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    ?.trim() || "localhost:48760";
  const [hostPart, port = "48760"] = sanitizedAddr.includes(":")
    ? sanitizedAddr.split(/:(?=[^:]+$)/)
    : ["", sanitizedAddr];
  const host = String(hostPart || "").trim();

  if (host && !["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"].includes(host)) {
    return `${host}:${port}`;
  }
  return mode === "all_interfaces" ? `0.0.0.0:${port}` : `localhost:${port}`;
}

export function readServiceListenState(settings: {
  serviceAddr: string;
  serviceListenMode: string;
  serviceListenModeEffective: string;
  serviceListenModeRestartRequired: boolean;
}) {
  return {
    savedBindAddr: inferServiceBindPreview(settings.serviceAddr, settings.serviceListenMode),
    effectiveBindAddr: inferServiceBindPreview(
      settings.serviceAddr,
      settings.serviceListenModeEffective || settings.serviceListenMode
    ),
    restartRequired: Boolean(settings.serviceListenModeRestartRequired),
  };
}