import { isDiscordId } from "./config.js";

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

export async function changeAcl(config, action, executorId, targetId, group, fetcher = fetch) {
    if (!isDiscordId(executorId) || !isDiscordId(targetId) || !["add", "remove"].includes(action)
        || typeof group !== "string" || !group || group.length > 64) {
        throw new Error("Datos inválidos para cambiar la ACL.");
    }

    const method = action === "add" ? "addAclFromBot" : "removeAclFromBot";
    const result = await callMta(config, method, [executorId, targetId, group], fetcher);

    if (result !== "SUCCESS") {
        throw new Error(mtaMessages[result] ?? "MTA no pudo cambiar la ACL. Contacta con administración.");
    }

    return result;
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
