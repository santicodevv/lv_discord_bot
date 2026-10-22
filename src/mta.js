import { isDiscordId } from "./config.js";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

export const mtaMessages = {
    "ERROR: Invalid API Key": "La clave privada del bot no coincide con MTA. Avísale a administración.",
    "ERROR: Missing account permissions": "Faltan permisos de cuentas nativas para lv_accounts. Administración debe aplicar el ACL actualizado o ejecutar aclrequest allow lv_accounts all.",
    "ERROR: Account not linked": "Esa cuenta nativa no está vinculada a este sistema de Discord. Contacta con administración.",
    "ERROR: Account creation failed": "MTA no pudo crear la cuenta nativa. Contacta con administración.",
    "ERROR: Account data unavailable": "MTA no pudo guardar o consultar la vinculación de la cuenta. Contacta con administración y genera un código nuevo.",
    "ERROR: Password change failed": "MTA no pudo cambiar la contraseña de la cuenta. Contacta con administración.",
    "ERROR: Native login failed": "Las credenciales se guardaron, pero MTA rechazó el inicio de sesión. Vuelve a conectar o contacta con administración.",
    "ERROR: Invalid Discord ID": "No se pudo validar tu ID de Discord.",
    "ERROR: Invalid code format": "El código debe tener 9 letras o números.",
    "ERROR: Code invalid or expired": "El código no existe, caducó o corresponde a otra operación. Genera uno nuevo en MTA.",
    "ERROR: Player disconnected": "Debes permanecer conectado a MTA mientras verificas el código.",
    "ERROR: Already logged in": "Ya tienes una sesión iniciada en MTA.",
    "ERROR: Account already online": "Tu cuenta ya está conectada en otro equipo. Desconéctala antes de recuperarla.",
    "ERROR: Discord ID already registered": "Este Discord ya tiene una cuenta. Usa RECUPERAR en MTA y luego /recuperar.",
    "ERROR: Account not found for this Discord": "No existe una cuenta vinculada a este Discord. Usa el Discord original o registra una cuenta.",
    "ERROR: Serial account limit": "Este equipo alcanzó el límite de cuentas. Contacta con administración.",
    "ERROR: Database unavailable": "MTA no pudo guardar la operación. Inténtalo nuevamente en unos segundos.",
    "ERROR: Password generation failed": "MTA no pudo generar las credenciales. Contacta con administración.",
    "ERROR: Missing ACL permissions": "Faltan permisos ACL para lv_accounts. Ejecuta en la consola de MTA: aclrequest allow lv_accounts all",
    "ERROR: ACL group unavailable": "Ese grupo ACL no existe o no se puede administrar desde el bot.",
    "ERROR: Target not linked": "Ese usuario no tiene una cuenta vinculada en el servidor. Debe registrarse primero.",
    "ERROR: Already member": "Ese usuario ya pertenece a ese grupo ACL.",
    "ERROR: Not a member": "Ese usuario no pertenece a ese grupo ACL.",
    "ERROR: ACL change failed": "MTA no pudo cambiar el grupo ACL.",
    "ERROR: ACL not saved": "El cambio se aplicó en MTA, pero no se pudo guardar en acl.xml. Revisa la consola del servidor.",
    "ERROR: Characters unavailable": "El sistema de personajes no está disponible. Revisa lv_character.",
    "ERROR: Character required": "Selecciona el personaje concreto al que quieres cambiar la ACL.",
    "ERROR: Character not owned": "Ese personaje no existe, fue eliminado o no pertenece al Discord seleccionado.",
    "ERROR: Free slot protected": "El slot inicial gratuito es permanente y no se puede retirar.",
    "ERROR: Invalid slot": "Ese número de slot no existe en la configuración del servidor.",
    "ERROR: Invalid action": "La operación solicitada no es válida.",
    "ERROR: Slot busy": "Hay una operación de personajes o slots en curso para esa cuenta. Espera e inténtalo de nuevo.",
    "ERROR: Invalid slot request": "No se pudo validar la solicitud de cambio de slots.",
};

export function normalizeCode(value) {
    const code = typeof value === "string" ? value.trim().toUpperCase() : "";
    return /^[A-Z0-9]{9}$/.test(code) ? code : null;
}

export async function callMtaValues(config, method, args, fetcher = fetch) {
    const methods = [
        "pingBot",
        "verifyAccountFromBot",
        "recoverAccountFromBot",
        "listAclGroupsFromBot",
        "addAclFromBot",
        "removeAclFromBot",
        "listCharactersFromBot",
        "setSlotFromBot",
    ];

    if (!methods.includes(method)) {
        throw new Error("Operación de MTA no permitida.");
    }

    const url = new URL(
        "/" + encodeURIComponent(config.resource) + "/call/" + method,
        config.baseUrl,
    );
    let response;

    try {
        response = await fetcher(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify([config.apiKey, ...args]),
            signal: AbortSignal.timeout(config.timeoutMs),
            redirect: "error",
        });
    } catch {
        throw new Error(
            "No se recibió confirmación de MTA. Revisa si ya entraste al juego antes de repetir el mismo código.",
        );
    }

    if (response.status === 401 || response.status === 403) {
        throw new Error("MTA rechazó el acceso HTTP. Aplica mta-acl.xml para permitir el acceso sin cuenta a este recurso.");
    }

    if (!response.ok) {
        throw new Error("MTA no está disponible (HTTP " + response.status + "). Revisa el recurso y el puerto HTTP.");
    }

    let values;

    try {
        values = await response.json();
    } catch {
        throw new Error("La dirección configurada no devolvió una respuesta válida de MTA.");
    }

    if (!Array.isArray(values) || typeof values[0] !== "string") {
        throw new Error("Formato de respuesta de MTA inesperado.");
    }

    return values;
}

export async function callMta(config, method, args, fetcher = fetch) {
    const values = await callMtaValues(config, method, args, fetcher);
    return values[0];
}

export async function listAclGroups(config, fetcher = fetch) {
    const values = await callMtaValues(config, "listAclGroupsFromBot", [], fetcher);

    if (values[0] !== "SUCCESS") {
        throw new Error(mtaMessages[values[0]] ?? "MTA no pudo listar los grupos ACL.");
    }

    return typeof values[1] === "string" && values[1] ? values[1].split("\n") : [];
}

export async function listCharacters(config, targetId, fetcher = fetch) {
    if (!isDiscordId(targetId)) {
        throw new Error("Selecciona primero un usuario de Discord válido.");
    }
    const values = await callMtaValues(config, "listCharactersFromBot", [targetId], fetcher);
    if (values[0] !== "SUCCESS") {
        throw new Error(mtaMessages[values[0]] ?? "MTA no pudo listar los personajes.");
    }
    return typeof values[1] === "string" && values[1]
        ? values[1].split("\n").map((line) => {
            const [id, ...name] = line.split("\t");
            return { id, name: name.join(" ") };
        }).filter((character) => /^[1-9]\d*$/.test(character.id))
        : [];
}

export async function changeAcl(config, action, executorId, targetId, group, characterId, fetcher = fetch) {
    if (!isDiscordId(executorId) || !isDiscordId(targetId) || !["add", "remove"].includes(action)
        || typeof group !== "string" || !group || group.length > 64
        || !/^[1-9]\d*$/.test(String(characterId)) || !Number.isSafeInteger(Number(characterId))) {
        throw new Error("Datos inválidos para cambiar la ACL.");
    }

    const method = action === "add" ? "addAclFromBot" : "removeAclFromBot";
    const result = await callMta(config, method, [executorId, targetId, group, Number(characterId)], fetcher);

    if (result !== "SUCCESS") {
        throw new Error(mtaMessages[result] ?? "MTA no pudo cambiar la ACL. Contacta con administración.");
    }

    return result;
}

export async function changeSlot(config, action, executorId, targetId, slot, fetcher = fetch, wait = delay, requestId = randomUUID()) {
    if (!isDiscordId(executorId) || !isDiscordId(targetId) || !["add", "remove"].includes(action)
        || !Number.isSafeInteger(slot) || slot < 2) {
        throw new Error("Selecciona un usuario válido y un slot adicional desde el 2. El inicial no se puede retirar.");
    }
    const args = [executorId, targetId, slot, action, requestId];
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const result = await callMta(config, "setSlotFromBot", args, fetcher);
        if (result === "SUCCESS") {
            return result;
        }
        if (result !== "PENDING") {
            throw new Error(mtaMessages[result] ?? "MTA no pudo cambiar los slots.");
        }
        await wait(250);
    }
    throw new Error("El cambio de slot sigue pendiente de confirmación. Comprueba el resultado antes de repetir la operación.");
}

export async function verifyWithMta(config, action, userId, input, fetcher = fetch) {
    const code = normalizeCode(input);

    if (!isDiscordId(userId) || !code || !["register", "recover"].includes(action)) {
        throw new Error("Datos de verificación inválidos. Copia el código de 9 caracteres desde MTA.");
    }

    const method = action === "register" ? "verifyAccountFromBot" : "recoverAccountFromBot";
    const result = await callMta(config, method, [userId, code], fetcher);

    if (result !== "SUCCESS") {
        throw new Error(mtaMessages[result] ?? "MTA no pudo completar la operación. Contacta con administración.");
    }

    return result;
}
