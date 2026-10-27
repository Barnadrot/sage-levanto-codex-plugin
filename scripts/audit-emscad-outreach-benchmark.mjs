import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const corpus = JSON.parse(await readFile(new URL("../fixtures/emscad-outreach-benchmark.json", import.meta.url), "utf8"));
const cases = corpus.cases ?? [];
const calibration = cases.filter((x) => x.partition === "calibration");
const holdout = cases.filter((x) => x.partition === "blind_holdout");
const uniqueIds = new Set(cases.map((x) => x.source_record.job_id));
const uniqueHashes = new Set(cases.map((x) => x.source_record.content_sha256));
const leakedContacts = cases.filter((x) => /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|https?:\/\/|www\./i.test(x.message.body));
if (cases.length !== 1200) throw new Error(`Expected 1,200 total records, found ${cases.length}.`);
if (calibration.length !== 200 || holdout.length !== 1000) throw new Error("Expected 200 calibration and 1,000 blind-holdout cases.");
if (holdout.filter((x) => x.expected_scam).length !== 500 || holdout.filter((x) => !x.expected_scam).length !== 500) throw new Error("Blind holdout is not balanced 500/500.");
if (uniqueIds.size !== cases.length || uniqueHashes.size !== cases.length) throw new Error("Duplicate source record or content hash found.");
if (leakedContacts.length) throw new Error(`Contact details remain in ${leakedContacts.length} transformed messages.`);
const fingerprint = createHash("sha256").update(JSON.stringify(cases.map((x) => [x.id, x.partition, x.expected_scam, x.source_record.content_sha256]))).digest("hex");
console.log(JSON.stringify({ audit_passed: true, source_records: cases.length, calibration: calibration.length, blind_holdout: holdout.length, holdout_labels: { fraudulent: 500, legitimate: 500 }, unique_source_ids: uniqueIds.size, unique_content_hashes: uniqueHashes.size, contact_redaction_check: "passed", split_fingerprint_sha256: fingerprint, limitation: corpus.methodology.limitation }, null, 2));
