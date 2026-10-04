import { stellarisProfile } from './stellaris'
import { ck3Profile } from './ck3'
import type { GameId, GameProfile } from './types'

export type { GameId, GameProfile } from './types'

export const DEFAULT_GAME: GameId = 'stellaris'

/** Registry — supporting another game means adding a profile here. */
const REGISTRY: Record<GameId, GameProfile> = {
  stellaris: stellarisProfile,
  ck3: ck3Profile,
}

export const GAMES: readonly GameProfile[] = Object.values(REGISTRY)

/** Projects created before games existed have no `game` — they are Stellaris. */
export function getGameProfile(id?: GameId | null): GameProfile {
  return (id && REGISTRY[id]) || REGISTRY[DEFAULT_GAME]
}
