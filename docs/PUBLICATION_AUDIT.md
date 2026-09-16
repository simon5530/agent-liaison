# Publication audit

Last verified: 2026-09-16

## Scope

- current repository tree;
- all commits and reachable Git objects;
- commit author/committer metadata;
- GitHub visibility and repository metadata;
- documentation links.

## Checks

- Gitleaks 8.30.1 full-history scan: no secrets detected.
- Custom privacy scan: no personal email, channel sender ID, user home path,
  Tailscale hostname/IP, auth-profile ID, or private-key marker detected.
- Commit history rebuilt as a sanitized public baseline using a GitHub noreply address.
- No real calendar records, messages, identities, screenshots, archives, logs,
  credentials, or private configuration included.
- The repository contains design documentation, a standard-library-only Python
  prototype, and a small OpenClaw TypeScript plugin. NPM runtime and development
  dependency audits reported zero known vulnerabilities; no third-party asset is
  bundled.
- Live verification used only synthetic scheduling data. No Google refresh token
  was obtained, and no Calendar or Node access is active.
- OpenClaw session visibility is agent-scoped and generic agent-to-agent messaging
  is disabled; the broker uses only its three typed tools.
- License: MIT.
- Local Markdown links resolved.
- GitHub Secret Scanning and Push Protection enabled.
- GitHub private vulnerability reporting enabled for responsible disclosure.

## Residual limitations

- Pattern scanning cannot prove the absence of every possible sensitive semantic detail.
- Phase 1 proves the synthetic policy core. Phase 2 adds a process-local,
  same-Gateway owner-decision loop. Calendar, Node, and cross-Gateway A2A adapters
  remain intentionally outside the current trust boundary.
