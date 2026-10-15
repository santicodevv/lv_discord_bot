import { PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";

function buildAclCommand(name, description) {
    return new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption((option) => option
            .setName("acl")
            .setDescription("Grupo ACL de MTA")
            .setRequired(true)
            .setAutocomplete(true))
        .addUserOption((option) => option
            .setName("usuario")
            .setDescription("Usuario de Discord con cuenta vinculada")
            .setRequired(true));
}

export function buildCommands() {
    return [
        // Comando desactivado: el panel se publica automáticamente al iniciar el bot.
        // new SlashCommandBuilder()
        //     .setName("panel-cuentas")
        //     .setDescription("Publica el panel de registro y recuperación en el canal configurado.")
        //     .setDMPermission(false)
        //     .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
        buildAclCommand("addacl", "Agrega un usuario de Discord a un grupo ACL de MTA."),
        buildAclCommand("removeacl", "Quita un usuario de Discord de un grupo ACL de MTA."),
    ].map((command) => command.toJSON());
}

export async function registerCommands(config) {
    const rest = new REST({ version: "10" }).setToken(config.discord.token);
    await rest.put(
        Routes.applicationGuildCommands(config.discord.applicationId, config.discord.guildId),
        { body: buildCommands() },
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await registerCommands(loadConfig());
        console.log("Comandos registrados en tu servidor de Discord.");
    } catch (error) {
        console.error(error.name === "DiscordAPIError"
            ? "Discord rechazó el registro. Revisa token, applicationId, guildId y la invitación del bot."
            : error.message);
        process.exitCode = 1;
    }
}
