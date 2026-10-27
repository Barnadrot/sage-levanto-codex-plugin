import { readFile } from "node:fs/promises";

const fixturePath = new URL("../fixtures/synthetic-recruiter-validation.json", import.meta.url);
const resultPath = process.argv[2] ? new URL(process.argv[2], import.meta.url) : null;
const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

const permitted = new Set(["SCAM", "LOW_VALUE", "SECOND_PASS"]);
if (!Array.isArray(fixture.cases) || fixture.cases.length < 10) throw new Error("Synthetic validation corpus must include at least 10 cases.");
for (const testCase of fixture.cases) {
  if (!permitted.has(testCase.expected)) throw new Error(`Unexpected expected class for ${testCase.id}`);
  if (!testCase.profile_context?.includes("Synthetic LinkedIn profile observation")) throw new Error(`Missing synthetic profile evidence for ${testCase.id}`);
}

if (!resultPath) {
  const expected = Object.fromEntries([...permitted].map(category => [category, fixture.cases.filter(x => x.expected === category).length]));
  console.log(JSON.stringify({
    corpus_valid: true,
    cases: fixture.cases.length,
    expected,
    release_gate: {
      real_opportunity_auto_scam_rate: "0% on held-out corpus",
      scam_recall: "100% on held-out corpus",
      uncertainty_route: "SECOND_PASS / Review"
    },
    next_step: "Run Sage on each case with profile_context, save {id, classification} JSON, then pass its path to this script."
  }, null, 2));
  process.exit(0);
}

const results = JSON.parse(await readFile(resultPath, "utf8"));
const byId = new Map(results.map(result => [result.id, result]));
const missing = fixture.cases.filter(testCase => !byId.has(testCase.id)).map(testCase => testCase.id);
if (missing.length) throw new Error(`Missing results for: ${missing.join(", ")}`);

const actual = fixture.cases.map(testCase => ({ ...testCase, actual: byId.get(testCase.id).classification }));
for (const row of actual) if (!permitted.has(row.actual)) throw new Error(`Invalid Sage classification for ${row.id}: ${row.actual}`);

const legitimate = actual.filter(row => ["SECOND_PASS", "LOW_VALUE"].includes(row.expected));
const scams = actual.filter(row => row.expected === "SCAM");
const falsePositiveScams = legitimate.filter(row => row.actual === "SCAM");
const caughtScams = scams.filter(row => row.actual === "SCAM");
const missedScams = scams.filter(row => row.actual !== "SCAM");
const reviewRouted = actual.filter(row => row.actual === "SECOND_PASS");

const report = {
  corpus_valid: true,
  cases: actual.length,
  result_counts: Object.fromEntries([...permitted].map(category => [category, actual.filter(row => row.actual === category).length])),
  opportunity_safety_sensitivity: (legitimate.length - falsePositiveScams.length) / legitimate.length,
  real_opportunity_auto_scam_rate: falsePositiveScams.length / legitimate.length,
  scam_recall: caughtScams.length / scams.length,
  scam_misses: missedScams.map(row => row.id),
  review_routed_count: reviewRouted.length,
  release_gate_passed: falsePositiveScams.length === 0 && missedScams.length === 0,
  scope_note: "This is a synthetic held-out validation result, not a guarantee about future real outreach."
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.release_gate_passed ? 0 : 1);
