import assert from "node:assert/strict";
import test from "node:test";
import worker from "../worker/index.js";

class MemoryD1 {
  constructor() {
    this.v1 = new Map();
    this.v2 = new Map();
    this.v3 = new Map();
    this.reports = new Map();
    this.buckets = new Map();
    this.guards = new Map();
    this.alerts = [];
  }

  prepare(sql) {
    const db = this;
    return {
      values: [],
      bind(...values) { this.values = values; return this; },
      async first() {
        const v = this.values;
        if (sql.startsWith("SELECT ciphertext, iv FROM sage_user_keys_v3")) return db.v3.get(v[0]) ?? null;
        if (sql.startsWith("SELECT ciphertext, iv FROM sage_user_keys_v2")) return db.v2.get(v[0]) ?? null;
        if (sql.startsWith("SELECT ciphertext, iv FROM sage_user_keys WHERE")) return db.v1.get(v[0]) ?? null;
        if (sql.startsWith("SELECT 1 AS present FROM sage_user_keys_v3")) return db.v3.has(v[0]) || db.v2.has(v[1]) || db.v1.has(v[2]) ? { present: 1 } : null;
        if (sql.startsWith("SELECT report_date")) return db.reports.get(v[0]) ?? null;
        if (sql.startsWith("SELECT blocked_until")) return db.guards.get(v[0]) ?? null;
        if (sql.startsWith("SELECT COALESCE(SUM(decision_count)")) {
          let total = 0;
          for (const [key, count] of db.buckets) if (key.startsWith(`${v[0]}:`) && Number(key.split(":")[1]) >= v[1]) total += count;
          return { total };
        }
        if (sql.startsWith("SELECT id FROM sage_security_alerts")) return null;
        if (sql.startsWith("SELECT id, kind, rolling_count")) return db.alerts.find((a) => a.user_id === v[0] && a.notified_at == null) ?? null;
        throw new Error(`Unhandled D1 first(): ${sql}`);
      },
      async run() {
        const v = this.values;
        if (sql.startsWith("CREATE TABLE IF NOT EXISTS")) return { success: true };
        if (sql.startsWith("INSERT INTO sage_user_keys_v3")) { db.v3.set(v[0], { ciphertext: v[1], iv: v[2], updated_at: v[3] }); return { success: true }; }
        if (sql.startsWith("DELETE FROM sage_user_keys_v3")) { db.v3.delete(v[0]); return { success: true }; }
        if (sql.startsWith("DELETE FROM sage_user_keys_v2")) { db.v2.delete(v[0]); return { success: true }; }
        if (sql.startsWith("DELETE FROM sage_user_keys WHERE")) { db.v1.delete(v[0]); return { success: true }; }
        if (sql.startsWith("INSERT INTO sage_usage_buckets")) { const key = `${v[0]}:${v[1]}`; db.buckets.set(key, (db.buckets.get(key) ?? 0) + 1); return { success: true }; }
        if (sql.startsWith("DELETE FROM sage_usage_buckets")) return { success: true };
        if (sql.startsWith("INSERT INTO sage_guard_state")) { db.guards.set(v[0], { blocked_until: v[1], trigger_count: v[2] }); return { success: true }; }
        if (sql.startsWith("INSERT INTO sage_security_alerts")) { db.alerts.push({ id: db.alerts.length + 1, user_id: v[0], kind: v[1], rolling_count: v[2], created_at: v[3], notified_at: null }); return { success: true }; }
        if (sql.startsWith("UPDATE sage_security_alerts")) { const row = db.alerts.find((a) => a.id === v[1] && a.user_id === v[2]); if (row) row.notified_at = v[0]; return { success: true }; }
        if (sql.startsWith("INSERT INTO screening_reports")) { db.reports.set(v[0], { report_date: v[1], total: v[2], needs_review: v[3], low_value: v[4], scams: v[5] }); return { success: true }; }
        throw new Error(`Unhandled D1 run(): ${sql}`);
      },
    };
  }
}

function request(path, { method = "GET", body, origin = "https://private.example", user = "user-123" } = {}) {
  const headers = new Headers({ "oai-authenticated-user-id": user });
  if (origin) headers.set("origin", origin);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://private.example${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function encryptV2ForTest(value, masterB64, userId) {
  const master = await crypto.subtle.importKey("raw", Buffer.from(masterB64, "base64"), "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new TextEncoder().encode("sage-levanto-key-v2"), info: new TextEncoder().encode(userId) }, master, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return { ciphertext: Buffer.from(ciphertext).toString("base64"), iv: Buffer.from(iv).toString("base64") };
}

test("dashboard key flow encrypts at rest, screens through Sage, and deletes cleanly", async () => {
  const db = new MemoryD1();
  const env = { DB: db, SAGE_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
  const sageKey = "sage_test_key_that_must_not_be_stored_in_plaintext";

  let response = await worker.fetch(request("/api/dashboard"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { key_configured: false, report: null });
  assert.equal(response.headers.get("cache-control"), "no-store");

  response = await worker.fetch(request("/api/sage-key", { method: "PUT", origin: "https://attacker.example", body: { api_key: sageKey } }), env);
  assert.equal(response.status, 403);
  assert.equal(db.v3.size, 0);

  response = await worker.fetch(request("/api/sage-key", { method: "PUT", body: { api_key: sageKey } }), env);
  assert.equal(response.status, 200);
  const stored = db.v3.get("user-123");
  assert.ok(stored);
  assert.notEqual(stored.ciphertext, sageKey);
  assert.equal(JSON.stringify(stored).includes(sageKey), false);

  response = await worker.fetch(request("/api/dashboard"), env);
  const dashboard = await response.json();
  assert.deepEqual(dashboard, { key_configured: true, report: null });
  assert.equal(JSON.stringify(dashboard).includes(sageKey), false);

  const originalFetch = globalThis.fetch;
  let observedAuthorization;
  globalThis.fetch = async (_url, init) => {
    observedAuthorization = new Headers(init.headers).get("authorization");
    return Response.json({ result: { chosen: "SECOND_PASS", probability: 0.91, probabilities: [{ option: "SECOND_PASS", probability: 0.91 }] }, meta: { model: "test-model" } });
  };
  try {
    response = await worker.fetch(request("/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sage_screen_recruiter_message", arguments: { message: { id: "msg-1", received_at: "2026-10-27T09:00:00Z", source: "gmail", from: "Recruiter <recruiter@example.com>", subject: "Role", body: "Can we discuss a role?", profile_verification: "not_checked" } } } } }), env);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(observedAuthorization, `Bearer ${sageKey}`);
  const rpc = await response.json();
  const result = JSON.parse(rpc.result.content[0].text);
  assert.equal(result.classification, "SECOND_PASS");
  assert.equal(JSON.stringify(rpc).includes(sageKey), false);

  response = await worker.fetch(request("/api/sage-key", { method: "DELETE" }), env);
  assert.equal(response.status, 200);
  assert.equal(db.v3.size, 0);
});

test("private routes require the Sites authenticated user header", async () => {
  const env = { DB: new MemoryD1(), SAGE_KEY_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") };
  const response = await worker.fetch(request("/api/dashboard", { user: "" }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Sign in to Sage Levanto before using private credentials or reports.");
});

test("MCP tools declare review annotations and reject a malformed master secret", async () => {
  let response = await worker.fetch(request("/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 3, method: "tools/list" } }), {});
  const listed = await response.json();
  assert.ok(listed.result.tools.length >= 6);
  for (const tool of listed.result.tools) {
    assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
    assert.equal(typeof tool.annotations.openWorldHint, "boolean");
    assert.equal(typeof tool.annotations.destructiveHint, "boolean");
  }

  const db = new MemoryD1();
  response = await worker.fetch(request("/api/sage-key", { method: "PUT", body: { api_key: "sage_test_key_that_is_long_enough" } }), { DB: db, SAGE_KEY_ENCRYPTION_KEY: Buffer.alloc(16, 1).toString("base64") });
  assert.equal(response.status, 500);
  assert.equal(db.v3.size, 0);
  assert.equal((await response.json()).error, "The private request could not be completed.");
});

test("a deployed v2 key migrates to authenticated v3 storage on first use", async () => {
  const db = new MemoryD1();
  const master = Buffer.alloc(32, 11).toString("base64");
  const sageKey = "sage_existing_v2_key_for_migration_test";
  db.v2.set("user-123", await encryptV2ForTest(sageKey, master, "user-123"));
  const env = { DB: db, SAGE_KEY_ENCRYPTION_KEY: master };

  const originalFetch = globalThis.fetch;
  let authorization;
  globalThis.fetch = async (_url, init) => {
    authorization = new Headers(init.headers).get("authorization");
    return Response.json({ result: { chosen: "SECOND_PASS", probability: 0.8, probabilities: [{ option: "SECOND_PASS", probability: 0.8 }] }, meta: { model: "test-model" } });
  };
  try {
    await worker.fetch(request("/mcp", { method: "POST", body: { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "sage_screen_recruiter_message", arguments: { message: { id: "msg-2", received_at: "2026-10-27T09:00:00Z", from: "Recruiter", subject: "Role", body: "A concrete role" } } } } }), env);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(authorization, `Bearer ${sageKey}`);
  assert.equal(db.v2.has("user-123"), false);
  assert.equal(db.v3.has("user-123"), true);
  assert.equal(JSON.stringify(db.v3.get("user-123")).includes(sageKey), false);
});
