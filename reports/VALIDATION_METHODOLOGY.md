# Sage recruiter screener — validation record

Generated 2026-10-16. This report describes the evidence used for the public demo. It does not claim production-inbox accuracy.

## What was tested

The production path sends each narrowed recruiter-style message to `levanto-sage-v1.4` as one three-way `choice` decision in quality mode:

- `SCAM`: material evidence of impersonation, credential or identity harvesting, advance fees, fake-check/equipment schemes, malware, money movement, or another malicious recruitment scheme.
- `LOW_VALUE`: apparently non-malicious but generic sourcing, talent-pool/CV collection without a live mandate, sales, surveys, expert-network consulting, or clearly irrelevant outreach.
- `SECOND_PASS`: plausible work or incomplete/conflicting evidence.

The application emits a `SCAM` advisory flag only at confidence ≥ 0.80. It emits a `LOW_VALUE` advisory flag only at confidence ≥ 0.80 **and** after an independent profile-to-sender check returns `verified_match`. Everything else is escalated. Sage does not generate the final high-value judgment, and this plugin never mutates the mailbox.

## Real public scam set

Source: *The University Scam Emails Corpus* by Grace Ciambrone and Shomir Wilson, published with their Web Conference 2023 paper. The source archive contains 5,155 English-language scam emails collected from university security pages and is licensed CC BY-NC-SA 2.0.

- Source archive SHA-256: `00542394336a08113fb5997f5250bc42ebbffffd94b5683a68df2fb46778321a`
- Selection: bounded employment/recruitment terms in subject or body.
- Deduplication: normalized subject + body, SHA-256 exact-content dedupe.
- Remaining unique employment-related records: 1,002.
- Frozen test set: deterministic content-hash rank, first 1,000.
- Final benchmark fingerprint: `ffb8c75bb13443af4172a5adeae2faa558eba20dbbfb776ddce239f395c4fd26`
- Synthetic messages: 0.
- Privacy preprocessing: sender replaced; email addresses, phone numbers, and URLs redacted. Message wording otherwise remains from the public corpus.

An earlier broad filter was rejected because substring matching could admit unrelated messages. Of the corrected 1,000 cases, 880 had identical source-message hashes in the completed Sage run and their outputs were reused; the 120 newly selected hashes were scored fresh. The merge enforces 1,000 unique content hashes.

## Result on 1,000 known scam emails

| Route | Cases | Share |
|---|---:|---:|
| Routed to `SCAM` advisory flag | 506 | 50.6% |
| Escalated for second-pass review | 494 | 49.4% |
| Routed to `LOW_VALUE` | 0 | 0.0% |

- Protected routing (`SCAM` flag or escalation): 100%; Wilson 95% CI 99.62–100%.
- Automatic scam-block recall: 50.6%; Wilson 95% CI 47.50–53.69%.

“Protected” means the message received a `SCAM` advisory flag or was escalated. It does **not** mean Sage independently identified every scam.

## Legitimate safety control

One hundred legitimate records from EMSCAD were transformed into outreach-shaped inputs for prompt calibration. They are real job advertisements, not private recruiter DMs.

- Routed to the `SCAM` advisory flag: 0/100.
- Observed false-positive rate: 0%; Wilson 95% upper bound 3.70%.

This control is too small to prove a zero false-positive rate. It is included to show that the high-sensitivity policy did not emit a `SCAM` flag for the sampled legitimate controls.

## Production smoke checks

- Fake-check/equipment message: Sage chose `SCAM`, confidence 1.00; production route `SCAM`.
- Generic CV/talent-pool request with no independent profile verification: Sage chose `LOW_VALUE`, confidence 1.00; production route `SECOND_PASS`.

The second check proves the fail-safe: an unverified low-value decision is not silently cleared.

## Reproduction files

- `scripts/build-real-job-scam-benchmark.mjs`
- `scripts/audit-real-job-scam-benchmark.mjs`
- `scripts/map-prior-results-to-strict-benchmark.mjs`
- `scripts/merge-strict-benchmark-results.mjs`
- `scripts/score-real-scam-results.mjs`
- `reports/sage-levanto-validation-report.json`

The raw public corpus, transformed messages, and per-message results are intentionally git-ignored; the scripts, hashes, aggregate report, and selection method are retained.
