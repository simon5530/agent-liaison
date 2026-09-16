# Agent Liaison OpenClaw Plugin

Tool-only Phase 1 adapter for the same-Gateway private beta. It exposes one
typed synthetic scheduling capability only to explicitly allowlisted Guest
sessions. It does not read or write a live calendar, expose Main memory, or
enable generic cross-session messaging.

## Security boundary

- Optional tool: absent unless both `agentId=guest` and the exact session key
  match the plugin allowlist.
- Fixed JSON schema: no arbitrary prompt or raw conversation field.
- Derived output only: synthetic slots, proposal ID, authority, and expiry.
- Fixed owner destination: the caller cannot choose the Main session.
- Synthetic authority: results must never be represented as real availability
  or a confirmed commitment.

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
