# Architecture

## Principle

Keep authority and private context behind a narrow liaison boundary. In the current
phase the conversation-facing agent receives only its own memory, requester-provided
constraints, candidate status, and the owner's final decision. Calendar and Node
sources are not consulted.

```mermaid
flowchart TB
  subgraph External
    User[Requester]
    Owner[Owner approval]
  end

  subgraph Liaison
    Channel[Channel adapter]
    Identity[Identity and trust resolver]
    Policy[Authority policy engine]
    State[Proposal / hold state machine]
    Audit[(Redacted audit log)]
    Inbox[Owner conversation inbox]
  end

  subgraph PrivateBoundary[Owner authority boundary]
    Preferences[(Guest-visible policy context)]
    Decision[Explicit owner decision]
    Future[(Future: Calendar + Node adapters)]
  end

  User --> Channel --> Identity --> Policy
  Preferences --> Policy
  Policy --> State --> Channel
  Policy -->|approval required| Owner
  Owner --> State
  State --> Inbox
  Decision --> State
  Future -. later .-> Policy
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

The public-facing `guest` agent does not receive general Calendar, Node, owner
memory, or transcript access. It receives a narrow capability that creates a
candidate proposal from bounded fields. Future source adapters remain behind the
owner-controlled boundary and return only derived facts.

## Reliability patterns

- idempotency key per request to prevent duplicate holds;
- optimistic concurrency or compare-and-swap before confirmation;
- explicit TTL and cleanup job for soft holds;
- event-driven notification for calendar changes;
- deterministic policy rules before optional LLM wording;
- correlation IDs across channel, policy, calendar, and audit records.
- source minimization: retain a message identifier and extracted scheduling facts,
  not an unrelated conversation transcript;
- separate calendars or metadata for tentative holds and confirmed commitments.

## Brokered owner-agent handoff

The requester-facing guest agent remains minimal. It does not receive calendar,
node, owner-memory, session-history, or arbitrary cross-agent tools. Instead it may
submit one validated scheduling request to a broker with a fixed owner-agent target.

```mermaid
sequenceDiagram
    participant R as Requester
    participant G as Guest agent
    participant B as Liaison broker
    participant M as Owner agent
    participant O as Owner

    R->>G: ask for available times
    G->>B: structured request
    B->>M: validated candidate
    M-->>G: labeled candidate options
    M->>O: approval packet
    O->>M: select one option
    M-->>G: confirmed result
    G-->>R: confirmation
```

The broker accepts scheduling fields rather than arbitrary prompts. Candidate times
are derived from explicit constraints and Guest-visible policy only; they are not
claims of real availability. Generic session messaging would enlarge the
prompt-injection and transcript-access surface.
