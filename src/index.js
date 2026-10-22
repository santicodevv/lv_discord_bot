import {
    ActionRowBuilder,
    Client,
    EmbedBuilder,
    Events,
    GatewayIntentBits,
    MessageFlags,
    ModalBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { createAclHandler, isAclInteraction } from "./acl.js";
import { createSlotHandler, isSlotInteraction } from "./slots.js";
import { verifyWithMta, normalizeCode, callMta, mtaMessages } from "./mta.js";

const MENU_ID = "accounts:menu";
const MENU_ACTIONS = ["register", "recover"];

export function buildPanel(config) {
    const embed = new EmbedBuilder()
        .setTitle(config.panel.title)
        .setDescription(config.panel.description)
        .setColor(config.panel.color)
        .addFields(
            {
                name: "Verificar cuenta",
                value: "Primera vez en el servidor. Entra al juego, pulsa **Generar código** y pégalo aquí.",
            },
            {
                name: "Recuperar cuenta",
                value: "Cambiaste de PC o perdiste tu sesión. En el juego abre **Recuperar**, genera un código y pégalo aquí desde el Discord original.",
            },
            {
                name: "\u200b",
                value: "-# Los códigos caducan a los 5 minutos y solo sirven una vez. El staff nunca te los pedirá.",
            },
        )
        .setFooter({ text: "Level Roleplay · Sistema de verificación" });

    const menu = new StringSelectMenuBuilder()
        .setCustomId(MENU_ID)
        .setPlaceholder("Elige una opción")
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel("Verificar cuenta")
                .setDescription("Primera vez en el servidor")
                .setValue("register"),
            new StringSelectMenuOptionBuilder()
                .setLabel("Recuperar cuenta")
                .setDescription("Cambiaste de PC o perdiste tu sesión")
                .setValue("recover"),
        );

    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(menu)],
        allowedMentions: { parse: [] },
    };
}

export function buildModal(action) {
    const input = new TextInputBuilder()
        .setCustomId("code")
        .setLabel("Código generado en MTA")
        .setStyle(TextInputStyle.Short)
        .setMinLength(9)
        .setMaxLength(9)
        .setPlaceholder("Pega aquí los 9 caracteres")
        .setRequired(true);

    return new ModalBuilder()
        .setCustomId("accounts:submit:" + action)
        .setTitle(action === "register" ? "Verificar cuenta de MTA" : "Recuperar cuenta de MTA")
        .addComponents(new ActionRowBuilder().addComponents(input));
}

export function createInteractionHandler(config, verifier = verifyWithMta) {
    const cooldowns = new Map();
    const inFlight = new Set();

    return async function handleInteraction(interaction) {
        const menu = interaction.isStringSelectMenu();
        const modal = interaction.isModalSubmit();
        const ownedMenu = menu && interaction.customId === MENU_ID;
        const ownedModal = modal && ["accounts:submit:register", "accounts:submit:recover"].includes(interaction.customId);

        if (!ownedMenu && !ownedModal) {
            return;
        }

        if (interaction.guildId !== config.discord.guildId) {
            await interaction.reply({
                content: "Este bot solo verifica cuentas en el servidor configurado.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Comando /panel-cuentas desactivado: el panel se publica automáticamente al iniciar el bot.
        // if (command && interaction.commandName === "panel-cuentas") {
        //     if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        //         await interaction.reply({
        //             content: "Necesitas el permiso Gestionar servidor para publicar el panel.",
        //             flags: MessageFlags.Ephemeral,
        //         });
        //         return;
        //     }
        //
        //     await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        //     const channel = await interaction.client.channels.fetch(config.discord.channelId);
        //
        //     if (!channel || channel.guildId !== config.discord.guildId
        //         || !channel.isTextBased() || typeof channel.send !== "function") {
        //         await interaction.editReply("El canal configurado no es un canal de texto de este servidor.");
        //         return;
        //     }
        //
        //     await channel.send(buildPanel(config));
        //     await interaction.editReply("Panel publicado en <#" + config.discord.channelId + ">.");
        //     return;
        // }

        if (interaction.channelId !== config.discord.channelId) {
            await interaction.reply({
                content: "Utiliza el canal <#" + config.discord.channelId + "> para verificar o recuperar tu cuenta.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (menu) {
            const selected = interaction.values[0];

            if (!MENU_ACTIONS.includes(selected)) {
                return;
            }

            await interaction.showModal(buildModal(selected));
            // Restablece el menú para que se pueda volver a elegir la misma opción.
            interaction.message.edit(buildPanel(config)).catch(() => {});
            return;
        }

        const action = interaction.customId.split(":")[2];
        const code = normalizeCode(interaction.fields.getTextInputValue("code"));

        if (!code) {
            await interaction.reply({
                content: "Pega el código completo de 9 letras y números que muestra MTA.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const userId = interaction.user.id;
        const now = Date.now();

        for (const [id, expiresAt] of cooldowns) {
            if (expiresAt <= now) {
                cooldowns.delete(id);
            }
        }

        if (inFlight.has(userId) || cooldowns.has(userId)) {
            await interaction.reply({
                content: "Espera unos segundos antes de enviar otro código.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        inFlight.add(userId);
        cooldowns.set(userId, now + config.cooldownSeconds * 1000);

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            await verifier(config.mta, action, userId, code);
            await interaction.editReply(
                action === "register"
                    ? "Cuenta creada con tu ID de Discord. Vuelve a MTA: el servidor está iniciando tu sesión."
                    : "Cuenta recuperada. Vuelve a MTA: tus credenciales se renovaron automáticamente.",
            );
        } catch (error) {
            if (interaction.deferred) {
                await interaction.editReply({
                    content: error.message,
                    allowedMentions: { parse: [] },
                });
            } else {
                throw error;
            }
        } finally {
            inFlight.delete(userId);
        }
    };
}

function isPanelMessage(message, botId) {
    return message.author.id === botId
        && message.components.some((row) => row.components?.some((component) => component.customId === MENU_ID));
}

export async function ensurePanel(client, config) {
    const channel = await client.channels.fetch(config.discord.channelId).catch(() => null);

    if (!channel || channel.guildId !== config.discord.guildId
        || !channel.isTextBased() || typeof channel.send !== "function") {
        throw new Error("No se pudo publicar el panel: discord.channelId no es un canal de texto accesible de este servidor.");
    }

    const permissions = channel.permissionsFor(client.user);
    const missing = ["ViewChannel", "SendMessages", "EmbedLinks", "ReadMessageHistory"]
        .filter((name) => !permissions?.has(PermissionFlagsBits[name]));

    if (missing.length) {
        // Sin leer el historial no se puede saber si el panel ya existe; se omite para no duplicarlo.
        throw new Error("No se publicó el panel: al bot le faltan permisos en el canal (" + missing.join(", ") + ").");
    }

    const messages = await channel.messages.fetch({ limit: 100 });
    const existing = messages.find((message) => isPanelMessage(message, client.user.id));

    if (existing) {
        await existing.edit(buildPanel(config)).catch(() => {});
        return "existing";
    }

    await channel.send(buildPanel(config));
    return "created";
}

export async function startBot(config) {
    const result = await callMta(config.mta, "pingBot", []);

    if (result !== "PONG") {
        throw new Error(mtaMessages[result] ?? "MTA no confirmó la conexión.");
    }

    const client = new Client({
        intents: [GatewayIntentBits.Guilds],
        allowedMentions: { parse: [] },
    });
    const handleInteraction = createInteractionHandler(config);
    const handleAcl = createAclHandler(config);
    const handleSlot = createSlotHandler(config);

    client.once(Events.ClientReady, (readyClient) => {
        console.log("Bot conectado como " + readyClient.user.tag + ".");

        ensurePanel(readyClient, config)
            .then((state) => console.log(state === "created"
                ? "Panel publicado en el canal configurado."
                : "El panel ya estaba publicado; no se envió de nuevo."))
            .catch((error) => console.error(error.message));
    });

    client.on(Events.InteractionCreate, (interaction) => {
        const run = isSlotInteraction(interaction) ? handleSlot : isAclInteraction(interaction) ? handleAcl : handleInteraction;

        run(interaction).catch(async () => {
            if (interaction.isAutocomplete()) {
                return;
            }

            console.error("No se pudo responder a una interacción. Revisa los permisos del bot.");

            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp({
                        content: "No se pudo completar la respuesta. Revisa MTA antes de repetir el código.",
                        flags: MessageFlags.Ephemeral,
                    });
                } else {
                    await interaction.reply({
                        content: "No se pudo completar la operación. Contacta con administración.",
                        flags: MessageFlags.Ephemeral,
                    });
                }
            } catch {
                console.error("La interacción ya no está disponible.");
            }
        });
    });

    client.on(Events.Error, () => {
        console.error("Discord informó un error de conexión.");
    });

    process.once("SIGINT", () => client.destroy());
    process.once("SIGTERM", () => client.destroy());

    try {
        await client.login(config.discord.token);
    } catch {
        client.destroy();
        throw new Error("No se pudo conectar a Discord. Revisa el token y la conexión.");
    }

    return client;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        await startBot(loadConfig());
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
