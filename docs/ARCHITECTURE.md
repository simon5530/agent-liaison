# Architecture

## Principle

Keep private calendar access behind a narrow availability boundary. The
conversation-facing agent receives derived facts such as “busy” or “three valid
slots,” not raw calendar objects.

```mermaid
flowchart TB
  subgraph External
    User[Requester]
    Owner[Owner approval]
    Group[Opt-in group conversation]
  end

  subgraph Liaison
    Channel[Channel adapter]
    Identity[Identity and trust resolver]
    Policy[Authority policy engine]
    State[Proposal / hold state machine]
    Audit[(Redacted audit log)]
    Inbox[Owner conversation inbox]
  end

  subgraph PrivateBoundary[Private calendar boundary]
    FreeBusy[Free/busy adapter]
    Preferences[(Working preferences)]
    Calendar[(Calendar provider)]
    Holds[(Agent Holds calendar)]
  end

  User --> Channel --> Identity --> Policy
  Group --> Channel
  Calendar --> FreeBusy --> Policy
  Preferences --> Policy
  Policy --> State --> Channel
  Policy -->|approval required| Owner
  Owner --> State
  State --> Inbox
  State -->|temporary block| Holds
  Policy --> Audit
  State --> Audit
```

## State machine

```text
DETECTED
  ├─ no scheduling intent ─────→ DISCARDED
  └─ scheduling intent ────────→ CANDIDATE
                                  ├─ missing facts ─────→ NEEDS_CONTEXT
                                  ├─ conflict ──────────→ REPLAN_PROPOSED
                                  └─ complete request ──→ REQUESTED
REQUESTED
  ├─ invalid / unauthorized ─→ DECLINED
  ├─ uncertain / high impact ─→ AWAITING_OWNER
  └─ safe candidate found ────→ PROPOSED
                                  ├─ reversible hold ─→ HELD (expires)
                                  ├─ owner approves ──→ CONFIRMED
                                  ├─ requester rejects → DECLINED
                                  └─ TTL reached ─────→ EXPIRED
```

Confirmed events are never moved or cancelled solely by priority scoring. A conflict
creates a recommendation for the owner; only an explicit approval changes the
authoritative calendar.

## Why a dedicated boundary

The existing public-facing `guest` agent should not receive general calendar
access. A future OpenClaw implementation should expose a narrow capability such
as `query_availability(range, duration, requester_class)` and keep raw event data
inside the owner-controlled service or a dedicated scheduling agent.

## Reliability patterns

- idempotency key per request to prevent duplicate holds;
- optimistic concurrency or compare-and-swap before confirmation;
- explicit TTL and cleanup job for soft holds;
- event-driven notification for calendar changes;
- deterministic policy rules before optional LLM wording;
- correlation IDs across channel, policy, calendar, and audit records.
- source minimization: retain a message identifier and extracted scheduling facts,
  not an unrelated group transcript;
- separate calendars or metadata for tentative holds and confirmed commitments.
