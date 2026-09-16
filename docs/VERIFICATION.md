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

## Read-only Calendar boundary (Phase 2)

Implementation completed on 2026-09-16; live OAuth proof is pending.

Proven with mocked Google responses:

- the plugin calls only `oauth2.googleapis.com/token` and Calendar `freeBusy`;
- FreeBusy intervals are converted to derived slots and are never returned;
- overlapping candidate slots are excluded;
- output remains `authority=tentative` and `source=google_freebusy`;
- event title, attendee, location, description, and notes are not part of the
  adapter's response type;
- OAuth and Calendar failures fail closed; and
- the live tool is absent unless Google Calendar config exists and the same
  Guest agent/session allowlist passes.

Pending live evidence:

- Google OAuth consent with scope exactly `calendar.freebusy`;
- SecretRef resolution for client ID, client secret, and refresh token;
- a real FreeBusy probe with no event-detail disclosure;
- Main and non-allowlisted Guest tool-unavailable probes after restart; and
- removal of the synthetic tool from Guest's runtime allowlist.

Phase 2 still performs no Calendar writes, holds, confirmations, deletions, or
external replies.
