import { readFile, writeFile } from "node:fs/promises";

const benchmark = JSON.parse(await readFile(new URL("../fixtures/real-job-scam-benchmark.json", import.meta.url), "utf8"));
const reused = JSON.parse(await readFile(new URL("../fixtures/real-job-scam-reused-results.json", import.meta.url), "utf8"));
const fresh = JSON.parse(await readFile(new URL("../fixtures/real-job-scam-fresh-results.json", import.meta.url), "utf8"));
const output = new URL("../fixtures/real-job-scam-results.json", import.meta.url);

const byId = new Map([...reused, ...fresh].map((row) => [row.id, row]));
const merged = benchmark.cases.map((testCase) => {
  const row = byId.get(testCase.id);
  if (!row) throw new Error(`Missing Sage result for ${testCase.id}.`);
  return { ...row, id: testCase.id, content_sha256: testCase.source_record.content_sha256 };
});
if (merged.length !== 1000 || new Set(merged.map((row) => row.content_sha256)).size !== 1000) throw new Error("Strict result merge failed uniqueness checks.");
await writeFile(output, JSON.stringify(merged, null, 2) + "\n");
console.log(JSON.stringify({ merged: merged.length, reused: reused.length, freshly_scored: fresh.length }, null, 2));
