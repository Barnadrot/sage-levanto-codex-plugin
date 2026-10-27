import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../fixtures/source/university_scams/universityscams-revert-4e2accff/with_bodies/", import.meta.url);
const rootPath = fileURLToPath(root);
const output = new URL("../fixtures/real-job-scam-benchmark.json", import.meta.url);
const ZIP_SHA256 = "00542394336a08113fb5997f5250bc42ebbffffd94b5683a68df2fb46778321a";
// Bound every single-word term. Substring matching (for example, `hire` inside an
// unrelated word) admits non-employment scams and invalidates the benchmark.
const employmentPattern = /\b(job|jobs|employment|employee|employer|hiring|hired|hire|recruiter|recruiting|recruitment|position|vacancy|career|internship|payroll|salary|applicant|resume|interview|secret shopper|personal assistant|compensation|work-study)\b|work[ -]?from[ -]?home|remote work|work opportunity|part[ -]?time|weekly pay|hourly pay|per week/i;
const sha = (value) => createHash("sha256").update(value).digest("hex");

function field(text, name) {
  return text.match(new RegExp(`^${name}:\\s*(.*)$`, "mi"))?.[1]?.trim() ?? "";
}
function body(text) {
  return text.split(/^Body:\s*$/mi)[1]?.trim() ?? "";
}
function redact(text) {
  return String(text)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email redacted]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[url redacted]")
    .replace(/(?:\+?\d[\d .()\-/]{7,}\d)/g, "[phone redacted]")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

const entries = await readdir(root, { recursive: true, withFileTypes: true });
const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".txt")).map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
if (files.length !== 5155) throw new Error(`Expected 5,155 emails with bodies, found ${files.length}.`);

const unique = new Map();
for (const file of files) {
  const text = await readFile(file, "utf8");
  const subject = field(text, "Subject");
  const content = body(text);
  if (!employmentPattern.test(`${subject}\n${content}`)) continue;
  const normalized = `${subject}\n${content}`.toLowerCase().replace(/\s+/g, " ").trim();
  const contentHash = sha(normalized);
  if (unique.has(contentHash)) continue;
  unique.set(contentHash, { file, text, subject, content, contentHash, rank: sha(`sage-levanto-real-job-scam-v1:${contentHash}`) });
}
if (unique.size < 1000) throw new Error(`Only ${unique.size} unique employment-related scam emails were found.`);

const selected = [...unique.values()].sort((a, b) => a.rank.localeCompare(b.rank)).slice(0, 1000);
const cases = selected.map((item, index) => {
  const safeSubject = redact(item.subject || "Employment opportunity").slice(0, 500);
  const safeBody = redact(item.content).slice(0, 12000);
  return {
    id: `university-scam-${String(index + 1).padStart(4, "0")}`,
    expected_scam: true,
    source_record: {
      corpus_path: path.relative(rootPath, item.file).replaceAll("\\", "/"),
      source_page: field(item.text, "Source Link"),
      original_date: field(item.text, "Date"),
      content_sha256: item.contentHash,
    },
    message: {
      id: `university-scam-${String(index + 1).padStart(4, "0")}`,
      received_at: "2026-10-16T00:00:00Z",
      source: "public_scam_corpus",
      from: "Public corpus sender <sender@redacted.invalid>",
      subject: safeSubject,
      body: safeBody,
      profile_context: "No independent recruiter profile evidence is available in this public email corpus.",
    },
  };
});

const corpus = {
  dataset: "Sage Levanto real employment-scam email benchmark",
  version: "1.0.0",
  source: {
    name: "The University Scam Emails Corpus",
    authors: "Grace Ciambrone and Shomir Wilson",
    citation: "Creation and Analysis of a Corpus of Scam Emails Targeting Universities, The Web Conference 2023",
    url: "https://shomir.net/data/university_scams/index.html",
    license: "CC BY-NC-SA 2.0",
    archive_sha256: ZIP_SHA256,
    emails_with_bodies: files.length,
  },
  methodology: {
    source_messages_are_real_public_scam_reports: true,
    synthetic_generation: false,
    relevant_unique_messages_before_sampling: unique.size,
    selection: "Filter subject and body with bounded employment/recruitment terms, deduplicate normalized subject+body by SHA-256, deterministically rank by content hash, then take 1,000.",
    privacy: "Email addresses, phone numbers and URLs are redacted before Sage evaluation. Sender identity is replaced; message wording otherwise remains from the public corpus.",
    scope: "Scam-recall test only. It contains no legitimate controls and cannot measure precision or personal opportunity value.",
  },
  cases,
};
await writeFile(output, JSON.stringify(corpus, null, 2) + "\n");
console.log(JSON.stringify({ output: output.pathname, corpus_emails: files.length, relevant_unique_before_sampling: unique.size, selected: cases.length, synthetic_messages: 0 }, null, 2));
