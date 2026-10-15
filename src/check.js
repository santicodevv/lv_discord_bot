import { loadConfig } from "./config.js";
import { callMta, mtaMessages } from "./mta.js";

try {
    const config = loadConfig();
    console.log("Configuración local válida.");
    const result = await callMta(config.mta, "pingBot", []);

    if (result !== "PONG") {
        throw new Error(mtaMessages[result] ?? "MTA no confirmó la conexión.");
    }

    console.log("MTA respondió correctamente sin cuenta técnica. El acceso HTTP y la clave privada funcionan.");
    const invite = new URL("https://discord.com/oauth2/authorize");
    invite.searchParams.set("client_id", config.discord.applicationId);
    invite.searchParams.set("scope", "bot applications.commands");
    invite.searchParams.set("permissions", "84992");
    console.log("Invitación del bot: " + invite);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
