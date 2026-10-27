import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../worker/index.js", import.meta.url), "utf8");
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const worker = await import(moduleUrl);

assert.equal(typeof worker.default?.fetch, "function", "worker/index.js must export default.fetch");
for (const required of [
  "sage_screen_recruiter_message",
  "sage_screen_recruiter_batch",
  "sage_get_private_dashboard",
  "SAGE_KEY_ENCRYPTION_KEY",
  "sage_user_keys_v3",
  "AES-GCM",
  "HKDF",
]) assert.ok(source.includes(required), `worker source is missing ${required}`);

for (const forbidden of [
  /appgprj_[a-zA-Z0-9]+/,
  /asdk_[a-zA-Z0-9]+/,
  /gh[pousr]_[a-zA-Z0-9]{20,}/,
  /sk-[a-zA-Z0-9]{20,}/,
]) assert.equal(forbidden.test(source), false, `worker source matched forbidden secret/identity pattern ${forbidden}`);

console.log(JSON.stringify({
  valid: true,
  architecture: "hosted Sites Worker + MCP + D1",
  key_entry: "signed-in web dashboard",
  key_storage: "per-user HKDF-SHA-256 + AES-256-GCM v3",
}, null, 2));
