import { Prisma, type CharacterClass } from '@prisma/client'
import { prisma } from '../infrastructure/db/prisma.js'

export const CAMPAIGN_BUNDLE_VERSION = 1
export const DEFAULT_CAMPAIGN_TIMEOUTS = {
  playerPlan: 300,
  playerAction: 60,
  enemyAction: 60
}

type JsonValue = Prisma.JsonValue

export interface CampaignBundle {
  bundleVersion: number
  exportedAt: string
  sourceGuildId: string
  guildConfig: {
    gmRoleIds: string[]
    timeouts: {
      playerPlan: number
      playerAction: number
      enemyAction: number
    }
  }
  pools: Array<{
    id: string
    version: string | null
    name: string
    description: string | null
  }>
  moves: Array<{
    id: string
    version: string | null
    name: string
    class: string
    utilityKitId: string | null
    poolId: string | null
    targetRule: string
    priority: number
    cooldownRounds: number | null
    maxCharges: number | null
    effects: JsonValue
    tags: string[]
    enabled: boolean
  }>
  teamActions: Array<{
    id: string
    version: string | null
    name: string
    requiredClassMultiset: string[]
    poolId: string | null
    prerequisites: JsonValue
    effects: JsonValue
  }>
  items: Array<{
    id: string
    version: string | null
    name: string
    tiers: JsonValue
  }>
  poolUnlocks: string[]
  moveUnlocks: string[]
  teamActionUnlocks: string[]
  characters: Array<{
    userId: string
    name: string
    level: number
    class: string
    utilityKitId: string | null
    maxHp: number
    currentHp: number
    moves: Array<{ moveId: string, equippedSlot: number | null }>
    items: Array<{ itemId: string, tier: number, currentCharges: number }>
  }>
}

export async function ensureGuildCampaign (guildId: string): Promise<void> {
  const existing = await prisma.guildConfig.findUnique({ where: { guildId } })
  if (existing !== null) return

  await prisma.$transaction(async (transaction) => {
    const timeouts = await transaction.encounterTimeouts.create({ data: DEFAULT_CAMPAIGN_TIMEOUTS })
    await transaction.guildConfig.create({ data: { guildId, gmRoleIds: [], encounterTimeoutsId: timeouts.id } })
  })
}

export async function exportCampaign (guildId: string): Promise<CampaignBundle> {
  const guildConfig = await prisma.guildConfig.findUnique({ where: { guildId }, include: { encounterTimeouts: true } })
  if (guildConfig === null) {
    throw new Error('This guild has no campaign configuration yet.')
  }

  // Encounters are deliberately excluded: channel/message state belongs to the
  // server where it was created and should not migrate between guilds.
  const [pools, moves, teamActions, items, poolUnlocks, moveUnlocks, teamActionUnlocks, characters] = await Promise.all([
    prisma.movePool.findMany(),
    prisma.moveDefinition.findMany(),
    prisma.teamActionDefinition.findMany(),
    prisma.itemDefinition.findMany(),
    prisma.guildPoolUnlock.findMany({ where: { guildId } }),
    prisma.guildMoveUnlock.findMany({ where: { guildId } }),
    prisma.guildTeamActionUnlock.findMany({ where: { guildId } }),
    prisma.playerCharacter.findMany({ where: { guildId }, include: { moves: true, items: true } })
  ])

  return {
    bundleVersion: CAMPAIGN_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    sourceGuildId: guildId,
    guildConfig: {
      gmRoleIds: guildConfig.gmRoleIds,
      timeouts: {
        playerPlan: guildConfig.encounterTimeouts.playerPlan,
        playerAction: guildConfig.encounterTimeouts.playerAction,
        enemyAction: guildConfig.encounterTimeouts.enemyAction
      }
    },
    pools: pools.map(({ id, version, name, description }) => ({ id, version, name, description })),
    moves: moves.map(({ id, version, name, class: characterClass, utilityKitId, poolId, targetRule, priority, cooldownRounds, maxCharges, effects, tags, enabled }) => ({ id, version, name, class: characterClass, utilityKitId, poolId, targetRule, priority, cooldownRounds, maxCharges, effects, tags, enabled })),
    teamActions: teamActions.map(({ id, version, name, requiredClassMultiset, poolId, prerequisites, effects }) => ({ id, version, name, requiredClassMultiset, poolId, prerequisites, effects })),
    items: items.map(({ id, version, name, tiers }) => ({ id, version, name, tiers })),
    poolUnlocks: poolUnlocks.map((unlock) => unlock.poolId),
    moveUnlocks: moveUnlocks.map((unlock) => unlock.moveId),
    teamActionUnlocks: teamActionUnlocks.map((unlock) => unlock.teamActionId),
    characters: characters.map((character) => ({
      userId: character.userId,
      name: character.name,
      level: character.level,
      class: character.class,
      utilityKitId: character.utilityKitId,
      maxHp: character.maxHp,
      currentHp: character.currentHp,
      moves: character.moves.map((move) => ({ moveId: move.moveId, equippedSlot: move.equippedSlot })),
      items: character.items.map((item) => ({ itemId: item.itemId, tier: item.tier, currentCharges: item.currentCharges }))
    }))
  }
}

export async function importCampaign (guildId: string, bundle: CampaignBundle): Promise<void> {
  validateBundle(bundle)

  // Import is atomic. A failed content, unlock, or character write rolls back
  // the whole bundle instead of leaving a partially migrated campaign.
  await prisma.$transaction(async (transaction) => {
    const existingGuild = await transaction.guildConfig.findUnique({ where: { guildId } })
    if (existingGuild === null) {
      const timeouts = await transaction.encounterTimeouts.create({ data: bundle.guildConfig.timeouts })
      await transaction.guildConfig.create({ data: { guildId, gmRoleIds: bundle.guildConfig.gmRoleIds, encounterTimeoutsId: timeouts.id } })
    } else {
      await transaction.encounterTimeouts.update({ where: { id: existingGuild.encounterTimeoutsId }, data: bundle.guildConfig.timeouts })
      await transaction.guildConfig.update({ where: { guildId }, data: { gmRoleIds: bundle.guildConfig.gmRoleIds } })
    }

    for (const pool of bundle.pools) {
      await transaction.movePool.upsert({ where: { id: pool.id }, update: pool, create: pool })
    }
    for (const move of bundle.moves) {
      const moveData = { ...move, class: move.class as CharacterClass, effects: toInputJson(move.effects) }
      await transaction.moveDefinition.upsert({ where: { id: move.id }, update: moveData, create: moveData })
    }
    for (const teamAction of bundle.teamActions) {
      const teamActionData = { ...teamAction, prerequisites: toInputJson(teamAction.prerequisites), effects: toInputJson(teamAction.effects) }
      await transaction.teamActionDefinition.upsert({ where: { id: teamAction.id }, update: teamActionData, create: teamActionData })
    }
    for (const item of bundle.items) {
      const itemData = { ...item, tiers: toInputJson(item.tiers) }
      await transaction.itemDefinition.upsert({ where: { id: item.id }, update: itemData, create: itemData })
    }

    // Unlocks are replaced as a set so the destination mirrors the source
    // campaign rather than accumulating stale test-server permissions.
    await transaction.guildPoolUnlock.deleteMany({ where: { guildId } })
    await transaction.guildMoveUnlock.deleteMany({ where: { guildId } })
    await transaction.guildTeamActionUnlock.deleteMany({ where: { guildId } })
    await transaction.guildPoolUnlock.createMany({ data: bundle.poolUnlocks.map((poolId) => ({ guildId, poolId, source: 'campaign-import' })) })
    await transaction.guildMoveUnlock.createMany({ data: bundle.moveUnlocks.map((moveId) => ({ guildId, moveId, source: 'campaign-import' })) })
    await transaction.guildTeamActionUnlock.createMany({ data: bundle.teamActionUnlocks.map((teamActionId) => ({ guildId, teamActionId, source: 'campaign-import' })) })

    for (const character of bundle.characters) {
      const existingCharacter = await transaction.playerCharacter.findFirst({ where: { guildId, userId: character.userId } })
      const savedCharacter = existingCharacter === null
        ? await transaction.playerCharacter.create({ data: { guildId, userId: character.userId, name: character.name, level: character.level, class: character.class as 'FIGHTER' | 'SUPPORT' | 'UTILITY', utilityKitId: character.utilityKitId, maxHp: character.maxHp, currentHp: character.currentHp } })
        : await transaction.playerCharacter.update({ where: { id: existingCharacter.id }, data: { guildId, name: character.name, level: character.level, class: character.class as 'FIGHTER' | 'SUPPORT' | 'UTILITY', utilityKitId: character.utilityKitId, maxHp: character.maxHp, currentHp: character.currentHp, activeEncounterId: null } })
      await transaction.characterMove.deleteMany({ where: { characterId: savedCharacter.id } })
      await transaction.characterItem.deleteMany({ where: { characterId: savedCharacter.id } })
      await transaction.characterMove.createMany({ data: character.moves.map((move) => ({ characterId: savedCharacter.id, moveId: move.moveId, equippedSlot: move.equippedSlot })) })
      await transaction.characterItem.createMany({ data: character.items.map((item) => ({ characterId: savedCharacter.id, itemId: item.itemId, tier: item.tier, currentCharges: item.currentCharges })) })
    }
  })
}

function validateBundle (bundle: CampaignBundle): void {
  // Keep the import contract explicit so future bundle formats can be rejected
  // safely instead of being interpreted with the wrong schema.
  if (bundle.bundleVersion !== CAMPAIGN_BUNDLE_VERSION) {
    throw new Error(`Unsupported campaign bundle version: ${bundle.bundleVersion}`)
  }
  if (!Array.isArray(bundle.pools) || !Array.isArray(bundle.moves) || !Array.isArray(bundle.teamActions) || !Array.isArray(bundle.items) || !Array.isArray(bundle.characters)) {
    throw new Error('Campaign bundle is missing required collections.')
  }
}

function toInputJson (value: JsonValue): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : value as Prisma.InputJsonValue
}
