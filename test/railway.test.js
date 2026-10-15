import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { loadConfig } from "../src/config.js";
import { startRailway } from "../src/start.js";
import { buildCommands } from "../src/commands.js";
import { isAclAuthorized } from "../src/acl.js";
import { verifyWithMta } from "../src/mta.js";

const env = {
    DISCORD_TOKEN: "test-token-never-log",
    DISCORD_APPLICATION_ID: "100000000000000001",
    DISCORD_GUILD_ID: "100000000000000002",
    DISCORD_CHANNEL_ID: "100000000000000003",
    MTA_BASE_URL: "https://mta.example.com",
    MTA_API_KEY: "test-key-" + "x".repeat(40),
};

function fixture(t, content) {
    const directory = mkdtempSync(join(tmpdir(), "lv-bot-test-"));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, "config.json");

    if (content !== undefined) {
        writeFileSync(path, content);
    }

    return path;
}

test("arranca con variables sin config.json", (t) => {
    const config = loadConfig(fixture(t), env);
    assert.equal(config.discord.token, env.DISCORD_TOKEN);
    assert.equal(config.mta.resource, "lv_accounts");
    assert.equal(config.mta.timeoutMs, 10000);
    assert.deepEqual(config.acl.allowedUserIds, []);
});

test("conserva config local y permite reemplazos explícitos", (t) => {
    const local = loadConfig(fixture(t), env);
    local.acl.allowedUserIds = ["100000000000000004"];
    const path = fixture(t, "\uFEFF" + JSON.stringify(local));
    assert.deepEqual(loadConfig(path, {}), local);
    const overridden = loadConfig(path, {
        MTA_BASE_URL: "http://147.135.31.154:31011",
        MTA_TIMEOUT_MS: "15000",
        ACL_ALLOWED_USER_IDS: "",
    });
    assert.equal(overridden.mta.baseUrl, "http://147.135.31.154:31011");
    assert.equal(overridden.mta.timeoutMs, 15000);
    assert.deepEqual(overridden.acl.allowedUserIds, []);
});

test("Railway ignora incluso un config.json local inválido", (t) => {
    const config = loadConfig(fixture(t, "invalid json"), {
        ...env,
        RAILWAY_PROJECT_ID: "test-project",
    });
    assert.equal(config.discord.token, env.DISCORD_TOKEN);
});

test("Railway no utiliza secretos locales si faltan variables", (t) => {
    const local = loadConfig(fixture(t), env);
    assert.throws(
        () => loadConfig(fixture(t, JSON.stringify(local)), { RAILWAY_ENVIRONMENT_ID: "test" }),
        /discord.token/,
    );
});

test("rechaza JSON malformado fuera de Railway sin revelar el contenido", (t) => {
    assert.throws(() => loadConfig(fixture(t, env.DISCORD_TOKEN), env), (error) => {
        assert.match(error.message, /formato JSON/);
        assert.ok(!error.message.includes(env.DISCORD_TOKEN));
        return true;
    });
});

test("valida números, IDs y claves sin imprimir secretos", (t) => {
    assert.throws(() => loadConfig(fixture(t), {
        ...env,
        DISCORD_GUILD_ID: "invalid",
        MTA_TIMEOUT_MS: "NaN",
        COOLDOWN_SECONDS: "0",
        MTA_API_KEY: "short-secret",
    }), (error) => {
        for (const field of ["guildId", "timeoutMs", "cooldownSeconds", "apiKey"]) {
            assert.ok(error.message.includes(field));
        }
        assert.ok(!error.message.includes(env.DISCORD_TOKEN));
        assert.ok(!error.message.includes("short-secret"));
        return true;
    });
});

test("un secreto vacío no recupera silenciosamente el valor local", (t) => {
    const local = loadConfig(fixture(t), env);
    assert.throws(() => loadConfig(fixture(t, JSON.stringify(local)), { DISCORD_TOKEN: "" }), /discord.token/);
});

test("convierte listas ACL y conserva la autorización de administrador", (t) => {
    const config = loadConfig(fixture(t), {
        ...env,
        ACL_ALLOWED_USER_IDS: "100000000000000004, 100000000000000005",
    });
    const interaction = {
        user: { id: "100000000000000005" },
        memberPermissions: { has: (value) => value === PermissionFlagsBits.Administrator },
    };
    assert.equal(isAclAuthorized(interaction, config), true);
    interaction.memberPermissions.has = () => false;
    assert.equal(isAclAuthorized(interaction, config), false);
    assert.throws(() => loadConfig(fixture(t), { ...env, ACL_ALLOWED_ROLE_IDS: "bad" }), /allowedRoleIds/);
});

test("conserva los dos comandos ACL", () => {
    assert.deepEqual(buildCommands().map((command) => command.name), ["addacl", "removeacl"]);
});

test("registra comandos antes de iniciar el bot", async () => {
    const calls = [];
    const config = {};
    const result = await startRailway(config, {
        registerCommands: async (value) => { assert.equal(value, config); calls.push("commands"); },
        startBot: async (value) => { assert.equal(value, config); calls.push("start"); return "client"; },
    });
    assert.equal(result, "client");
    assert.deepEqual(calls, ["commands", "start"]);
});

test("un fallo de registro no inicia otra conexión ni revela errores privados", async () => {
    await assert.rejects(startRailway({}, {
        registerCommands: async () => { throw new Error(env.DISCORD_TOKEN); },
        startBot: async () => assert.fail("no debe iniciar"),
    }), (error) => {
        assert.match(error.message, /No se pudieron registrar/);
        assert.ok(!error.message.includes(env.DISCORD_TOKEN));
        return true;
    });
});

test("la verificación usa el endpoint público, ID como texto y clave sin cuenta HTTP", async (t) => {
    const config = loadConfig(fixture(t), env);
    const result = await verifyWithMta(config.mta, "register", "100000000000000004", "abc123def", async (url, options) => {
        assert.equal(url.href, "https://mta.example.com/lv_accounts/call/verifyAccountFromBot");
        assert.deepEqual(JSON.parse(options.body), [env.MTA_API_KEY, "100000000000000004", "ABC123DEF"]);
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(options.redirect, "error");
        return { ok: true, status: 200, json: async () => ["SUCCESS"] };
    });
    assert.equal(result, "SUCCESS");
});
