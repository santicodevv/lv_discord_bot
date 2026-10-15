import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { registerCommands } from "./commands.js";
import { startBot } from "./index.js";

export async function startRailway(config, services = { registerCommands, startBot }) {
    try {
        await services.registerCommands(config);
    } catch {
        throw new Error("No se pudieron registrar los comandos. Revisa DISCORD_TOKEN, DISCORD_APPLICATION_ID, DISCORD_GUILD_ID y la invitación del bot.");
    }

    console.log("Comandos de Discord registrados.");
    return services.startBot(config);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await startRailway(loadConfig());
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
