import type { CoordinatorModeState } from '../types/index.js'

function cloneCoordinatorState(state: CoordinatorModeState): CoordinatorModeState {
  return {
    ...state,
    workerToolNames: [...(state.workerToolNames || [])],
    coordinatorToolNames: [...(state.coordinatorToolNames || [])],
    metadata: { ...(state.metadata || {}) },
  }
}

function normalizeCoordinatorState(
  state?: Partial<CoordinatorModeState>,
): CoordinatorModeState {
  return {
    enabled: Boolean(state?.enabled),
    workerToolNames: [...(state?.workerToolNames || [])],
    coordinatorToolNames: [...(state?.coordinatorToolNames || [])],
    metadata: { ...(state?.metadata || {}) },
  }
}

export class CoordinatorRuntime {
  #state: CoordinatorModeState

  constructor(initialState?: Partial<CoordinatorModeState>) {
    this.#state = normalizeCoordinatorState(initialState)
  }

  getState(): CoordinatorModeState {
    return cloneCoordinatorState(this.#state)
  }

  update(state: Partial<CoordinatorModeState>): CoordinatorModeState {
    this.#state = {
      ...this.#state,
      ...state,
      workerToolNames: state.workerToolNames || this.#state.workerToolNames,
      coordinatorToolNames:
        state.coordinatorToolNames || this.#state.coordinatorToolNames,
      metadata: {
        ...(this.#state.metadata || {}),
        ...(state.metadata || {}),
      },
    }
    return this.getState()
  }
}
