import { SlashCommandBuilder } from '@discordjs/builders'
import { type ChatInputCommandInteraction } from 'discord.js'
import type { Command } from './Command.js'

export const healthCommand: Command = {
  data: new SlashCommandBuilder().setName('health').setDescription('Check bot availability.'),
  async execute (interaction: ChatInputCommandInteraction) {
    await interaction.reply({ content: 'Juice Bot is online.', ephemeral: true })
  }
}
