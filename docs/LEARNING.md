# Learning notes

This file records reusable protocols and engineering patterns encountered while
building Agent Liaison.

## Calendar and identity protocols

| Topic | What it solves | Why it matters here |
|---|---|---|
| OAuth 2.0 | Delegated access without sharing a password | Request only free/busy access before event-write access |
| iCalendar (RFC 5545) | Portable calendar/event representation | Defines events, time zones, recurrence, and `VFREEBUSY` |
| CalDAV (RFC 4791) | Standard calendar access over WebDAV | Provider-neutral free/busy and calendar operations |
| IANA TZ database | Canonical time-zone identifiers | Prevents ambiguous local times and daylight-saving bugs |
| Webhooks | Provider pushes change notifications | Revalidate proposals when a calendar changes |

## Distributed-system patterns

### Idempotency

A retry should produce the same result rather than duplicate a hold or booking.
The caller supplies an idempotency key; the service stores the first outcome and
returns it for later identical retries.

### Soft hold with TTL

A tentative reservation is reversible and expires automatically. TTL means
“time to live”: after the deadline, the hold becomes invalid unless explicitly
confirmed.

### Optimistic concurrency

Availability may change between proposal and confirmation. Before committing,
compare the calendar version or re-query availability; if it changed, reject or
renegotiate instead of overwriting silently.

### State machine

Represent `PROPOSED`, `HELD`, `CONFIRMED`, `EXPIRED`, and `DECLINED` explicitly.
This prevents vague natural-language responses from accidentally becoming an
authoritative commitment.

### Least privilege and data minimization

Expose only the capability and fields required for the decision. A guest-facing
agent needs “available/not available,” not event titles, attendees, notes, or
locations.

### Policy before language model

Use deterministic code for authorization and state transitions. An LLM may parse
or phrase a request, but it must not invent permissions or bypass the policy engine.

## Review questions

1. What is the difference between availability data and calendar event data?
2. Why must a tentative hold have both a TTL and an authority label?
3. How does idempotency protect against webhook or network retries?
4. Why should confirmation re-check availability?
5. Which decisions belong in deterministic policy rather than an LLM prompt?
