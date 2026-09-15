import { Client, GatewayIntentBits, Events } from 'discord.js'
import { config } from './config.js'
import { logger } from './observability/logger.js'
import { prisma } from './infrastructure/db/prisma.js'
import { commands } from './discord/commands/index.js'
import { registerCommands } from './discord/registerCommands.js'

const client = new Client({ intents: [GatewayIntentBits.Guilds] })

// Global registration makes the bot usable in any guild without a configured
// development guild ID. Discord may take time to propagate global commands.
client.once(Events.ClientReady, () => {
  void (async () => {
    logger.info(`Logged in as ${client.user?.tag}`)
    await registerCommands(config.discordToken, config.clientId)
    logger.info('Registered slash commands.')
  })()
})

client.on(Events.InteractionCreate, (interaction) => {
  void (async () => {
    if (!interaction.isChatInputCommand()) {
      return
    }

    const command = commands.find((cmd) => cmd.data.name === interaction.commandName)
    if (command === undefined) {
      await interaction.reply({ content: 'Unknown command.', ephemeral: true })
      return
    }

    try {
      await command.execute(interaction)
    } catch (error) {
      logger.error('Command execution failed', error)
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'An error occurred while executing the command.', ephemeral: true })
      } else {
        await interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true })
      }
    }
  })()
})

async function main (): Promise<void> {
  // Fail before login if the database is unavailable; the bot should not
  // appear online while it cannot persist gameplay state.
  await prisma.$connect()

  await client.login(config.discordToken)
}

void main().catch((error) => {
  logger.error('Fatal startup error', error)
  process.exit(1)
})
