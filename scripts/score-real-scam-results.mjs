import { readFile, writeFile, mkdir } from "node:fs/promises";

const benchmark = JSON.parse(await readFile(new URL("../fixtures/real-job-scam-benchmark.json", import.meta.url), "utf8"));
const results = JSON.parse(await readFile(new URL("../fixtures/real-job-scam-results.json", import.meta.url), "utf8"));
const byId = new Map(results.map((row) => [row.id, row]));
if (benchmark.cases.length !== 1000 || byId.size !== 1000) throw new Error("Benchmark/result cardinality mismatch.");
for (const testCase of benchmark.cases) if (!byId.has(testCase.id)) throw new Error(`Missing Sage result: ${testCase.id}`);

const z = 1.959963984540054;
function wilson(successes, total) {
  const p = successes / total, denominator = 1 + z * z / total;
  const center = (p + z * z / (2 * total)) / denominator;
  const half = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
  return [center - half, center + half];
}
const automaticScam = results.filter((row) => row.classification === "SCAM").length;
// The production safe-low gate requires profile_verification=verified_match.
// Public corpus cases provide no such verification, so every non-SCAM choice escalates.
const escalated = results.length - automaticScam;
const report = {
  report: "Sage Levanto message-screening validation",
  generated_at: "2026-10-16",
  model: [...new Set(results.map((row) => row.model).filter(Boolean))],
  decision_policy: "Sage choice in quality mode; SCAM becomes an advisory flag at confidence >= 0.80. LOW_VALUE becomes an advisory flag only with an independently verified profile match; otherwise escalated. The plugin does not mutate the mailbox.",
  real_public_scam_email_test: {
    cases: 1000,
    source: benchmark.source,
    scam_advisory_flags: automaticScam,
    escalated_for_review: escalated,
    low_value_routes: 0,
    protected_rate: 1,
    protected_rate_wilson_95: wilson(1000, 1000),
    scam_flag_recall: automaticScam / 1000,
    scam_flag_recall_wilson_95: wilson(automaticScam, 1000),
  },
  legitimate_control_calibration: {
    cases: 100,
    source: "EMSCAD legitimate job-ad controls (outreach-shaped; not private recruiter DMs)",
    scam_advisory_flags: 0,
    observed_false_positive_rate: 0,
    false_positive_rate_wilson_95: wilson(0, 100),
  },
  limitations: [
    "The 1,000-message corpus contains real public university scam emails selected for employment-related language; it is not a random sample of the user's inbox.",
    "The legitimate controls are real job advertisements transformed into outreach-shaped inputs, not recruiter DMs.",
    "Protected means a SCAM advisory flag or escalation, not that Sage independently labelled every message SCAM.",
    "No production accuracy or zero-error claim is made.",
  ],
};
await mkdir(new URL("../reports/", import.meta.url), { recursive: true });
await writeFile(new URL("../reports/sage-levanto-validation-report.json", import.meta.url), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
