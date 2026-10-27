import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = new URL("../fixtures/source/university_scams/universityscams-revert-4e2accff/with_bodies/", import.meta.url);
const benchmarkPath = new URL("../fixtures/real-job-scam-benchmark.json", import.meta.url);
const priorResultsPath = new URL("../fixtures/real-job-scam-results.json", import.meta.url);
const reusedPath = new URL("../fixtures/real-job-scam-reused-results.json", import.meta.url);
const missingPath = new URL("../fixtures/real-job-scam-missing-cases.json", import.meta.url);

// Superseded v1 filter, preserved only to reconstruct the exact mapping of the
// already-completed Sage run. It is never used to select the final benchmark.
const oldPattern = /(job|employment|employee|employer|hiring|hire|recruit|position|vacancy|career|assistant|internship|work from home|remote work|work at home|payroll|salary|per week|part.?time|work opportunity|applicant|resume|interview|secret shopper|personal assistant|income|compensation|hourly|weekly pay|work-study)/i;
const sha = (value) => createHash("sha256").update(value).digest("hex");
const field = (text, name) => text.match(new RegExp(`^${name}:\\s*(.*)$`, "mi"))?.[1]?.trim() ?? "";
const body = (text) => text.split(/^Body:\s*$/mi)[1]?.trim() ?? "";

const entries = await readdir(root, { recursive: true, withFileTypes: true });
const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".txt")).map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
const oldUnique = new Map();
for (const file of files) {
  const text = await readFile(file, "utf8");
  const subject = field(text, "Subject");
  const content = body(text);
  if (!oldPattern.test(`${subject}\n${content}`)) continue;
  const contentHash = sha(`${subject}\n${content}`.toLowerCase().replace(/\s+/g, " ").trim());
  if (!oldUnique.has(contentHash)) oldUnique.set(contentHash, { contentHash, rank: sha(`sage-levanto-real-job-scam-v1:${contentHash}`) });
}

const oldSelected = [...oldUnique.values()].sort((a, b) => a.rank.localeCompare(b.rank)).slice(0, 1000);
const priorResults = JSON.parse(await readFile(priorResultsPath, "utf8"));
if (priorResults.length !== 1000) throw new Error(`Expected 1,000 prior results, found ${priorResults.length}.`);
const resultByHash = new Map(oldSelected.map((item, index) => [item.contentHash, priorResults[index]]));

const strict = JSON.parse(await readFile(benchmarkPath, "utf8"));
const reused = [];
const missing = [];
for (const testCase of strict.cases) {
  const contentHash = testCase.source_record.content_sha256;
  const prior = resultByHash.get(contentHash);
  if (prior) reused.push({ ...prior, id: testCase.id, content_sha256: contentHash });
  else missing.push(testCase);
}

await writeFile(reusedPath, JSON.stringify(reused, null, 2) + "\n");
await writeFile(missingPath, JSON.stringify(missing, null, 2) + "\n");
console.log(JSON.stringify({ old_filter_unique: oldUnique.size, reused_exact_hash_matches: reused.length, remaining_to_score: missing.length }, null, 2));
