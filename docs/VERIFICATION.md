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
