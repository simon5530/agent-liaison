# Requirements

## Release 1: synthetic decision prototype

### User story

As a meeting requester, I can ask for a time range and receive safe candidate
slots or a clearly labeled escalation without learning why the owner is busy.

### Inputs

- requester identity and trust class;
- participant identities;
- duration, acceptable date range, and time zone;
- urgency and optional location/channel;
- synthetic busy intervals and explicit owner preferences.

### Outputs

- decision: `PROPOSE_SLOTS`, `TENTATIVE_HOLD`, `ESCALATE`, or `DECLINE`;
- zero or more candidate intervals;
- human-readable reason that contains no private event data;
- authority level: `advisory`, `tentative`, or `confirmed`;
- expiry time for every tentative result;
- correlation ID for audit and retry safety.

## Acceptance criteria

1. Given synthetic busy intervals, returned slots never overlap a busy interval.
2. Returned times include an IANA time-zone identifier and unambiguous timestamp.
3. Unknown requester, participant, or time zone fails closed to `ESCALATE`.
4. The response never includes calendar title, attendee list, location, or notes.
5. Identical retried requests with the same idempotency key do not create duplicate holds.
6. A tentative hold expires automatically and is never presented as confirmed.
7. Every decision produces a redacted audit event with policy version and reason code.
8. No network, calendar write, or outbound message occurs in Release 1.

## Explicitly out of scope

- answering substantive business or personal questions on the owner's behalf;
- revealing event metadata or inferring private activity;
- final external booking without approval;
- supporting every calendar provider;
- autonomous rescheduling or cancellation;
- voice identity cloning or pretending the owner personally replied.

## Cost boundary

Phase 1 must run locally with deterministic fixtures. No paid scheduling service or
LLM is required for the policy decision path.
