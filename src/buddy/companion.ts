import {
  getGlobalConfig,
  getOrCreateUserID,
  type GlobalConfig,
} from '../utils/config.js'
import {
  type Companion,
  type CompanionBones,
  EYES,
  HATS,
  RARITIES,
  RARITY_WEIGHTS,
  type Rarity,
  SPECIES,
  STAT_NAMES,
  type StatName,
  type StoredCompanion,
  type StoredCompanionProfiles,
} from './types.js'

// Mulberry32 — tiny seeded PRNG, good enough for picking buddies.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  if (typeof Bun !== 'undefined') {
    return Number(BigInt(Bun.hash(s)) & 0xffffffffn)
  }
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!
}

function rollRarity(rng: () => number): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
  let roll = rng() * total
  for (const rarity of RARITIES) {
    roll -= RARITY_WEIGHTS[rarity]
    if (roll < 0) return rarity
  }
  return 'common'
}

const RARITY_FLOOR: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
}

function rollStats(
  rng: () => number,
  rarity: Rarity,
): Record<StatName, number> {
  const floor = RARITY_FLOOR[rarity]
  const peak = pick(rng, STAT_NAMES)
  let dump = pick(rng, STAT_NAMES)
  while (dump === peak) dump = pick(rng, STAT_NAMES)

  const stats = {} as Record<StatName, number>
  for (const name of STAT_NAMES) {
    if (name === peak) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30))
    } else if (name === dump) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15))
    } else {
      stats[name] = floor + Math.floor(rng() * 40)
    }
  }
  return stats
}

const SALT = 'friend-2026-401'

export type Roll = {
  bones: CompanionBones
  inspirationSeed: number
}

type CompanionConfig = Pick<
  GlobalConfig,
  'companion' | 'oauthAccount' | 'userID'
> & {
  companions?: StoredCompanionProfiles
}

function readCompanionConfig(): CompanionConfig {
  return getGlobalConfig() as GlobalConfig & CompanionConfig
}

function rollFrom(rng: () => number): Roll {
  const rarity = rollRarity(rng)
  const bones: CompanionBones = {
    rarity,
    species: pick(rng, SPECIES),
    eye: pick(rng, EYES),
    hat: rarity === 'common' ? 'none' : pick(rng, HATS),
    shiny: rng() < 0.01,
    stats: rollStats(rng, rarity),
  }
  return { bones, inspirationSeed: Math.floor(rng() * 1e9) }
}

let rollCache: { key: string; value: Roll } | undefined
export function roll(userId: string): Roll {
  const key = userId + SALT
  if (rollCache?.key === key) return rollCache.value
  const value = rollFrom(mulberry32(hashString(key)))
  rollCache = { key, value }
  return value
}

export function rollWithSeed(seed: string): Roll {
  return rollFrom(mulberry32(hashString(seed)))
}

export function generateSeed(): string {
  return `rehatch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function stripCompanionSeedPrefix(seed: string): string {
  if (seed.startsWith('local:')) {
    return seed.slice('local:'.length)
  }
  if (seed.startsWith('oauth:')) {
    return seed.slice('oauth:'.length)
  }
  return seed
}

function getSeedAliases(seed: string): string[] {
  const aliases = [seed]
  const stripped = stripCompanionSeedPrefix(seed)
  if (stripped !== seed) {
    aliases.push(stripped)
  }
  return aliases
}

function createCompanionSeedFromConfig(config: CompanionConfig): string {
  if (config.oauthAccount?.accountUuid) {
    return `oauth:${config.oauthAccount.accountUuid}`
  }
  return `local:${config.userID ?? getOrCreateUserID()}`
}

export function createCompanionSeed(): string {
  return createCompanionSeedFromConfig(readCompanionConfig())
}

export function getCompanionSeed(): string {
  return createCompanionSeed()
}

export function companionUserId(): string {
  return getCompanionSeed()
}

function getStoredCompanionProfilesFromConfig(
  config: CompanionConfig,
): StoredCompanionProfiles {
  const profiles: StoredCompanionProfiles = { ...(config.companions ?? {}) }
  if (!config.companion) {
    return profiles
  }

  for (const alias of getSeedAliases(createCompanionSeedFromConfig(config))) {
    profiles[alias] ??= config.companion
  }

  return profiles
}

export function getStoredCompanionProfiles(): StoredCompanionProfiles {
  return getStoredCompanionProfilesFromConfig(readCompanionConfig())
}

export function getStoredCompanion(
  seed = getCompanionSeed(),
): StoredCompanion | undefined {
  const config = readCompanionConfig()
  const profiles = getStoredCompanionProfilesFromConfig(config)
  for (const alias of getSeedAliases(seed)) {
    const companion = profiles[alias]
    if (companion) {
      return companion
    }
  }
  return config.companion
}

export function hasAnyStoredCompanion(): boolean {
  return Object.keys(getStoredCompanionProfiles()).length > 0
}

export function backfillStoredCompanionProfiles(
  current: GlobalConfig,
): GlobalConfig {
  const config = current as GlobalConfig & CompanionConfig
  if (!config.companion) {
    return current
  }

  const nextProfiles = getStoredCompanionProfilesFromConfig(config)
  const currentProfiles = config.companions ?? {}
  const unchanged =
    Object.keys(nextProfiles).length === Object.keys(currentProfiles).length &&
    Object.entries(nextProfiles).every(
      ([seed, companion]) => currentProfiles[seed] === companion,
    )

  if (unchanged) {
    return current
  }

  return {
    ...current,
    companions: nextProfiles,
  } as GlobalConfig
}

export function withStoredCompanionProfile(
  current: GlobalConfig,
  seed: string,
  companion: StoredCompanion,
): GlobalConfig {
  const next = backfillStoredCompanionProfiles(current) as GlobalConfig &
    CompanionConfig
  return {
    ...next,
    companion,
    companions: {
      ...(next.companions ?? {}),
      [seed]: companion,
    },
  } as GlobalConfig
}

export function withoutStoredCompanionProfile(
  current: GlobalConfig,
  seed: string,
): GlobalConfig {
  const next = backfillStoredCompanionProfiles(current) as GlobalConfig &
    CompanionConfig
  const companions = { ...(next.companions ?? {}) }
  for (const alias of getSeedAliases(seed)) {
    delete companions[alias]
  }

  return {
    ...next,
    companion: undefined,
    companions,
  } as GlobalConfig
}

// Regenerate bones from the active seed, merge with stored soul.
export function getCompanion(): Companion | undefined {
  const seed = getCompanionSeed()
  const stored = getStoredCompanion(seed)
  if (!stored) return undefined

  const bonesSeed = stored.seed ?? seed
  const { bones } = rollWithSeed(bonesSeed)
  return { ...stored, ...bones }
}
