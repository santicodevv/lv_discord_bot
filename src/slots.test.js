import assert from "node:assert/strict";
import test from "node:test";
import { buildCommands } from "./commands.js";
import { changeSlot } from "./mta.js";
import { createSlotHandler, isSlotInteraction } from "./slots.js";

const executor = "123456789012345678";
const target = "223456789012345678";
const config = { baseUrl: "http://localhost:22005", resource: "lv_accounts", apiKey: "test-only", timeoutMs: 1000 };

test("Discord slot commands select an owner and exclude the free slot", () => {
    const commands = buildCommands().filter((command) => ["addslot", "removeslot"].includes(command.name));
    assert.equal(commands.length, 2);
    for (const command of commands) {
        assert.equal(command.options.find((option) => option.name === "usuario").required, true);
        const slot = command.options.find((option) => option.name === "slot");
        assert.equal(slot.type, 4);
        assert.equal(slot.min_value, 2);
        assert.equal(slot.required, true);
        assert.ok(command.default_member_permissions);
    }
});

test("slot changes wait for persistence and reuse the same request ID", async () => {
    let calls = 0;
    const requests = [];
    const result = await changeSlot(config, "add", executor, target, 2, async (url, options) => {
        assert.ok(String(url).endsWith("/call/setSlotFromBot"));
        requests.push(JSON.parse(options.body));
        calls += 1;
        return { ok: true, json: async () => [calls === 1 ? "PENDING" : "SUCCESS"] };
    }, async () => {}, "request-0000000001");
    assert.equal(result, "SUCCESS");
    assert.equal(calls, 2);
    assert.deepEqual(requests[0], ["test-only", executor, target, 2, "add", "request-0000000001"]);
    assert.deepEqual(requests[1], requests[0]);
});

test("free slots and malformed slot numbers never reach MTA", async () => {
    let called = false;
    const fetcher = async () => { called = true; };
    for (const slot of [0, 1, 2.5, NaN, Infinity, "2"]) {
        await assert.rejects(changeSlot(config, "remove", executor, target, slot, fetcher), /inicial/);
    }
    assert.equal(called, false);
});

test("protected slots and storage failures are never reported as success", async () => {
    for (const error of ["ERROR: Invalid slot", "ERROR: Database unavailable", "ERROR: Free slot protected"]) {
        await assert.rejects(changeSlot(config, "remove", executor, target, 2, async () => ({
            ok: true, json: async () => [error],
        })));
    }
});

test("pending requests time out without confirming an unfinished change", async () => {
    await assert.rejects(changeSlot(config, "add", executor, target, 2, async () => ({
        ok: true, json: async () => ["PENDING"],
    }), async () => {}), /pendiente/);
});

function interaction(authorized = true, slot = 2) {
    return {
        commandName: "addslot", guildId: "guild", guild: { ownerId: executor }, user: { id: executor },
        memberPermissions: { has: () => authorized }, member: { roles: [] },
        isChatInputCommand: () => true,
        options: { getUser: () => ({ id: target, bot: false }), getInteger: () => slot },
        reply: async function (value) { this.response = value; },
        deferReply: async function () { this.deferred = true; },
        editReply: async function (value) { this.response = value; },
    };
}

test("only authorized administrators can change another Discord account's slots", async () => {
    let calls = 0;
    const handler = createSlotHandler({ discord: { guildId: "guild" }, mta: config }, {
        changeSlot: async (...args) => {
            calls += 1;
            assert.deepEqual(args, [config, "add", executor, target, 2]);
        },
    });
    const denied = interaction(false);
    await handler(denied);
    assert.equal(calls, 0);
    assert.match(denied.response.content, /autorización/);
    const protectedSlot = interaction(true, 1);
    await handler(protectedSlot);
    assert.equal(calls, 0);
    const allowed = interaction();
    assert.equal(isSlotInteraction(allowed), true);
    await handler(allowed);
    assert.equal(calls, 1);
    assert.match(allowed.response.content, /habilitado/);
    assert.deepEqual(allowed.response.allowedMentions, { parse: [] });
});
