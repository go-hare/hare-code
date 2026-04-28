import type { Message } from '../types/message.js'
import {
  generateSeed,
  getCompanion,
  getCompanionSeed,
  getStoredCompanion,
  hasAnyStoredCompanion,
  rollWithSeed,
  withStoredCompanionProfile,
  withoutStoredCompanionProfile,
} from '../buddy/companion.js'
import { triggerCompanionReaction } from '../buddy/companionReact.js'
import { generateStoredCompanion } from '../buddy/soul.js'
import type { Companion, StoredCompanion } from '../buddy/types.js'
import {
  enableConfigs,
  getGlobalConfig,
  saveGlobalConfig,
} from '../utils/config.js'

export type KernelCompanionState = {
  seed: string
  muted: boolean
  hasStoredCompanion: boolean
  profile: StoredCompanion | null
  companion: Companion | null
}

export type KernelCompanionAction =
  | { type: 'hatch'; seed?: string }
  | { type: 'rehatch'; seed?: string }
  | { type: 'mute' }
  | { type: 'unmute' }
  | { type: 'pet'; note?: string }
  | { type: 'clear'; seed?: string }

export type KernelCompanionReactionRequest = {
  messages: readonly unknown[]
}

export type KernelCompanionEvent =
  | {
      type: 'state_changed'
      action: KernelCompanionAction['type']
      state: KernelCompanionState | null
    }
  | {
      type: 'petted'
      note?: string
      state: KernelCompanionState | null
    }
  | {
      type: 'reaction'
      reaction: string
      state: KernelCompanionState | null
    }
  | {
      type: 'reaction_skipped'
      reason: string
      state: KernelCompanionState | null
    }

export type KernelCompanionRuntime = {
  getState(): Promise<KernelCompanionState | null>
  dispatch(
    action: KernelCompanionAction,
  ): Promise<KernelCompanionState | null>
  reactToTurn(request: KernelCompanionReactionRequest): Promise<void>
  onEvent(handler: (event: KernelCompanionEvent) => void): () => void
}

export type KernelCompanionRuntimeOptions = {
  signal?: AbortSignal
  generateStoredCompanion?: (
    seed: string,
    signal: AbortSignal,
  ) => Promise<StoredCompanion>
  triggerReaction?: (
    messages: readonly unknown[],
    setReaction: (reaction: string | undefined) => void,
  ) => void
}

export function createKernelCompanionRuntime(
  options: KernelCompanionRuntimeOptions = {},
): KernelCompanionRuntime {
  ensureConfigAccess()
  const listeners = new Set<(event: KernelCompanionEvent) => void>()
  const signal = options.signal ?? new AbortController().signal
  const generateProfile =
    options.generateStoredCompanion ?? generateStoredCompanion
  const triggerReaction = options.triggerReaction ?? triggerCompanionReaction
  let currentSeed: string | undefined
  let currentProfile: StoredCompanion | null | undefined
  let currentMuted: boolean | undefined

  function emit(event: KernelCompanionEvent): void {
    for (const listener of listeners) {
      listener(event)
    }
  }

  function getStateSnapshot(
    seedOverride = currentSeed,
    profileOverride = currentProfile,
  ): KernelCompanionState | null {
    const seed = seedOverride ?? getCompanionSeed()
    const muted = currentMuted ?? Boolean(getGlobalConfig().companionMuted)
    const profile =
      profileOverride !== undefined
        ? profileOverride
        : (getStoredCompanion(seed) ?? null)
    const companion = profile
      ? ({ ...profile, ...rollWithSeed(profile.seed ?? seed).bones } satisfies Companion)
      : (getCompanion() ?? null)
    const hasStoredCompanion = hasAnyStoredCompanion()
    if (!profile && !companion && !hasStoredCompanion) {
      return null
    }
    return {
      seed,
      muted,
      hasStoredCompanion,
      profile,
      companion,
    }
  }

  async function saveProfile(
    action: Extract<KernelCompanionAction, { type: 'hatch' | 'rehatch' }>,
  ): Promise<KernelCompanionState | null> {
    const seed = action.seed?.trim() || generateSeed()
    const profile = await generateProfile(seed, signal)
    currentSeed = seed
    currentProfile = profile
    saveGlobalConfig(current => withStoredCompanionProfile(current, seed, profile))
    const state = getStateSnapshot(seed, profile)
    emit({ type: 'state_changed', action: action.type, state })
    return state
  }

  return {
    async getState() {
      return getStateSnapshot()
    },
    async dispatch(action) {
      switch (action.type) {
        case 'hatch':
        case 'rehatch':
          return saveProfile(action)
        case 'mute':
        case 'unmute': {
          currentMuted = action.type === 'mute'
          saveGlobalConfig(current => ({
            ...current,
            companionMuted: currentMuted,
          }))
          const state = getStateSnapshot()
          emit({ type: 'state_changed', action: action.type, state })
          return state
        }
        case 'clear': {
          const seed = action.seed?.trim() || getCompanionSeed()
          if (currentSeed === seed) {
            currentProfile = null
          }
          saveGlobalConfig(current => withoutStoredCompanionProfile(current, seed))
          const state = getStateSnapshot(seed, currentSeed === seed ? null : undefined)
          emit({ type: 'state_changed', action: action.type, state })
          return state
        }
        case 'pet': {
          const state = getStateSnapshot()
          emit({ type: 'petted', note: action.note, state })
          return state
        }
      }
    },
    async reactToTurn(request) {
      const state = getStateSnapshot()
      if (!state?.companion) {
        emit({ type: 'reaction_skipped', reason: 'no_companion', state })
        return
      }
      if (state.muted) {
        emit({ type: 'reaction_skipped', reason: 'muted', state })
        return
      }
      if (!Array.isArray(request.messages)) {
        emit({ type: 'reaction_skipped', reason: 'invalid_messages', state })
        return
      }

      triggerReaction(request.messages, reaction => {
        if (reaction) {
          emit({ type: 'reaction', reaction, state: getStateSnapshot() })
          return
        }
        emit({
          type: 'reaction_skipped',
          reason: 'empty_reaction',
          state: getStateSnapshot(),
        })
      })
    },
    onEvent(handler) {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    },
  }
}

function ensureConfigAccess(): void {
  if (process.env.NODE_ENV !== 'test') {
    enableConfigs()
  }
}
