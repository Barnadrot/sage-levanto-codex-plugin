import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../fixtures/source/fake_job_postings.csv", import.meta.url);
const outputPath = new URL("../fixtures/emscad-outreach-benchmark.json", import.meta.url);
const SOURCE_SHA256 = "59253295129d8b6a27607f9904f7d4ddf4dbb0ee35e079c7eb51b58b5e62bf60";

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  const header = rows.shift();
  return rows.filter((values) => values.length === header.length).map((values) => Object.fromEntries(header.map((key, index) => [key, values[index]])));
}

function decode(text) {
  return String(text ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&nbsp;/gi, " ")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[url redacted]")
    .replace(/(?:\+?\d[\d .()\-/]{7,}\d)/g, "[phone redacted]")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

const sha = (value) => createHash("sha256").update(value).digest("hex");
const raw = await readFile(sourcePath);
if (sha(raw) !== SOURCE_SHA256) throw new Error("EMSCAD source hash does not match the pinned public file.");
const rows = parseCsv(raw.toString("utf8"));
if (rows.length !== 17880) throw new Error(`Expected 17,880 EMSCAD rows, found ${rows.length}.`);

const rawFraudulent = rows.filter((row) => row.fraudulent === "1");
const rawLegitimate = rows.filter((row) => row.fraudulent === "0");
if (rawFraudulent.length !== 866 || rawLegitimate.length !== 17014) throw new Error("Unexpected EMSCAD label counts.");
const sourceText = (row) => [row.title, row.location, row.department, row.salary_range, row.company_profile, row.description, row.requirements, row.benefits].map(decode).join("\n\n");
const seenContent = new Set();
const ranked = rows.map((row) => ({ row, contentHash: sha(sourceText(row)), rank: sha(`sage-levanto-emscad-v1:${row.job_id}`) })).filter((item) => {
  if (seenContent.has(item.contentHash)) return false;
  seenContent.add(item.contentHash);
  return true;
});
const fraudulent = ranked.filter(({ row }) => row.fraudulent === "1").sort((a, b) => a.rank.localeCompare(b.rank));
const legitimate = ranked.filter(({ row }) => row.fraudulent === "0").sort((a, b) => a.rank.localeCompare(b.rank));
if (fraudulent.length < 600 || legitimate.length < 600) throw new Error("Not enough unique EMSCAD records for the fixed split.");

const selected = [
  ...fraudulent.slice(0, 100).map((item) => ({ ...item, partition: "calibration" })),
  ...legitimate.slice(0, 100).map((item) => ({ ...item, partition: "calibration" })),
  ...fraudulent.slice(100, 600).map((item) => ({ ...item, partition: "blind_holdout" })),
  ...legitimate.slice(100, 600).map((item) => ({ ...item, partition: "blind_holdout" })),
].sort((a, b) => a.rank.localeCompare(b.rank));

function toCase({ row, contentHash, partition }) {
  const sections = [
    ["Role", row.title], ["Location", row.location], ["Department", row.department], ["Compensation", row.salary_range],
    ["Company profile", row.company_profile], ["Description", row.description], ["Requirements", row.requirements], ["Benefits", row.benefits],
  ].filter(([, value]) => value).map(([name, value]) => `${name}:\n${decode(value)}`);
  const body = `Hello — I am contacting you about the following opportunity.\n\n${sections.join("\n\n")}\n\nWould you be open to discussing it?`.slice(0, 12000);
  const structured = [
    `employment_type=${decode(row.employment_type) || "unknown"}`,
    `required_experience=${decode(row.required_experience) || "unknown"}`,
    `required_education=${decode(row.required_education) || "unknown"}`,
    `industry=${decode(row.industry) || "unknown"}`,
    `function=${decode(row.function) || "unknown"}`,
    `telecommuting=${row.telecommuting}`,
    `company_logo_present=${row.has_company_logo}`,
    `screening_questions_present=${row.has_questions}`,
  ].join("; ");
  return {
    id: `emscad-${row.job_id}`,
    partition,
    source_record: { dataset: "EMSCAD", job_id: Number(row.job_id), original_label: Number(row.fraudulent), content_sha256: contentHash },
    expected_scam: row.fraudulent === "1",
    message: {
      id: `emscad-${row.job_id}`,
      received_at: "2026-10-16T00:00:00Z",
      source: "public_benchmark",
      from: "Dataset recruiter <benchmark@redacted.invalid>",
      subject: decode(row.title) || "Recruiting opportunity",
      body,
      profile_context: `Public-dataset structured evidence: ${structured}. No LinkedIn identity claim is supplied.`,
    },
  };
}

const cases = selected.map(toCase);
const corpus = {
  dataset: "Sage Levanto EMSCAD outreach-shaped benchmark",
  version: "1.0.0",
  source: {
    name: "Employment Scam Aegean Dataset (EMSCAD)",
    mirror: "https://huggingface.co/datasets/victor/real-or-fake-fake-jobposting-prediction",
    file_sha256: SOURCE_SHA256,
    rows: 17880,
    manually_labeled_legitimate: 17014,
    manually_labeled_fraudulent: 866,
  },
  methodology: {
    real_source_records: true,
    messages_are_outreach_shaped_transformations: true,
    no_template_variants: true,
    sampling: "Deterministic SHA-256 ranking by source job_id; 200 calibration records and a disjoint 1,000-record blind holdout balanced 500 fraudulent / 500 legitimate.",
    duplicate_policy: `Exact duplicates were removed by normalized source-content SHA-256 before sampling (${rows.length - ranked.length} source rows excluded).`,
    transformation: "Each public job ad becomes one recruiter-style wrapper containing its redacted title, location, company profile, description, requirements and benefits. No new fraud evidence or label is generated.",
    limitation: "EMSCAD contains job advertisements, not private recruiter DMs. This benchmark tests fraud-screening transfer to outreach-shaped job content; it does not establish high-value opportunity ranking or production inbox accuracy.",
  },
  cases,
};

await writeFile(outputPath, JSON.stringify(corpus, null, 2) + "\n");
console.log(JSON.stringify({ output: outputPath.pathname, cases: cases.length, calibration: cases.filter((x) => x.partition === "calibration").length, blind_holdout: cases.filter((x) => x.partition === "blind_holdout").length, holdout_fraudulent: cases.filter((x) => x.partition === "blind_holdout" && x.expected_scam).length, holdout_legitimate: cases.filter((x) => x.partition === "blind_holdout" && !x.expected_scam).length }, null, 2));
