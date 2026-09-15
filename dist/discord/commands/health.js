import { SlashCommandBuilder } from '@discordjs/builders';
export const healthCommand = {
    data: new SlashCommandBuilder().setName('health').setDescription('Check bot availability.'),
    async execute(interaction) {
        await interaction.reply({ content: 'Juice Bot is online.', ephemeral: true });
    }
};
//# sourceMappingURL=health.js.map