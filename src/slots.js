import { MessageFlags } from "discord.js";
import { isAclAuthorized } from "./acl.js";
import { changeSlot } from "./mta.js";

export const SLOT_COMMANDS = ["addslot", "removeslot"];

export function isSlotInteraction(interaction) {
    return interaction.isChatInputCommand() && SLOT_COMMANDS.includes(interaction.commandName);
}

export function createSlotHandler(config, mta = { changeSlot }) {
    return async function handleSlot(interaction) {
        if (interaction.guildId !== config.discord.guildId || !isAclAuthorized(interaction, config)) {
            await interaction.reply({
                content: "No tienes autorización para administrar slots en este servidor.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        const target = interaction.options.getUser("usuario", true);
        const slot = interaction.options.getInteger("slot", true);
        if (target.bot || !Number.isSafeInteger(slot) || slot < 2) {
            await interaction.reply({
                content: "Elige una persona y un slot adicional desde el 2. El slot inicial es permanente.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const action = interaction.commandName === "addslot" ? "add" : "remove";
        try {
            await mta.changeSlot(config.mta, action, interaction.user.id, target.id, slot);
            await interaction.editReply({
                content: action === "add"
                    ? "Slot **" + slot + "** habilitado para la cuenta de <@" + target.id + ">."
                    : "Slot **" + slot + "** retirado de la cuenta de <@" + target.id + ">. Su personaje se conserva y no podrá seleccionarse hasta habilitarlo otra vez. Si está en uso, se aplica al volver a entrar. El slot gratuito sigue disponible.",
                allowedMentions: { parse: [] },
            });
        } catch (error) {
            await interaction.editReply({ content: error.message, allowedMentions: { parse: [] } });
        }
    };
}
