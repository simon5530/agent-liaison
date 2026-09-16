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
- The repository contains design documentation and a standard-library-only Python
  prototype; no runtime dependency or bundled third-party asset requires an
  additional license notice.
- License: MIT.
- Local Markdown links resolved.
- GitHub Secret Scanning and Push Protection enabled.
- GitHub private vulnerability reporting enabled for responsible disclosure.

## Residual limitations

- Pattern scanning cannot prove the absence of every possible sensitive semantic detail.
- Phase 1 proves only the synthetic policy core. Live channel, calendar, and A2A
  adapters remain intentionally unverified and out of the current trust boundary.
