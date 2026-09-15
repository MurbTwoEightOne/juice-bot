export type EncounterState =
  | 'LOBBY'
  | 'PLAYER_PLAN'
  | 'PLAYER_ACTION'
  | 'RESOLVE_PLAYERS'
  | 'ENEMY_ACTION'
  | 'ROUND_END'
  | 'PAUSED'
  | 'ENDED'

export function initializeCombatDomain (): { placeholder: boolean } {
  return {
    placeholder: true
  }
}
