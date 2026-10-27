import { mkdir, writeFile } from "node:fs/promises";

const out = new URL("../fixtures/public-source-grounded-recruiter-benchmark-v2.json", import.meta.url);
const ledger = new URL("../fixtures/public-source-grounded-recruiter-benchmark-v2-provenance.md", import.meta.url);

// This generator deliberately creates fictional messages. It records the public
// source *pattern* behind each family, rather than reproducing private messages
// or claiming that a public example was sent to this user.
const sources = {
  credible: {
    title: "Indeed — Email templates for recruiters",
    url: "https://www.indeed.com/career-advice/career-development/email-templates-for-recruiters",
    pattern: "Role, company, reason for fit, professional CTA; may request a resume after a response."
  },
  credible_detail: {
    title: "Gem — Examples of great recruiting email outreach",
    url: "https://lp.gem.com/rs/972-IVV-330/images/Definitive-guide-for-recruiting-email-outreach-2022.pdf",
    pattern: "Personalized outreach with role, team or mission and a low-friction first conversation."
  },
  low_value: {
    title: "Public recruiter-outreach discussion corpus",
    url: "https://www.reddit.com/r/recruitinghell/comments/1vx1ivb/recruiter_coldemails_me_i_ask_10_basic_questions/",
    pattern: "Generic role or CV collection with too little mandate, employer or compensation detail to rank as valuable."
  },
  scam: {
    title: "LinkedIn — Recognize and report scams",
    url: "https://www.linkedin.com/help/linkedin/answer/a1336387/recognize-and-report-scams?lang=en",
    pattern: "Early financial or identity requests, generic domains, off-platform pressure, unrealistic compensation and company impersonation."
  },
  scam_ftc: {
    title: "FTC — Job scammers are looking to hire you",
    url: "https://consumer.ftc.gov/consumer-alerts/2025/07/job-scammers-are-looking-hire-you",
    pattern: "Fake recruiter messages seek financial or identity information before a genuine interview or hiring process."
  },
  scam_profile: {
    title: "LinkedIn — Report fake profiles",
    url: "https://www.linkedin.com/help/linkedin/answer/a1338436/",
    pattern: "Incomplete or inconsistent profiles are only a signal; classify as scam only when paired with additional deceptive behavior."
  }
};

const first = ["Avery", "Jordan", "Morgan", "Riley", "Taylor", "Casey", "Sam", "Quinn", "Drew", "Alex"];
const last = ["Lee", "Patel", "Reed", "Morgan", "Kim", "Silva", "Hayes", "Owens", "Nolan", "Bennett"];
const companies = ["Lattice Harbor", "Northstar Systems", "Cedar Arc", "Ironclad Compute", "Orbit Ledger", "Brightwell Labs", "Delta Cipher", "Aster Network", "Beacon Field", "Juniper Works"];
const roles = ["Staff Protocol Engineer", "Founding Infrastructure Engineer", "Security Engineering Lead", "Applied Cryptography Lead", "Principal Distributed Systems Engineer", "Developer Platform Lead", "Research Engineer", "Technical Product Lead", "VP Engineering", "Protocol Architect"];
const skills = ["zero-knowledge proof systems", "distributed-systems reliability", "wallet security", "confidential compute", "protocol design", "cryptographic engineering", "developer infrastructure", "privacy-preserving systems", "rollup architecture", "high-assurance software"];
const locations = ["remote in Europe", "London hybrid", "Berlin hybrid", "remote-first", "Amsterdam hybrid"];
const partitions = ["training", "calibration", "blind_holdout", "training", "calibration"];
const pick = (arr, n) => arr[n % arr.length];
const identity = n => ({ name: `${pick(first, n)} ${pick(last, Math.floor(n / 3))}`, company: pick(companies, Math.floor(n / 7)), role: pick(roles, n), skill: pick(skills, Math.floor(n / 5)), location: pick(locations, Math.floor(n / 11)) });
const profile = (x, variant) => variant === "matched"
  ? `Synthetic profile evidence: ${x.name} is listed as a Talent Partner at ${x.company} since 2023. The fictional company, role and sender domain align. This is a simulated profile observation, not a real LinkedIn profile.`
  : `Synthetic profile evidence: the sender profile is sparse or has a mismatched employer/domain claim. This signal alone is insufficient; the message also contains the listed risk signal. This is a simulated profile observation, not a real LinkedIn profile.`;

function makeCredible(n, sourceKey = "credible") {
  const x = identity(n);
  const range = 150 + (n % 8) * 15;
  return {
    expected: "SECOND_PASS", archetype: "credible_role_outreach", source_key: sourceKey,
    expected_reason: "A specific role and credible recruiter context warrant human value review, not automatic acceptance.",
    message: { source: n % 2 ? "gmail" : "linkedin_inmail", from: `${x.name} <${x.name.toLowerCase().replace(" ", ".")}@${x.company.toLowerCase().replaceAll(" ", "")}.example>`, subject: `${x.role} — ${x.company}`, body: `Hi Candidate — I found your work in ${x.skill}. I recruit for ${x.company}, where we are hiring a ${x.role} to own a core systems area. The team is ${8 + (n % 40)} people, ${x.location}; cash range is €${range}k–€${range + 35}k plus equity. Would a 20-minute introductory call next week be useful?` },
    profile_context: profile(x, "matched")
  };
}

function makeLow(n) {
  const x = identity(n);
  const kinds = [
    `We are building a network for future ${x.skill} searches. There is no live mandate, employer or timeline to discuss today. May we retain your public CV?`,
    `I have a broad contract opening that may fit engineers with ${x.skill}. I cannot disclose the client, scope, location, rate or expected start date yet. Please send your latest CV.`,
    `Would you join a compensated 45-minute research consultation about ${x.skill}? This is not an employment opportunity.`,
    `I am collecting profiles for several possible roles. Please complete this generic skills form and we will contact you if something matches.`
  ];
  return { expected: "LOW_VALUE", archetype: "generic_or_nonemployment_outreach", source_key: "low_value", expected_reason: "Not a scam signal: it is generic sourcing, undisclosed work or a non-employment request with little strategic value.", message: { source: n % 2 ? "gmail" : "linkedin_inmail", from: `${x.name} <${x.name.toLowerCase().replace(" ", ".")}@talent-${n % 19}.example>`, subject: `Opportunity network — ref ${n + 1000}`, body: `Hi Candidate — ${pick(kinds, n)} Reference ${n + 1000}. Regards, ${x.name}` }, profile_context: profile(x, "matched") };
}

function makeVerify(n) {
  const x = identity(n);
  return { expected: "SECOND_PASS", archetype: "insufficiently_specified_outreach", source_key: "credible_detail", expected_reason: "No fraud request is made, but insufficient role or company information should be routed to review rather than auto-rejected.", message: { source: n % 2 ? "gmail" : "linkedin_inmail", from: `${x.name} <${x.name.toLowerCase().replace(" ", ".")}@search-${n % 23}.example>`, subject: `Confidential leadership search — ${n + 2000}`, body: `Hi Candidate — I am working on confidential search ${n + 2000}, which may align with your ${x.skill} background. I can share the company, stage, location and compensation in an initial conversation. Are you open to a short call?` }, profile_context: `Synthetic profile evidence: ${x.name} has a plausible recruiting history, but the hiring company, role scope, compensation and mandate cannot be confirmed from this first message. This is a simulated profile observation, not a real LinkedIn profile.` };
}

function makeScam(n) {
  const x = identity(n);
  const variants = [
    { tag: "identity_before_interview", source: "scam_ftc", text: `Congratulations, you are selected for ${x.role} at ${x.company}. Before a call, reply today with a scan of your passport, tax ID and bank account for payroll setup.` },
    { tag: "equipment_payment", source: "scam", text: `You have been pre-approved for a remote ${x.role} role. We will send a €4,800 cheque to purchase equipment; deposit it and forward the remainder to our supplier immediately.` },
    { tag: "off_platform_urgent", source: "scam", text: `I have a $310k remote opportunity for you. Move to Telegram in the next 30 minutes to secure the slot; our hiring team cannot use company email.` },
    { tag: "malicious_challenge", source: "scam", text: `For the final interview, clone our private assessment package and run the installer locally. Send your browser-wallet recovery phrase only if the installer requests verification.` },
    { tag: "advance_fee", source: "scam", text: `Your offer is ready. Pay the €79 background-verification processing fee today, then we will release your contract.` },
    { tag: "impersonation_mismatch", source: "scam_profile", text: `I recruit for ${x.company}. Please use this personal mailbox because our official systems are down. You can start tomorrow at €290k with no interview after you upload ID and bank details.` }
  ];
  const v = pick(variants, n);
  return { expected: "SCAM", archetype: v.tag, source_key: v.source, expected_reason: "The classification is driven by a concrete fraud signal, not by profile sparsity or imperfect writing alone.", message: { source: n % 2 ? "gmail" : "linkedin_inmail", from: `${x.name} <recruitment.${n}@${n % 2 ? "fastmail" : "talent-hiring"}.example>`, subject: `Immediate ${x.role} offer — ref ${n + 3000}`, body: `Hi Candidate — ${v.text} Candidate reference ${n + 3000}.` }, profile_context: profile(x, "mismatch") };
}

const plans = [
  [360, makeScam], [280, makeCredible], [220, makeLow], [140, makeVerify]
];
const cases = [];
let serial = 0;
for (const [count, factory] of plans) {
  for (let n = 0; n < count; n += 1) {
    const row = factory(serial);
    cases.push({ id: `psg-v2-${String(serial + 1).padStart(4, "0")}`, partition: partitions[serial % partitions.length], ...row });
    serial += 1;
  }
}

const corpus = {
  dataset: "Sage Levanto public-source-grounded synthetic recruiter benchmark v2",
  version: "2026-10-16",
  cases: cases.length,
  integrity: {
    identities_fictional: true,
    messages_synthetic: true,
    source_provenance: "Each case maps to a documented public outreach or safety pattern; cases are not copies of emails, not claimed to be real inbound messages, and profile context is simulated.",
    permitted_claim: "Benchmark performance on the blind synthetic holdout only. Not a deployment-performance claim."
  },
  sources,
  cases
};

const counts = Object.fromEntries(["training", "calibration", "blind_holdout"].map(partition => [partition, cases.filter(c => c.partition === partition).length]));
const labelCounts = Object.fromEntries(["SCAM", "LOW_VALUE", "SECOND_PASS"].map(label => [label, cases.filter(c => c.expected === label).length]));
await mkdir(new URL("../fixtures/", import.meta.url), { recursive: true });
await writeFile(out, JSON.stringify(corpus, null, 2) + "\n");
await writeFile(ledger, `# Provenance ledger — public-source-grounded synthetic recruiter benchmark v2\n\n- Cases: ${cases.length}\n- Partitions: ${JSON.stringify(counts)}\n- Expected classes: ${JSON.stringify(labelCounts)}\n- No public message has been copied. Names, employers, email addresses, domains, compensation and profile observations are fictional.\n- Every case carries a \`source_key\` resolving to one public pattern source in the JSON corpus.\n- Blind holdout must not be used for prompt design or policy adjustment.\n\n## Sources\n\n${Object.entries(sources).map(([key, source]) => `- **${key}** — [${source.title}](${source.url}): ${source.pattern}`).join("\n")}\n`);
console.log(JSON.stringify({ generated: cases.length, partitions: counts, labels: labelCounts, output: out.pathname }, null, 2));
