# Bot de cuentas · Level Roleplay

Bot de Discord para registrar y recuperar cuentas nativas de MTA mediante `lv_accounts`. Conserva el panel automático con menú y los comandos `/addacl` y `/removeacl`. El bot recibe las interacciones por Discord Gateway y llama al HTTP del servidor MTA con una clave privada; no necesita una cuenta técnica de MTA.

El acceso Discord identifica ahora la cuenta principal y `lv_character` crea sus personajes. `/addacl` y `/removeacl` requieren grupo, usuario de Discord y **personaje**. Selecciona primero el usuario para autocompletar sus personajes por nombre o ID. Las ACL se asignan únicamente a la cuenta interna del personaje elegido; no se copian a los demás personajes ni a la cuenta principal. Reinicia el bot tras actualizarlo para registrar la nueva opción. `npm test` comprueba estos comandos sin conectarse a Discord ni al servidor real.

Cada cuenta empieza con un personaje gratuito en el slot 1. El personal autorizado puede habilitar los slots adicionales con `/addslot usuario:@Persona slot:2` y retirarlos con `/removeslot usuario:@Persona slot:2`, también para el slot 3. Ambos comandos actúan sobre la cuenta principal de Discord, funcionan aunque su dueño esté desconectado y reutilizan las listas de autorización de administración ACL. El slot 1 no se puede retirar y la protección se comprueba tanto en el bot como en MTA. El resultado se confirma después de guardar el cambio; retirar un slot ocupado bloquea la selección de su personaje sin borrarlo. Una sesión en curso puede terminar y queda bloqueada al volver a entrar. Reinicia el bot para registrar estos dos comandos. No son comandos del juego ni requieren nuevas variables privadas.

## Desplegar desde GitHub en Railway

1. Crea un repositorio privado de GitHub y sube el contenido del paquete limpio, con `Dockerfile`, `railway.json` y `package.json` en la raíz. Incluye los archivos que empiezan con punto. No subas el ZIP como un único archivo.
2. En Railway crea un proyecto con **Deploy from GitHub repo**, conecta GitHub y selecciona ese repositorio.
3. En el servicio abre **Variables → Raw Editor**. Importa el contenido de `railway-variables.private.env`, guardado fuera del repositorio. Este archivo contiene tus credenciales reales: se pega en Railway, nunca se sube a GitHub. `.env.example` es solo una plantilla.
4. Revisa `MTA_BASE_URL`: está preparada como `http://147.135.31.154:31011`, suponiendo que el hosting tenga `<httpserver>1</httpserver>` y `<httpport>31011</httpport>`. `30011` es el puerto del juego; `32011` se reservó para las descargas. El TCP `31011` debe ser accesible desde Railway. La conexión externa todavía debe comprobarse en el hosting.
5. Copia el recurso MTA completo al hosting, incluido su archivo privado `files/bot-config.json`. Su clave debe coincidir con `MTA_API_KEY`. Aplica los permisos HTTP y de cuentas nativas de `lv_accounts` e inicia el recurso. Para los comandos ACL, el recurso del hosting también debe incluir sus exports y permisos ACL correspondientes.
6. Detén el proceso local del bot antes de activar el despliegue. Deja una sola réplica y una sola región. No habilites despliegues de prueba/PR con el mismo token.
7. Aplica las variables y despliega. Si el primer intento arrancó antes de configurarlas, vuelve a desplegar. En los logs deben aparecer `Comandos de Discord registrados.`, `Bot conectado como ...` y la confirmación del panel.

El `Dockerfile` instala las dependencias con `npm ci` y ejecuta `node src/start.js` con Node 22. El arranque registra los comandos, comprueba MTA y conecta a Discord. El panel se publica automáticamente o se actualiza si aparece entre los últimos 100 mensajes del canal.

`railway.json` define una réplica, suspensión automática desactivada y hasta diez reinicios ante fallos. El bot no sirve una web: no configures dominio público, puerto de escucha ni healthcheck HTTP. No necesita base de datos ni volumen en Railway; las cuentas y permisos permanecen en MTA. El cierre con SIGTERM desconecta al bot.

Al conectar el repositorio, Railway puede desplegar los cambios de la rama elegida automáticamente. Mantén una sola instancia activa de este bot.

## Variables

| Variable | Valor |
| --- | --- |
| `DISCORD_TOKEN` | Token del bot de Discord. Secreto. |
| `DISCORD_APPLICATION_ID` | ID de esa aplicación. |
| `DISCORD_GUILD_ID` | ID de tu servidor de Discord. |
| `DISCORD_CHANNEL_ID` | ID del canal del panel. |
| `MTA_BASE_URL` | URL base del HTTP de MTA, sin rutas. |
| `MTA_API_KEY` | Misma clave privada que en MTA, mínimo 32 caracteres. |
| `MTA_RESOURCE` | Opcional; `lv_accounts`. |
| `MTA_TIMEOUT_MS` | Opcional; `10000`, entre 1000 y 30000. |
| `COOLDOWN_SECONDS` | Opcional; `5`, entre 1 y 60. |
| `ACL_ALLOWED_USER_IDS` | IDs autorizados separados por comas. Vacío: ninguna excepción por usuario. |
| `ACL_ALLOWED_ROLE_IDS` | IDs de roles autorizados separados por comas. Vacío: ninguna excepción por rol. |
| `PANEL_TITLE` | Título del panel. |
| `PANEL_DESCRIPTION` | Descripción del panel. |
| `PANEL_COLOR` | Color hexadecimal, por ejemplo `#D9015D`. |

Los comandos ACL exigen el permiso Administrador de Discord y, además, ser propietario del servidor o pertenecer a una de las listas autorizadas. MTA conserva su propia validación. Las variables privadas preparadas mantienen tu lista actual de autorizados.

Railway usa exclusivamente sus variables y omite `config.json` y `.env`. Localmente el bot carga automáticamente el archivo `.env` de su carpeta y `config.json` si existe. Las variables ya definidas en el proceso tienen prioridad sobre `.env`, y ambas tienen prioridad sobre `config.json`. Esto funciona con `npm start`, `npm run check` y `npm run commands` sin flags adicionales.

La conexión HTTP directa transmite la clave sin cifrar. Para protegerla en Internet, publica el HTTP de MTA detrás de un proxy HTTPS y sustituye `MTA_BASE_URL` por ese dominio. Un dominio del bot en Railway no protege la conexión hacia MTA.

## Discord

Invita la aplicación con los scopes `bot` y `applications.commands`. En el canal necesita **View Channel**, **Send Messages**, **Embed Links** y **Read Message History**. No requiere intents privilegiados ni Interactions Endpoint URL.

El registro de comandos reemplaza los comandos de esta aplicación en el servidor configurado: utiliza una aplicación dedicada. No existe `/panel-cuentas`; el panel es automático. Los botones de paneles antiguos no se usan.

## Uso local

Con Node.js 22.12 o superior, define las variables de entorno indicadas arriba. `.env.example` contiene sus nombres y valores de ejemplo.

```powershell
npm ci
npm run check
npm run commands
npm start
```

`npm start` y `npm run start:railway` registran comandos y arrancan en una sola ejecución.

## Diagnóstico

- Error de configuración: completa las variables indicadas; no cambies los IDs por nombres.
- Error al registrar comandos: revisa token, aplicación, servidor e invitación.
- MTA no responde: confirma IP, puerto HTTP, firewall, recurso iniciado y que el hosting permita conexiones desde Railway.
- HTTP 401/403: revisa la ACL del acceso HTTP sin cuenta para `resource.lv_accounts.http`.
- Clave inválida: iguala `MTA_API_KEY` con la clave privada del recurso del hosting.
- No aparece el panel: revisa el ID del canal y sus cuatro permisos. El motivo aparece en los logs.
- Se agotaron los reinicios: corrige la causa y reinicia el despliegue en Railway.

Nunca publiques `config.json`, `.env`, `railway-variables.private.env` ni el archivo privado del recurso MTA. `.gitignore` los excluye de Git, y el contenedor solo copia el código y los manifiestos de dependencias.

Referencias: [configuración de Railway](https://docs.railway.com/config-as-code/reference) y [Dockerfiles](https://docs.railway.com/builds/dockerfiles).
