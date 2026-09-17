# Agent Liaison OpenClaw Plugin

Tool-only adapter for the same-Gateway private beta. Phase 2.1 implements a bounded
Guest request → Main context review → candidate → owner decision → Guest confirmation
loop. It does not connect to Google Calendar, use Node data, expose Main-memory text,
or enable generic cross-session messaging.

## Security boundary

- Guest tools are absent unless both `agentId=guest` and the exact session key
  match the plugin allowlist.
- Main-only tools are absent unless `agentId=main` and the exact owner
  session key match.
- Fixed JSON schema: no arbitrary prompt or raw conversation field.
- Derived output only: candidates, proposal ID, safe context-basis labels, authority,
  and expiry; no memory excerpt is accepted by the schema.
- Fixed owner destination: the caller cannot choose the Main session.
- Candidate authority: no Calendar or Node check is implied.
- Human authority: only the owner's explicit selection produces `confirmed`.
- Isolation: a Guest session can retrieve only proposals it created.
- Volatile state: restart loses pending proposals and fails closed.

## Tools

- `request_candidate_times`: Guest creates an expiring request in `awaiting_context`.
- `submit_contextual_candidate_times`: Main submits bounded candidates after a narrow
  memory search, or explicitly falls back to request-only policy.
- `check_candidate_status`: the same Guest session reads owner-decision status.
- `record_owner_scheduling_decision`: Main records the human owner's approve or
  decline action and queues the correlated result to Guest.

Google Calendar OAuth/FreeBusy and cross-Gateway A2A are Phase 3. They will reuse the
same domain states rather than bypassing the owner-decision boundary.

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
