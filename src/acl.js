import { MessageFlags, PermissionFlagsBits } from "discord.js";
import { listAclGroups, changeAcl } from "./mta.js";

export const ACL_COMMANDS = ["addacl", "removeacl"];

const GROUP_CACHE_MS = 15000;

export function isAclInteraction(interaction) {
    return (interaction.isChatInputCommand() || interaction.isAutocomplete())
        && ACL_COMMANDS.includes(interaction.commandName);
}

export function isAclAuthorized(interaction, config) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return false;
    }

    const userId = interaction.user.id;
    const roles = interaction.member?.roles;
    const roleIds = Array.isArray(roles) ? roles : [...(roles?.cache?.keys() ?? [])];
    const allowedUsers = config.acl?.allowedUserIds ?? [];
    const allowedRoles = config.acl?.allowedRoleIds ?? [];

    return interaction.guild?.ownerId === userId
        || allowedUsers.includes(userId)
        || roleIds.some((roleId) => allowedRoles.includes(roleId));
}

export function createAclHandler(config, mta = { listAclGroups, changeAcl }) {
    let cache = { groups: [], expiresAt: 0 };

    async function getGroups() {
        if (cache.expiresAt <= Date.now()) {
            cache = { groups: await mta.listAclGroups(config.mta), expiresAt: Date.now() + GROUP_CACHE_MS };
        }

        return cache.groups;
    }

    async function handleAutocomplete(interaction) {
        let choices = [];

        if (interaction.guildId === config.discord.guildId && isAclAuthorized(interaction, config)) {
            const typed = interaction.options.getFocused().toLowerCase();

            try {
                choices = (await getGroups())
                    .filter((name) => name.toLowerCase().includes(typed))
                    .slice(0, 25)
                    .map((name) => ({ name: name.slice(0, 100), value: name }));
            } catch {
                choices = [];
            }
        }

        await interaction.respond(choices);
    }

    return async function handleAcl(interaction) {
        if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction);
            return;
        }

        if (interaction.guildId !== config.discord.guildId) {
            await interaction.reply({
                content: "Este bot solo administra ACL en el servidor configurado.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (!isAclAuthorized(interaction, config)) {
            await interaction.reply({
                content: "No tienes autorización para administrar ACL.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const action = interaction.commandName === "addacl" ? "add" : "remove";
        const group = interaction.options.getString("acl", true);
        const target = interaction.options.getUser("usuario", true);

        if (target.bot) {
            await interaction.reply({
                content: "No puedes administrar la ACL de un bot.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            await mta.changeAcl(config.mta, action, interaction.user.id, target.id, group);
            cache.expiresAt = 0;
            await interaction.editReply({
                content: action === "add"
                    ? "Se agregó la ACL **" + group + "** a <@" + target.id + ">."
                    : "Se quitó la ACL **" + group + "** a <@" + target.id + ">.",
                allowedMentions: { parse: [] },
            });
        } catch (error) {
            await interaction.editReply({ content: error.message, allowedMentions: { parse: [] } });
        }
    };
}
