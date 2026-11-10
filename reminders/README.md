# Reply-stopped reminders

Status: local bounded broker implemented; NOT installed or connected to a live channel.

This extends Agent Liaison rather than creating a second authority system. The existing meeting-proposal plugin is unchanged. Generic native automations already provide scheduling, but not the verified per-sender reply-cancellation boundary required here.

## Implemented

- Model-facing facade has create({content,date}), status(), cancel() only. No target/session/account/script/job/tool arguments.
- Host binds an opaque, short-lived capability to authenticated inbound metadata; later inbound invalidates older turns. No model-supplied identity.
- LINE only, original agent/account/sender/conversation/session/thread scope. All agents can use the same core only through a correctly scoped host adapter.
- Current-evening Asia/Taipei slots 18/19/20/21, expiry22; future slots only, no rollover or catch-up. A slot has a 60-second admission window. This delivery window is an implementation limit, not an exact-second transport guarantee.
- Later accepted human inbound cancels the active series, independent of message body/type. Duplicate delivery of the creation event does not cancel. A new explicit request replaces the old series.
- SQLite transaction ledger survives restart; startup blocks until host ingress is reconciled. Unique attempt per scope/slot, even across replacement series. Unknown outcomes never retry.
- No timers, polling, API calls, credentials or unrestricted scheduler tools. Tests use only synthetic identities and fake native-dispatch callbacks.

## Run local tests

Node >=24.16 with node:sqlite:

```sh
cd reminders
node --test test/*.test.mjs
```

The 2026-11-10 native run passed 34 tests (0 failures), including malformed host timestamp rejection, replacement-series attempt uniqueness and restart replay. Tests cover schedule boundaries, year rollover, tool argument restrictions, user/account/session/thread isolation, cancellation, idempotency, expiry, queued/unknown delivery, in-flight limits and restart durability. These are broker tests, not evidence that LINE stickers reach the real host adapter.

## Required host integration — not yet wired

1. Resolve admitted LINE human identity and immutable request/event ID from trusted runtime metadata. Do not parse user-authored context or display names. Call acceptHuman for every accepted message before agent execution. Only the host may grant requestAuthorized for an explicit request.
2. Keep one broker owner per database. Database path must be private, outside the repository, under service-owned state with restrictive permissions. Do not open user-supplied paths or expose the broker object to tools. The module does not itself implement an OS/process isolation boundary.
3. Register only bindTools(cap) through three typed optional tools; reject extras at the API schema as well as in core. Provision no generic automation tool to Guest.
4. Plan each durable native one-shot against the original existing session. Persist/reconcile schedule registration before advertising activation. A partial scheduling failure must cancel the series or report partial status; no success-on-write-only.
5. At the actual native message admission point, call dispatch with trusted stored slot/route, not after a delayed queue. Its callback must immediately submit through that session's authorized native message tool, without asynchronous work before submission. Never replace it with HTTP, curl, direct provider SDK, another session, or an independent scheduler announcement.
6. Ingress and submission need a shared serialized owner. Once native submission begins, a subsequent reply cannot retract it. A queued wake is not a send: recheck at the actual admission point. Fail closed on gaps, restarts, stale session ownership or unavailable sender metadata.
7. Retain exactly one slot receipt. Reconcile failed history writes separately from confirmed delivery. Unknown send results sacrifice that slot to prevent duplicates.
8. Add bounded retention for event/series data and confirmed scheduler cleanup before production. Keep cancellation/idempotency tombstones at least through the provider's verified redelivery horizon; no guessed retention duration.

## Release gate

A passing local suite does not activate this module. Public SDK integration, identity coverage, scheduler ownership, ingress/dispatch race control, protected storage/lifecycle, independent review and an explicitly authorized real channel test remain necessary. The shared skill must continue saying unavailable until these gates pass.

See [integration evidence](INTEGRATION.md).
