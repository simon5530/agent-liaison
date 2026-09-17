# Phase 1 verification

Verified on 2026-09-16 with the system Python 3.9 runtime.

## Commands

```bash
PYTHONPATH=src python3 -m unittest discover -s tests -v
PYTHONPATH=src python3 -m agent_liaison.demo
python3 -m compileall -q src tests
```

## Evidence

Seven deterministic tests currently prove that:

- busy intervals are never returned as candidate slots;
- timestamps include an IANA time zone and a computed weekday;
- an unknown requester escalates without creating holds;
- an idempotency-key retry returns the original proposal;
- approval rechecks availability and fails closed after a new conflict;
- approval confirms one slot and deletes sibling holds; and
- TTL expiry invalidates all tentative holds.

The CLI demonstration produces separate requester and owner views. The requester
view contains only derived time slots, authority, state, and expiry. After owner
approval, it contains only the selected confirmed slot.

## Acceptance status

| Requirement | Status | Evidence or next step |
|---|---|---|
| Synthetic free/busy exclusion | Proven | `test_slots_exclude_busy_time_and_compute_weekday` |
| Time-zone-safe output | Proven | IANA zone and ISO timestamp assertions |
| Unknown requester fails closed | Proven | `test_unknown_requester_escalates_without_holds` |
| No private event metadata | Proven by model boundary | `InMemoryCalendar` stores intervals only |
| Retry safety | Proven | `test_retry_is_idempotent` |
| Expiring tentative holds | Proven | `test_expiry_removes_tentative_holds` |
| Redacted, versioned audit event | Proven | audit assertion and synthetic model boundary |
| No external side effects | Proven by dependency boundary | no network/calendar/channel adapter exists |
| Conversation extraction creates candidates | Deferred | channel adapter is Phase 2 work |
| Irrelevant conversation text is discarded | Deferred | channel adapter is Phase 2 work |

Phase 1 validates the policy and state-transition core. It does **not** yet prove
OpenClaw-to-OpenClaw delivery, Google Calendar authorization, or cross-Gateway A2A.
Those boundaries should be introduced separately so failures remain attributable.

## Same-Gateway tool boundary (Phase 1b)

Verified on OpenClaw 2026.9.4 with synthetic data:

1. Gateway health and connectivity probe passed after plugin installation.
2. The `agent-liaison` tool-only plugin loaded as enabled.
3. A Main probe could not see or call `request_synthetic_availability`.
4. A non-allowlisted Guest session could not see or call the tool.
5. The allowlisted Guest session saw exactly the added scheduling tool and
   called it successfully once.
6. The result was labelled `source=synthetic` and `authority=tentative`.
7. A redacted owner event was queued to the fixed Main session and its
   heartbeat run completed.

This proves tool visibility and a bounded synthetic handoff. It does **not**
prove Google Calendar access, real availability, owner approval callbacks,
external replies, or A2A interoperability.

## Same-Gateway owner-decision loop (Phase 2)

Implementation and live same-Gateway proof completed on 2026-09-16 with
OpenClaw 2026.9.4.

Proven with deterministic plugin tests:

- candidate proposals are idempotent and explicitly use
  `authority=candidate`, `source=policy_only`;
- candidate output does not claim Calendar or Node verification;
- only an explicit owner decision can produce `authority=confirmed`;
- confirmation retains only the selected slot;
- decline and expiry remove all candidate slots;
- one Guest session cannot retrieve another session's proposal; and
- all three tools are optional and intended for separate Guest/Owner allowlists.

Live runtime evidence:

- Main could not see or call the Guest-only candidate tool;
- a non-allowlisted Guest session could not see either Guest liaison tool;
- the allowlisted Guest created a `pending_owner` proposal with
  `authority=candidate` and `source=policy_only`;
- the result explicitly stated that neither Calendar nor Node data was checked;
- the owner event was queued only to the fixed Main session;
- Main recorded an explicit approval for one correlated slot;
- confirmation retained only the selected slot and queued a result to the
  originating Guest session;
- the originating Guest retrieved `authority=confirmed`; and
- a different Guest session could not retrieve or act on the proposal.

The Gateway-wide generic session surface was also reduced: session visibility is
now agent-scoped and generic agent-to-agent messaging is disabled. The liaison
plugin does not depend on either capability. A post-change deep security audit no
longer reports cross-agent session access.

Process-local proposal state intentionally fails closed after a Gateway restart;
durable recovery remains deferred until a storage design is selected and tested.

Google Calendar OAuth/FreeBusy and cross-Gateway A2A are deferred to Phase 3.
No refresh token was obtained during the paused setup; no Calendar access is active.

## Main-memory context boundary (Phase 2.1)

Implemented and live-tested on 2026-09-17 with OpenClaw 2026.9.4.

Deterministic plugin tests prove:

- a new request starts in `awaiting_context` without precomputed slots;
- oversized date ranges and out-of-window candidates fail closed;
- `main_memory` requires a memory-derived allowlisted context-basis label;
- `policy_only` cannot claim a memory-derived basis;
- only one to three unique, correctly sized candidate intervals are accepted;
- no memory excerpt exists in the proposal schema or derived output; and
- expiry, owner confirmation, decline, and requester-session isolation still hold.

Live runtime proof:

- Main could not see the Guest-only request tool;
- a non-allowlisted Guest session could not see the liaison request tool;
- the allowlisted Guest created a request in `awaiting_context` and queued it only to
  the fixed Main session;
- Main searched owner memory for relevant scheduling preferences and found none that
  justified a time choice;
- Main therefore submitted three bounded candidates with `source=policy_only` and
  `contextBasis=request_constraints_only` rather than fabricating a preference;
- the originating Guest retrieved the correlated `pending_owner` candidates;
- Main declined the synthetic verification proposal; and
- the same Guest retrieved `declined` with all candidate slots removed.

This proves the context-review control flow and its fail-closed fallback. It does not
yet prove a `main_memory` live result because no explicit durable scheduling preference
was present. The `main_memory` branch is covered by deterministic tests. Proposal state
remains process-local and is lost on Gateway restart.

## Owner notification regression (Phase 2.1.1)

Diagnosed on 2026-09-17 after a real Guest request returned a proposal ID but the
owner received no review message.

Observed failure:

- the Guest tool had executed and the proposal existed;
- the proposal later expired in `source=unreviewed`, proving Main never submitted
  contextual candidates;
- the plugin reported only that a system event was queued;
- the fixed owner target was the root Home session, which retained a legacy channel
  route; and
- recurring heartbeat was disabled, so queue acceptance did not prove execution or
  delivery.

Regression coverage now proves that a Guest request schedules both:

- an immediate Main owner turn with `deliveryMode=announce`; and
- a two-hour pending-owner reminder turn.

The plugin reports `ownerNotificationScheduled` and `ownerReminderScheduled`, not the
ambiguous `queued` label. Contextual candidates and final owner decisions also use
immediate session-turn scheduling. Recording a decision removes the pending reminder.
The runtime owner destination must be the owner's direct Main session, never the
non-deletable root Home session.

Headless `openclaw agent` probes intentionally disable plugin global side effects in
OpenClaw 2026.9.4. Such a probe can verify tool visibility and proposal creation, but
it returns `ownerNotificationScheduled=false` and cannot prove LINE delivery. The
plugin and Guest instructions therefore report scheduling only when the host returns
a scheduler handle. A real inbound Guest LINE request is required for final live proof
of the immediate owner turn and conditional two-hour reminder.
