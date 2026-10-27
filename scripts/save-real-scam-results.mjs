import { writeFile } from "node:fs/promises";

let input = "";
for await (const chunk of process.stdin) input += chunk;
const rows = JSON.parse(input);
if (!Array.isArray(rows) || rows.length !== 1000) throw new Error(`Expected 1,000 Sage results, received ${rows?.length ?? "invalid"}.`);
if (new Set(rows.map((row) => row.id)).size !== 1000) throw new Error("Duplicate result IDs found.");
await writeFile(new URL("../fixtures/real-job-scam-results.json", import.meta.url), JSON.stringify(rows, null, 2) + "\n");
console.log("Saved 1,000 Sage benchmark results.");
