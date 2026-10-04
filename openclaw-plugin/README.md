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
- Durable state: transactional SQLite survives restart; corrupt or unsafe state fails closed.
- Immediate scheduling uses OpenClaw session-turn scheduling rather than heartbeat event
  queues; a successful request also schedules a conditional two-hour owner reminder.
- Headless agent probes may disable global side effects and return both scheduling
  flags as `false`; callers must not translate proposal creation into a claim that the
  owner was notified.

## Tools

- `request_candidate_times`: Guest creates an expiring request in `awaiting_context`.
- `submit_contextual_candidate_times`: Main submits bounded candidates after a narrow
  memory search, or explicitly falls back to request-only policy.
- `check_candidate_status`: the same Guest session reads owner-decision status.
- `check_owner_candidate_status`: the fixed Main owner session checks whether a
  proposal still needs attention before reminding the owner.
- `record_owner_scheduling_decision`: Main records the human owner's approve,
  revise-and-confirm, or decline action and schedules
  the correlated result for Guest (not proof of delivery). The conditional reminder
  checks terminal status and suppresses itself. A revision must preserve the
  requested duration and remain within a bounded 30-day override window.

Google Calendar OAuth/FreeBusy and cross-Gateway A2A are Phase 3. They will reuse the
same domain states rather than bypassing the owner-decision boundary.

## Durable receipts and deployment

- `list_owner_candidate_proposals` discovers the latest 1–50 retained proposals;
  `check_owner_candidate_status` returns typed request facts plus enum-only receipts.
- State: `$OPENCLAW_STATE_DIR/agent-liaison/broker.sqlite`, fallback
  `~/.openclaw/agent-liaison/broker.sqlite`; directory 0700, database 0600.
  Do not point the host state directory into a repository or shared/untrusted path.
- Node runtime must provide `node:sqlite` (tested Node 26.8.2). No new dependency.
  SQLite FULL synchronous transactions and rollback journaling serialize processes.
- At most 1000 proposals, 16 events per proposal, 30-day lazy retention; eight-hour
  expiry. Capacity fails closed rather than evicting recent idempotency records.
- `attempted` means an effect was claimed, possibly in flight or interrupted;
  `unknown` means host call threw and may have had effects; `failed` means no handle.
  `scheduled` means a host handle was returned, NEVER delivered/read/processed.
  Context processing is evidenced only by `context_submitted`; human decision is
  recorded separately. No automatic retry of any claimed effect.
- Retry with the same key and exact typed content is idempotent within retention;
  different content with the same key fails. Context/decision replay is also deduped.
  A crash between claim and host call can intentionally lose notification; owner
  discovery/status is the reconciliation surface, not an automatic resend feature.
- Install rebuilt package and allow the new optional owner-list tool only for the
  fixed owner. No transcript visibility expansion. Existing volatile proposals cannot
  be recovered/migrated. Corruption recovery requires operator inspection and backup,
  never deleting/resetting state automatically. State is private, not encrypted, and
  local account administrators remain trusted. No live rollout performed here.

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
