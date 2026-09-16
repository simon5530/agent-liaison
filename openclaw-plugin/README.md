# Agent Liaison OpenClaw Plugin

Tool-only adapter for the same-Gateway private beta. Phase 1 exposes a synthetic
capability; Phase 2 adds an optional Google Calendar FreeBusy capability. Both
are limited to explicitly allowlisted Guest sessions. The live adapter reads
only busy intervals, returns derived candidate slots, and never writes Calendar
data, exposes Main memory, or enables generic cross-session messaging.

## Security boundary

- Optional tool: absent unless both `agentId=guest` and the exact session key
  match the plugin allowlist.
- Fixed JSON schema: no arbitrary prompt or raw conversation field.
- Derived output only: candidate slots, proposal ID, authority, and expiry.
- Fixed owner destination: the caller cannot choose the Main session.
- Tentative authority: even live FreeBusy results are not commitments.
- Least privilege: Google OAuth scope is exactly
  `https://www.googleapis.com/auth/calendar.freebusy`.
- SecretRefs: OAuth client ID, client secret, and refresh token are declared as
  secret inputs and must not be committed or stored inline.

## Phase 2 activation

The live tool remains absent until `googleCalendar` is configured. The supported
runtime cannot borrow credentials from a ChatGPT/Codex Google Calendar connector;
OpenClaw requires its own OAuth client and refresh token. Bind all three credential
fields through OpenClaw SecretRefs. The connector calls only Google's OAuth token
endpoint and Calendar `freeBusy` endpoint.

Until the live OAuth probe passes, keep Guest allowlisted only for
`request_synthetic_availability`. After proof, replace it with
`request_readonly_availability`; do not expose both in normal operation.

## Build

```bash
npm install
npm run plugin:build
npm run plugin:validate
npm test
```

## Runtime proof

The live probe procedure is documented in `../docs/VERIFICATION.md`. Keep real
session keys and account identifiers in local configuration only; never commit
them to this repository.
