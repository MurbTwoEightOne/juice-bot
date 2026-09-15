import { type ChatInputCommandInteraction } from 'discord.js'
import type { SlashCommandBuilder, SlashCommandSubcommandsOnlyBuilder } from '@discordjs/builders'

export interface Command {
  data: SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>
}
