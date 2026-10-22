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
            .setRequired(true))
        .addStringOption((option) => option
            .setName("personaje")
            .setDescription("Personaje del usuario que recibirá o perderá la ACL")
            .setRequired(true)
            .setAutocomplete(true));
}

function buildSlotCommand(name, description) {
    return new SlashCommandBuilder()
        .setName(name)
        .setDescription(description)
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption((option) => option
            .setName("usuario")
            .setDescription("Dueño de la cuenta principal de Discord")
            .setRequired(true))
        .addIntegerOption((option) => option
            .setName("slot")
            .setDescription("Número del slot adicional; el slot 1 es gratuito y permanente")
            .setMinValue(2)
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
        buildAclCommand("addacl", "Agrega un personaje a un grupo ACL de MTA."),
        buildAclCommand("removeacl", "Quita un personaje de un grupo ACL de MTA."),
        buildSlotCommand("addslot", "Libera un slot adicional de personajes para una cuenta de Discord."),
        buildSlotCommand("removeslot", "Retira un slot adicional de una cuenta de Discord sin borrar su personaje."),
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
