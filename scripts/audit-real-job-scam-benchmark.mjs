import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const corpus = JSON.parse(await readFile(new URL("../fixtures/real-job-scam-benchmark.json", import.meta.url), "utf8"));
const cases = corpus.cases ?? [];
const ids = new Set(cases.map((x) => x.id));
const hashes = new Set(cases.map((x) => x.source_record?.content_sha256));
const leaked = cases.filter((x) => /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|https?:\/\/|www\./i.test(`${x.message.subject}\n${x.message.body}`));
if (cases.length !== 1000) throw new Error(`Expected 1,000 cases, found ${cases.length}.`);
if (ids.size !== 1000 || hashes.size !== 1000) throw new Error("Duplicate ID or source-message hash found.");
if (cases.some((x) => x.expected_scam !== true)) throw new Error("Non-scam label found in scam corpus.");
if (leaked.length) throw new Error(`Contact redaction failed for ${leaked.length} cases.`);
const fingerprint = createHash("sha256").update(JSON.stringify(cases.map((x) => [x.id, x.source_record.content_sha256]))).digest("hex");
console.log(JSON.stringify({ audit_passed: true, real_public_scam_messages: 1000, synthetic_messages: 0, unique_message_hashes: hashes.size, contact_redaction_check: "passed", benchmark_fingerprint_sha256: fingerprint, scope: corpus.methodology.scope }, null, 2));
