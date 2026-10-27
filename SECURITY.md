# Security model

## Scope

The Site stores only:

- a Sage API key encrypted for the authenticated Site user;
- aggregate screening counts;
- rolling usage counters and security-alert state.

Recruiter-message bodies, senders, subjects, employers, source IDs, and Sage responses are processed transiently and are not written to D1 by this application.

## Key protection

1. The owner creates a random 32-byte `SAGE_KEY_ENCRYPTION_KEY` and stores it as a protected Sites runtime secret.
2. For each Site-scoped user ID, the Worker derives an AES-256 key with HKDF-SHA-256 and a versioned salt.
3. The Sage API key is encrypted with AES-256-GCM, a fresh random 96-bit IV, a 128-bit authentication tag, and versioned user-bound additional authenticated data.
4. D1 stores only the ciphertext and IV. The master secret is not stored in D1 or Git.
5. The key is decrypted only in Worker memory immediately before calling Sage.

Version 3 automatically migrates older v1/v2 ciphertext after successful decryption. The old row is deleted only after the v3 row has been written.

## Issue → fix → why

| Issue | Fix | Why it matters |
| --- | --- | --- |
| Database-only compromise | Per-user HKDF keys plus AES-256-GCM ciphertext | D1 alone does not reveal Sage keys, and ciphertext cannot be moved between users or protocol versions undetected. |
| One shared encryption key used directly for every row | Derive a distinct, versioned key for each Site user | Limits cross-user cryptographic coupling and enables safe format rotation. |
| Ciphertext replay into another context | Bind `sage-levanto:user-key:v3:<user-id>` as GCM additional data | Decryption fails if a row is reassigned or interpreted under the wrong version. |
| Key exposed through Git or deployment metadata | Store the master only as a protected Sites runtime secret; ignore live hosting metadata | Public source contains neither the master key nor the Site/project identity. |
| Key exposed in chat or shell history | Accept the Sage key only through the signed-in password field | The normal setup never requires the user to paste their Sage key into Codex or a command. |
| Cross-site key replacement/deletion | Require same-origin browser mutations and JSON `PUT`/`DELETE` | Prevents ordinary cross-origin form attacks from changing stored credentials. |
| Oversized untrusted inputs | Enforce schema and server-side length limits | Bounds memory/API usage and limits prompt-injection payload size. |
| Unexpected burst or stolen-session usage | Per-user 1,000-decision / 30-minute guard with alert state | Pauses abnormal volume before it can continue indefinitely. |
| Sensitive browser caching | `Cache-Control: no-store` on the page and private API responses | Reduces persistence in intermediary and browser caches. |
| Inbox data accidentally shown in a share card | Persist and render aggregate counts only | The public visual cannot include messages, senders, subjects, or employers. |

## Trust boundaries and residual risk

- OpenAI Sites/Cloudflare Worker execution, authentication headers, D1, and runtime-secret handling are trusted platform components.
- Sage receives the recruiter content selected for screening and the caller's API credential in the outbound HTTPS request. Review Levanto's data policy before use.
- Gmail and LinkedIn access are separate integrations. This plugin does not grant itself mailbox access.
- A compromise of both D1 ciphertext and the production master secret can expose stored Sage keys. A managed KMS/HSM with non-exportable keys would reduce that risk but is outside this zero-additional-service design.
- AES-256/HKDF-SHA-256 are conventional symmetric primitives. This is not a post-quantum authenticated key-exchange protocol. AES-256 is generally viewed as retaining about 128 bits of brute-force security under Grover's algorithm.
- The page uses inline script/style with CSP allowances because the Worker is a single-file Site. User-controlled text is written with `textContent`, not HTML, but separating static assets and adopting nonce/hash-based CSP would be a further hardening step.

## Rotation and response

- A user can replace or delete their Sage key from the dashboard at any time.
- To rotate the deployment master, add an explicit dual-key migration before changing the runtime secret; replacing it directly makes existing ciphertext undecryptable.
- If a Sage key may be exposed, revoke it at Levanto first, remove it from the dashboard, then save a newly issued key.
- If the Site or master secret may be compromised, suspend the deployment, rotate all affected Sage keys, rotate the master through a migration, and review D1 usage/alert records.

## Reporting

Do not open a public issue containing keys, ciphertext, user identifiers, private messages, or deployment IDs. Contact the repository owner privately with a minimal reproduction and redacted evidence.
