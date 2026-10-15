import { readFileSync } from "node:fs";

export function loadConfig(path = new URL("../config.json", import.meta.url), env = process.env) {
    let file = {};

    if (!env.RAILWAY_PROJECT_ID && !env.RAILWAY_ENVIRONMENT_ID) {
        try {
            file = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
        } catch (error) {
            if (error.code !== "ENOENT") {
                throw new Error("No se pudo leer config.json. Comprueba sus permisos y el formato JSON.");
            }
        }

        if (!file || typeof file !== "object" || Array.isArray(file)) {
            throw new Error("config.json debe contener un objeto JSON.");
        }
    }

    const config = {
        discord: {
            token: env.DISCORD_TOKEN ?? file.discord?.token,
            applicationId: env.DISCORD_APPLICATION_ID ?? file.discord?.applicationId,
            guildId: env.DISCORD_GUILD_ID ?? file.discord?.guildId,
            channelId: env.DISCORD_CHANNEL_ID ?? file.discord?.channelId,
        },
        mta: {
            baseUrl: env.MTA_BASE_URL ?? file.mta?.baseUrl,
            resource: env.MTA_RESOURCE ?? file.mta?.resource ?? "lv_accounts",
            apiKey: env.MTA_API_KEY ?? file.mta?.apiKey,
            timeoutMs: env.MTA_TIMEOUT_MS !== undefined
                ? Number(env.MTA_TIMEOUT_MS)
                : file.mta?.timeoutMs ?? 10000,
        },
        cooldownSeconds: env.COOLDOWN_SECONDS !== undefined
            ? Number(env.COOLDOWN_SECONDS)
            : file.cooldownSeconds ?? 5,
        panel: {
            title: env.PANEL_TITLE ?? file.panel?.title ?? "Level Roleplay — Acceso al servidor",
            description: env.PANEL_DESCRIPTION ?? file.panel?.description
                ?? "Para jugar necesitas vincular tu cuenta de Discord con el juego. Todo es privado: solo tú ves las respuestas del bot.",
            color: env.PANEL_COLOR ?? file.panel?.color ?? "#D9015D",
        },
        acl: {
            allowedUserIds: parseIds(env.ACL_ALLOWED_USER_IDS, file.acl?.allowedUserIds),
            allowedRoleIds: parseIds(env.ACL_ALLOWED_ROLE_IDS, file.acl?.allowedRoleIds),
        },
    };

    const errors = validateConfig(config);

    if (errors.length) {
        throw new Error("Revisa las variables de entorno o config.json:\n- " + errors.join("\n- "));
    }

    return config;
}

function parseIds(value, fallback) {
    if (value === undefined) {
        return fallback ?? [];
    }

    return value.trim() ? value.split(",").map((id) => id.trim()) : [];
}

export function isDiscordId(value) {
    return typeof value === "string"
        && /^[1-9]\d{16,19}$/.test(value)
        && BigInt(value) <= 18446744073709551615n;
}

export function validateConfig(config) {
    const errors = [];

    if (typeof config?.discord?.token !== "string" || !config.discord.token.trim()) {
        errors.push("discord.token: token del bot");
    }

    for (const key of ["applicationId", "guildId", "channelId"]) {
        if (!isDiscordId(config?.discord?.[key])) {
            errors.push("discord." + key + ": ID de Discord entre comillas");
        }
    }

    try {
        const url = new URL(config?.mta?.baseUrl);

        if (!["http:", "https:"].includes(url.protocol)
            || url.username || url.password || url.search || url.hash
            || !["", "/"].includes(url.pathname)) {
            throw new Error();
        }
    } catch {
        errors.push("mta.baseUrl: URL HTTP de MTA, por ejemplo http://127.0.0.1:22005");
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(config?.mta?.resource ?? "")) {
        errors.push("mta.resource: nombre del recurso");
    }

    for (const key of ["apiKey"]) {
        if (typeof config?.mta?.[key] !== "string" || !config.mta[key].trim()) {
            errors.push("mta." + key + ": valor requerido");
        }
    }

    if (typeof config?.mta?.apiKey === "string" && config.mta.apiKey.length < 32) {
        errors.push("mta.apiKey: mínimo 32 caracteres, igual a files/bot-config.json");
    }

    if (!Number.isInteger(config?.mta?.timeoutMs)
        || config.mta.timeoutMs < 1000 || config.mta.timeoutMs > 30000) {
        errors.push("mta.timeoutMs: entero entre 1000 y 30000");
    }

    if (!Number.isInteger(config?.cooldownSeconds)
        || config.cooldownSeconds < 1 || config.cooldownSeconds > 60) {
        errors.push("cooldownSeconds: entero entre 1 y 60");
    }

    if (!/^#[0-9a-f]{6}$/i.test(config?.panel?.color ?? "")
        || typeof config?.panel?.title !== "string" || !config.panel.title
        || config.panel.title.length > 256
        || typeof config?.panel?.description !== "string"
        || !config.panel.description || config.panel.description.length > 3000) {
        errors.push("panel: título, descripción y color hexadecimal válidos");
    }

    for (const key of ["allowedUserIds", "allowedRoleIds"]) {
        const ids = config?.acl?.[key];

        if (ids !== undefined && (!Array.isArray(ids) || !ids.every(isDiscordId))) {
            errors.push("acl." + key + ": lista de IDs de Discord entre comillas");
        }
    }

    return errors;
}
