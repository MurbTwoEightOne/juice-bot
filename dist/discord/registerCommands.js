import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { commands } from './commands/index.js';
export async function registerCommands(token, clientId) {
    const rest = new REST({ version: '10' }).setToken(token);
    const commandData = commands.map((command) => command.data.toJSON());
    await rest.put(Routes.applicationCommands(clientId), {
        body: commandData
    });
}
//# sourceMappingURL=registerCommands.js.map