export type PreferredModelSaveState = Readonly<{
  confirmedModels: string[];
  latestIntentId: number | null;
  nextIntentId: number;
}>;

export type PreferredModelSaveStart = Readonly<{
  intentId: number;
  state: PreferredModelSaveState;
}>;

export type PreferredModelSaveSuccess = Readonly<{
  shouldApplyToUi: boolean;
  state: PreferredModelSaveState;
}>;

export type PreferredModelSaveFailure = Readonly<{
  confirmedModels: string[];
  shouldRollbackToConfirmedModels: boolean;
  state: PreferredModelSaveState;
}>;

function cloneModels(models: readonly string[]): string[] {
  return [...models];
}

export function createPreferredModelSaveState(
  confirmedModels: readonly string[] = []
): PreferredModelSaveState {
  return {
    confirmedModels: cloneModels(confirmedModels),
    latestIntentId: null,
    nextIntentId: 0,
  };
}

export function syncPreferredModelSaveConfirmedModels(
  state: PreferredModelSaveState,
  confirmedModels: readonly string[]
): PreferredModelSaveState {
  return {
    ...state,
    confirmedModels: cloneModels(confirmedModels),
  };
}

export function startPreferredModelSave(
  state: PreferredModelSaveState
): PreferredModelSaveStart {
  const intentId = state.nextIntentId + 1;
  return {
    intentId,
    state: {
      ...state,
      latestIntentId: intentId,
      nextIntentId: intentId,
    },
  };
}

export function completePreferredModelSave(
  state: PreferredModelSaveState,
  intentId: number,
  confirmedModels: readonly string[]
): PreferredModelSaveSuccess {
  const shouldApplyToUi = state.latestIntentId === intentId;
  return {
    shouldApplyToUi,
    state: {
      ...state,
      confirmedModels: cloneModels(confirmedModels),
      latestIntentId: shouldApplyToUi ? null : state.latestIntentId,
    },
  };
}

export function failPreferredModelSave(
  state: PreferredModelSaveState,
  intentId: number
): PreferredModelSaveFailure {
  const shouldRollbackToConfirmedModels = state.latestIntentId === intentId;
  return {
    confirmedModels: cloneModels(state.confirmedModels),
    shouldRollbackToConfirmedModels,
    state: {
      ...state,
      latestIntentId: shouldRollbackToConfirmedModels ? null : state.latestIntentId,
    },
  };
}
