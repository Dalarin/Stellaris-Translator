import { useProject } from '@/store/ProjectContext'
import { getGameProfile, type GameProfile } from '@/games'

/** Profile of the game the active project translates. */
export function useGame(): GameProfile {
  const { state } = useProject()
  return getGameProfile(state.activeProject?.game)
}
