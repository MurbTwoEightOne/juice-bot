import { SlashCommandBuilder } from '@discordjs/builders'
import { PermissionFlagsBits, type ChatInputCommandInteraction } from 'discord.js'
import { type CharacterClass, EncounterState, type Prisma } from '@prisma/client'
import type { Command } from './Command.js'
import { prisma } from '../../infrastructure/db/prisma.js'
import { ensureGuildCampaign, exportCampaign, importCampaign, type CampaignBundle } from '../../application/campaignBundle.js'
import {
  resolvePrototypeEnemyAction,
  resolvePrototypePlayerBatch,
  runPrototypeStressSimulation,
  type PrototypeAction,
  type PrototypeActionId,
  type PrototypeCombatState
} from '../../domain/combat/prototype.js'

const prototypeActions: Record<PrototypeActionId, string> = {
  STRIKE: 'Strike (10 damage)',
  HEAL: 'Heal (10 HP)',
  NOTHING: 'Nothing'
}

// Discord handlers validate interaction context and delegate gameplay/data
// work to application services, Prisma, and the pure combat resolver.
export const rpgCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('rpg')
    .setDescription('Manage prototype RPG characters.')
    .addSubcommandGroup((group) => group
      .setName('character')
      .setDescription('Manage your character.')
      .addSubcommand((subcommand) => subcommand
        .setName('create')
        .setDescription('Create your prototype character.')
        .addStringOption((option) => option
          .setName('name')
          .setDescription('Character name.')
          .setRequired(true))
        .addStringOption((option) => option
          .setName('class')
          .setDescription('Character class.')
          .setRequired(true)
          .addChoices(
            { name: 'Fighter', value: 'FIGHTER' },
            { name: 'Support', value: 'SUPPORT' }
          )))
      .addSubcommand((subcommand) => subcommand
        .setName('view')
        .setDescription('View your prototype character.')))
    .addSubcommandGroup((group) => group
      .setName('campaign')
      .setDescription('Import or export campaign data.')
      .addSubcommand((subcommand) => subcommand
        .setName('export')
        .setDescription('Export campaign data as a JSON file.'))
      .addSubcommand((subcommand) => subcommand
        .setName('import')
        .setDescription('Import campaign data from a JSON file.')
        .addAttachmentOption((option) => option
          .setName('file')
          .setDescription('Campaign JSON bundle.')
          .setRequired(true)))),
  async execute (interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.guildId === null) {
      await interaction.reply({ content: 'This command must be used in a server.', ephemeral: true })
      return
    }
    await ensureGuildCampaign(interaction.guildId)

    if (interaction.options.getSubcommandGroup() === 'campaign') {
      if (!isAdministrator(interaction)) {
        await interaction.reply({ content: 'Only server administrators can import or export campaigns.', ephemeral: true })
      } else if (interaction.options.getSubcommand() === 'export') {
        await exportCampaignCommand(interaction)
      } else {
        await importCampaignCommand(interaction)
      }
    } else if (interaction.options.getSubcommand() === 'create') {
      await createCharacter(interaction)
    } else {
      await viewCharacter(interaction)
    }
  }
}

async function exportCampaignCommand (interaction: ChatInputCommandInteraction): Promise<void> {
  const bundle = await exportCampaign(requireGuildId(interaction))
  await interaction.reply({
    content: 'Campaign export complete. Active encounters and Discord channel state are not included.',
    files: [{ attachment: Buffer.from(JSON.stringify(bundle, null, 2), 'utf8'), name: 'campaign-bundle.json' }],
    ephemeral: true
  })
}

async function importCampaignCommand (interaction: ChatInputCommandInteraction): Promise<void> {
  const attachment = interaction.options.getAttachment('file', true)
  if (!attachment.name.toLowerCase().endsWith('.json')) {
    await interaction.reply({ content: 'Campaign imports must be JSON files.', ephemeral: true })
    return
  }

  await interaction.deferReply({ ephemeral: true })
  try {
    const response = await fetch(attachment.url)
    if (!response.ok) throw new Error(`Could not download the attachment (${response.status}).`)
    const bundle = await response.json() as CampaignBundle
    await importCampaign(requireGuildId(interaction), bundle)
    await interaction.editReply('Campaign import complete. Existing campaign unlocks and matching character records were replaced.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown import error.'
    await interaction.editReply(`Campaign import failed: ${message}`)
  }
}

export const battleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('battle')
    .setDescription('Run a prototype battle.')
    .addSubcommand((subcommand) => subcommand
      .setName('create')
      .setDescription('Create an encounter in this channel.')
      .addStringOption((option) => option.setName('enemy').setDescription('Enemy name.').setRequired(true))
      .addIntegerOption((option) => option.setName('hp').setDescription('Enemy maximum HP.').setRequired(true).setMinValue(1)))
    .addSubcommand((subcommand) => subcommand.setName('join').setDescription('Join the active encounter.'))
    .addSubcommand((subcommand) => subcommand.setName('start').setDescription('Start the active encounter.'))
    .addSubcommand((subcommand) => subcommand
      .setName('action')
      .setDescription('Submit or replace your private action.')
      .addStringOption((option) => option
        .setName('action')
        .setDescription('Action to submit.')
        .setRequired(true)
        .addChoices(
          { name: prototypeActions.STRIKE, value: 'STRIKE' },
          { name: prototypeActions.HEAL, value: 'HEAL' },
          { name: prototypeActions.NOTHING, value: 'NOTHING' }
        ))
      .addUserOption((option) => option.setName('target').setDescription('Ally target for Heal.')))
    .addSubcommand((subcommand) => subcommand
      .setName('enemy-action')
      .setDescription('Submit the manual enemy action.')
      .addUserOption((option) => option.setName('target').setDescription('Player target.').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('stress-test')
      .setDescription('Benchmark simultaneous action resolution without changing the database.')
      .addIntegerOption((option) => option
        .setName('participants')
        .setDescription('Synthetic player count. Defaults to 30.')
        .setMinValue(1)
        .setMaxValue(1000))
      .addIntegerOption((option) => option
        .setName('rounds')
        .setDescription('Number of synthetic rounds. Defaults to 100.')
        .setMinValue(1)
        .setMaxValue(1000)))
    .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Show the active encounter.')),
  async execute (interaction: ChatInputCommandInteraction): Promise<void> {
    if (interaction.guildId === null || interaction.channelId === null) {
      await interaction.reply({ content: 'This command must be used in a server channel.', ephemeral: true })
      return
    }
    await ensureGuildCampaign(interaction.guildId)

    const subcommand = interaction.options.getSubcommand()
    if (subcommand === 'create') await createBattle(interaction)
    else if (subcommand === 'join') await joinBattle(interaction)
    else if (subcommand === 'start') await startBattle(interaction)
    else if (subcommand === 'action') await submitAction(interaction)
    else if (subcommand === 'enemy-action') await submitEnemyAction(interaction)
    else if (subcommand === 'stress-test') await runStressTest(interaction)
    else await showBattleStatus(interaction)
  }
}

async function createCharacter (interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = requireGuildId(interaction)
  const name = interaction.options.getString('name', true)
  const characterClass = interaction.options.getString('class', true) as CharacterClass
  const existing = await prisma.playerCharacter.findFirst({ where: { guildId, userId: interaction.user.id } })
  const character = existing === null
    ? await prisma.playerCharacter.create({ data: { guildId, userId: interaction.user.id, name, class: characterClass } })
    : await prisma.playerCharacter.update({ where: { id: existing.id }, data: { name, class: characterClass, currentHp: 30, maxHp: 30 } })
  await interaction.reply({ content: `Created **${character.name}** (${character.class}) with 30/30 HP.`, ephemeral: true })
}

async function viewCharacter (interaction: ChatInputCommandInteraction): Promise<void> {
  const character = await prisma.playerCharacter.findFirst({ where: { guildId: requireGuildId(interaction), userId: interaction.user.id } })
  if (character === null) {
    await interaction.reply({ content: 'You do not have a character yet. Use `/rpg character create`.', ephemeral: true })
    return
  }
  await interaction.reply({ content: `**${character.name}** (${character.class})\nHP: ${character.currentHp}/${character.maxHp}`, ephemeral: true })
}

async function createBattle (interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAdministrator(interaction)) {
    await interaction.reply({ content: 'Only server administrators can create encounters.', ephemeral: true })
    return
  }
  const guildId = requireGuildId(interaction)
  const channelId = interaction.channelId
  const enemyName = interaction.options.getString('enemy', true)
  const enemyMaxHp = interaction.options.getInteger('hp', true)
  const existing = await prisma.encounter.findFirst({ where: { guildId, channelId, state: { not: EncounterState.ENDED } } })
  if (existing !== null) {
    await interaction.reply({ content: 'This channel already has an active encounter.', ephemeral: true })
    return
  }

  const deadlines = await prisma.encounterDeadlines.create({ data: {} })
  const encounter = await prisma.encounter.create({
    data: {
      guildId,
      channelId,
      enemyName,
      enemyHp: enemyMaxHp,
      enemyMaxHp,
      randomSeed: `${Date.now()}-${interaction.id}`,
      deadlinesId: deadlines.id
    }
  })
  await interaction.reply(`Created encounter **${encounter.enemyName}** with ${encounter.enemyMaxHp} HP. Players can use "/battle join".`)
}

async function joinBattle (interaction: ChatInputCommandInteraction): Promise<void> {
  const encounter = await getActiveEncounter(interaction)
  const character = await prisma.playerCharacter.findFirst({ where: { guildId: requireGuildId(interaction), userId: interaction.user.id } })
  if (character === null) {
    await interaction.reply({ content: 'Create a character first with `/rpg character create`.', ephemeral: true })
    return
  }
  if (encounter === null) {
    await interaction.reply({ content: 'There is no active encounter in this channel.', ephemeral: true })
    return
  }
  if (encounter.state !== EncounterState.LOBBY) {
    await interaction.reply({ content: 'Players can only join while the encounter is in the lobby.', ephemeral: true })
    return
  }

  await prisma.encounterParticipant.upsert({
    where: { encounterId_characterId: { encounterId: encounter.id, characterId: character.id } },
    update: {},
    create: {
      encounterId: encounter.id,
      characterId: character.id,
      currentHp: character.currentHp,
      startSnapshot: { hp: character.currentHp, maxHp: character.maxHp, class: character.class },
      statuses: []
    }
  })
  await interaction.reply(`${character.name} joined the encounter.`)
}

async function startBattle (interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAdministrator(interaction)) {
    await interaction.reply({ content: 'Only server administrators can start encounters.', ephemeral: true })
    return
  }
  const encounter = await getActiveEncounter(interaction)
  if (encounter === null) {
    await interaction.reply({ content: 'There is no active encounter in this channel.', ephemeral: true })
    return
  }
  if (encounter.participants.length === 0) {
    await interaction.reply({ content: 'At least one player must join first.', ephemeral: true })
    return
  }
  await prisma.encounter.update({ where: { id: encounter.id }, data: { state: EncounterState.PLAYER_ACTION, round: 1 } })
  await interaction.reply(`Battle started against **${encounter.enemyName}**. Submit an action privately with "/battle action".`)
}

async function submitAction (interaction: ChatInputCommandInteraction): Promise<void> {
  const encounter = await getActiveEncounter(interaction)
  const character = await prisma.playerCharacter.findFirst({ where: { guildId: requireGuildId(interaction), userId: interaction.user.id } })
  if (encounter === null || character === null) {
    await interaction.reply({ content: 'You need an active encounter and character.', ephemeral: true })
    return
  }
  if (encounter.state !== EncounterState.PLAYER_ACTION) {
    await interaction.reply({ content: 'The encounter is not accepting player actions.', ephemeral: true })
    return
  }

  const participant = encounter.participants.find((entry) => entry.characterId === character.id)
  if (participant === undefined || participant.currentHp <= 0) {
    await interaction.reply({ content: 'You are not an active participant.', ephemeral: true })
    return
  }
  const actionId = interaction.options.getString('action', true) as PrototypeActionId
  const targetUser = interaction.options.getUser('target')
  // Upserting by encounter, round, and actor makes replacement safe and keeps
  // duplicate Discord deliveries from creating a second action.
  await prisma.actionSubmission.upsert({
    where: { encounterId_round_actorId: { encounterId: encounter.id, round: encounter.round, actorId: character.id } },
    update: { payload: { actionId, targetUserId: targetUser?.id }, locked: true, idempotencyKey: interaction.id },
    create: { encounterId: encounter.id, round: encounter.round, actorId: character.id, payload: { actionId, targetUserId: targetUser?.id }, locked: true, idempotencyKey: interaction.id }
  })
  await interaction.reply({ content: `Submitted **${prototypeActions[actionId]}**.`, ephemeral: true })
  await resolveIfEveryoneSubmitted(interaction, encounter.id)
}

async function resolveIfEveryoneSubmitted (interaction: ChatInputCommandInteraction, encounterId: string): Promise<void> {
  const encounter = await prisma.encounter.findUnique({ where: { id: encounterId }, include: { participants: { include: { character: true } }, submissions: true } })
  if (encounter === null) return
  const submissions = encounter.submissions.filter((submission) => submission.round === encounter.round && submission.locked)
  if (submissions.length < encounter.participants.length) return

  const playerState: PrototypeCombatState = {
    enemyHp: encounter.enemyHp,
    enemyMaxHp: encounter.enemyMaxHp,
    players: encounter.participants.map((participant) => ({ id: participant.characterId, name: participant.character.name, class: participant.character.class as 'FIGHTER' | 'SUPPORT', currentHp: participant.currentHp, maxHp: participant.character.maxHp, dead: participant.currentHp <= 0 }))
  }
  const actions: PrototypeAction[] = submissions.map((submission) => {
    const payload = submission.payload as { actionId: PrototypeActionId, targetUserId?: string }
    const target = encounter.participants.find((participant) => participant.character.userId === payload.targetUserId)
    return { actorId: submission.actorId, actionId: payload.actionId, targetId: target?.characterId }
  })
  // Resolve the player batch from one snapshot before allowing the enemy turn.
  const result = resolvePrototypePlayerBatch(playerState, actions)

  // Persist the batch and its participant HP changes together. The revision
  // check prevents two simultaneous submissions from committing twice.
  await prisma.$transaction(async (transaction) => {
    await transaction.encounter.update({ where: { id: encounter.id, revision: encounter.revision }, data: { enemyHp: result.state.enemyHp, state: result.events.some((event) => event.type === 'VICTORY') ? EncounterState.ENDED : EncounterState.ENEMY_ACTION, revision: { increment: 1 } } })
    for (const player of result.state.players) {
      await transaction.encounterParticipant.update({ where: { encounterId_characterId: { encounterId: encounter.id, characterId: player.id } }, data: { currentHp: player.currentHp } })
    }
    await transaction.resolutionEvent.create({ data: { encounterId: encounter.id, round: encounter.round, phase: EncounterState.RESOLVE_PLAYERS, sequence: 1, eventType: 'PROTOTYPE_PLAYER_RESOLUTION', payload: result.events as unknown as Prisma.InputJsonValue, definitionVersions: {} } })
  })
  await interaction.followUp({ content: `${result.events.map((event) => event.message).join('\n')}\nGM: submit "/battle enemy-action".`, ephemeral: false })
}

async function submitEnemyAction (interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAdministrator(interaction)) {
    await interaction.reply({ content: 'Only server administrators can submit enemy actions.', ephemeral: true })
    return
  }
  const encounter = await getActiveEncounter(interaction)
  if (encounter === null || encounter.state !== EncounterState.ENEMY_ACTION) {
    await interaction.reply({ content: 'The encounter is not waiting for an enemy action.', ephemeral: true })
    return
  }
  const targetUser = interaction.options.getUser('target', true)
  const targetParticipant = encounter.participants.find((participant) => participant.character.userId === targetUser.id && participant.currentHp > 0)
  if (targetParticipant === undefined) {
    await interaction.reply({ content: 'Choose a living participant as the enemy target.', ephemeral: true })
    return
  }

  const state: PrototypeCombatState = {
    enemyHp: encounter.enemyHp,
    enemyMaxHp: encounter.enemyMaxHp,
    players: encounter.participants.map((participant) => ({ id: participant.characterId, name: participant.character.name, class: participant.character.class as 'FIGHTER' | 'SUPPORT', currentHp: participant.currentHp, maxHp: participant.character.maxHp, dead: participant.currentHp <= 0 }))
  }
  // Manual mode keeps enemy choice in the GM's hands while reusing the same
  // resolver and target validation as the rest of combat.
  const result = resolvePrototypeEnemyAction(state, { actorId: 'enemy', actionId: 'STRIKE', targetId: targetParticipant.characterId })
  const ended = result.events.some((event) => event.type === 'DEFEAT')
  await prisma.$transaction(async (transaction) => {
    await transaction.encounter.update({ where: { id: encounter.id, revision: encounter.revision }, data: { enemyHp: result.state.enemyHp, state: ended ? EncounterState.ENDED : EncounterState.PLAYER_ACTION, round: ended ? encounter.round : encounter.round + 1, revision: { increment: 1 } } })
    for (const player of result.state.players) {
      await transaction.encounterParticipant.update({ where: { encounterId_characterId: { encounterId: encounter.id, characterId: player.id } }, data: { currentHp: player.currentHp } })
    }
    await transaction.resolutionEvent.create({ data: { encounterId: encounter.id, round: encounter.round, phase: EncounterState.ENEMY_ACTION, sequence: 2, eventType: 'PROTOTYPE_ENEMY_RESOLUTION', payload: result.events as unknown as Prisma.InputJsonValue, definitionVersions: {} } })
  })
  await interaction.reply(result.events.map((event) => event.message).join('\n'))
}

async function runStressTest (interaction: ChatInputCommandInteraction): Promise<void> {
  if (!isAdministrator(interaction)) {
    await interaction.reply({ content: 'Only server administrators can run stress tests.', ephemeral: true })
    return
  }

  const participantCount = interaction.options.getInteger('participants') ?? 30
  const rounds = interaction.options.getInteger('rounds') ?? 100
  await interaction.deferReply({ ephemeral: true })

  // This intentionally benchmarks only local combat resolution. It does not
  // create a battle, send 30 Discord interactions, or write to PostgreSQL.
  const result = runPrototypeStressSimulation(participantCount, rounds)
  await interaction.editReply([
    `Stress test complete: ${result.participantCount} participants x ${result.rounds} rounds.`,
    `Synthetic actions resolved: ${result.actionsResolved}.`,
    `Total resolver time: ${result.elapsedMilliseconds.toFixed(2)} ms.`,
    `Average round time: ${result.averageRoundMilliseconds.toFixed(4)} ms.`,
    `Final synthetic enemy HP: ${result.finalEnemyHp}.`,
    'This measures the combat engine only; Discord and database capacity require a separate integration test.'
  ].join('\n'))
}

async function showBattleStatus (interaction: ChatInputCommandInteraction): Promise<void> {
  const encounter = await getActiveEncounter(interaction)
  if (encounter === null) {
    await interaction.reply('There is no active encounter in this channel.')
    return
  }
  const players = encounter.participants.map((participant) => `${participant.character.name}: ${participant.currentHp}/${participant.character.maxHp}`).join('\n')
  await interaction.reply(`**${encounter.enemyName}**: ${encounter.enemyHp}/${encounter.enemyMaxHp}\nPhase: ${encounter.state}\n${players}`)
}

async function getActiveEncounter (interaction: ChatInputCommandInteraction): Promise<Prisma.EncounterGetPayload<{ include: { participants: { include: { character: true } } } }> | null> {
  return await prisma.encounter.findFirst({ where: { guildId: requireGuildId(interaction), channelId: interaction.channelId, state: { not: EncounterState.ENDED } }, include: { participants: { include: { character: true } } } })
}

function requireGuildId (interaction: ChatInputCommandInteraction): string {
  if (interaction.guildId === null) {
    throw new Error('This command requires a guild context.')
  }
  return interaction.guildId
}

function isAdministrator (interaction: ChatInputCommandInteraction): boolean {
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true
}
