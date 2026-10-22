import assert from "node:assert/strict";
import test from "node:test";
import { PermissionFlagsBits } from "discord.js";
import { buildCommands } from "./commands.js";
import { createAclHandler } from "./acl.js";
import { changeAcl, listCharacters } from "./mta.js";

const owner = "123456789012345678";
const target = "223456789012345678";
const config = { resource: "lv_accounts", baseUrl: "http://localhost:22005", apiKey: "test-only", timeoutMs: 1000 };

test("ACL command requires an explicit character and autocompletes it", () => {
    for (const command of buildCommands().filter((entry) => ["addacl", "removeacl"].includes(entry.name))) {
        const character = command.options.find((option) => option.name === "personaje");
        assert.equal(character.required, true);
        assert.equal(character.autocomplete, true);
        assert.ok(command.options.findIndex((option) => option.name === "usuario") < command.options.indexOf(character));
    }
});

test("character listing handles MTA's return values without exposing native account names", async () => {
    const rows = await listCharacters(config, target, async (_url, options) => {
        assert.deepEqual(JSON.parse(options.body), ["test-only", target]);
        return { ok: true, json: async () => ["SUCCESS", "12\tAna Rivera\n13\tCarlos Rivera"] };
    });
    assert.deepEqual(rows, [{ id: "12", name: "Ana Rivera" }, { id: "13", name: "Carlos Rivera" }]);
});

test("ACL request sends the Discord owner and concrete character ID", async () => {
    await changeAcl(config, "add", owner, target, "Police", "12", async (url, options) => {
        assert.ok(String(url).endsWith("/call/addAclFromBot"));
        assert.deepEqual(JSON.parse(options.body), ["test-only", owner, target, "Police", 12]);
        return { ok: true, json: async () => ["SUCCESS"] };
    });
    await assert.rejects(changeAcl(config, "add", owner, target, "Police", undefined), /inválidos/);
    await assert.rejects(changeAcl(config, "add", owner, target, "Police", "1.5"), /inválidos/);
});

test("server ownership rejection is explained to the administrator", async () => {
    await assert.rejects(changeAcl(config, "add", owner, target, "Police", "12", async () => ({
        ok: true, json: async () => ["ERROR: Character not owned"],
    })), /no pertenece/);
});

function autocomplete(authorized = true) {
    return {
        guildId: "guild", guild: { ownerId: owner }, user: { id: owner },
        memberPermissions: { has: (permission) => authorized && permission === PermissionFlagsBits.Administrator },
        member: { roles: [] },
        options: {
            getFocused: () => ({ name: "personaje", value: "ana" }),
            get: () => ({ value: target }),
        },
        isAutocomplete: () => true,
        respond: async function (choices) { this.choices = choices; },
    };
}

test("autocomplete only lists the selected Discord user's characters", async () => {
    const interaction = autocomplete();
    const handler = createAclHandler({ discord: { guildId: "guild" }, mta: config }, {
        listCharacters: async (_config, user) => {
            assert.equal(user, target);
            return [{ id: "12", name: "Ana Rivera" }, { id: "13", name: "Carlos Rivera" }];
        },
    });
    await handler(interaction);
    assert.deepEqual(interaction.choices, [{ name: "#12 · Ana Rivera", value: "12" }]);
});

test("unauthorized users cannot fetch character autocomplete", async () => {
    let called = false;
    const handler = createAclHandler({ discord: { guildId: "guild" }, mta: config }, {
        listCharacters: async () => { called = true; return []; },
    });
    const interaction = autocomplete(false);
    await handler(interaction);
    assert.deepEqual(interaction.choices, []);
    assert.equal(called, false);
});
