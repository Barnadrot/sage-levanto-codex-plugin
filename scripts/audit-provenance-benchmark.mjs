import { readFile } from "node:fs/promises";

const input = new URL("../fixtures/public-source-grounded-recruiter-benchmark-v2.json", import.meta.url);
const corpus = JSON.parse(await readFile(input, "utf8"));
const labels = new Set(["SCAM", "LOW_VALUE", "SECOND_PASS"]);
const partitions = new Set(["training", "calibration", "blind_holdout"]);
if (corpus.cases?.length < 1000) throw new Error("Benchmark must contain at least 1,000 cases.");
if (!corpus.integrity?.identities_fictional || !corpus.integrity?.messages_synthetic) throw new Error("Synthetic-data declaration missing.");

const seenIds = new Set();
const seenBodies = new Set();
const count = {};
for (const row of corpus.cases) {
  if (!row.id || seenIds.has(row.id)) throw new Error(`Duplicate or missing ID: ${row.id}`);
  seenIds.add(row.id);
  if (!labels.has(row.expected)) throw new Error(`Invalid expected class: ${row.id}`);
  if (!partitions.has(row.partition)) throw new Error(`Invalid partition: ${row.id}`);
  if (!corpus.sources[row.source_key]) throw new Error(`Missing source provenance: ${row.id}`);
  if (!row.message?.body || !row.profile_context || !row.expected_reason) throw new Error(`Incomplete case: ${row.id}`);
  if (seenBodies.has(row.message.body)) throw new Error(`Exact duplicate message body: ${row.id}`);
  seenBodies.add(row.message.body);
  count[row.partition] ??= { SCAM: 0, LOW_VALUE: 0, SECOND_PASS: 0, total: 0 };
  count[row.partition][row.expected] += 1;
  count[row.partition].total += 1;
}
if (!count.blind_holdout || count.blind_holdout.total < 200) throw new Error("Blind holdout must contain at least 200 cases.");
for (const label of labels) if (!count.blind_holdout[label]) throw new Error(`Blind holdout lacks ${label} examples.`);
console.log(JSON.stringify({
  audit_passed: true,
  total_cases: corpus.cases.length,
  partitions: count,
  holdout_policy: "Do not use blind_holdout cases to change the Sage decision prompt, thresholds, or class policy. Score only after those are frozen.",
  claim_boundary: corpus.integrity.permitted_claim
}, null, 2));
