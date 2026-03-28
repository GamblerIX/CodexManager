import type { AppSettingsPatch, BackgroundTaskSettings } from "../../types";

export function createBackgroundTasksPatch(
  patch: Partial<BackgroundTaskSettings>
): AppSettingsPatch {
  return {
    backgroundTasks: {
      ...patch,
    },
  };
}

export function createEnvOverridePatch(
  key: string,
  value: string
): AppSettingsPatch {
  return {
    envOverrides: {
      [key]: value,
    },
  };
}

export function createEnvOverrideResetPatch(key: string): AppSettingsPatch {
  return createEnvOverridePatch(key, "");
}
