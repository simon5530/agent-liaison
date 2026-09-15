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
- optional scheduling facts extracted from an owner conversation or an opt-in group
  message that directly mentions the owner or liaison.

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
9. Conversation extraction produces a `CANDIDATE`, not a confirmed event.
10. Irrelevant conversation text is discarded; audit records retain only the source
    reference, extracted scheduling facts, confidence, and reason code.

## Conversation-first live requirements

- Google Calendar is the initial authoritative schedule store.
- A separate Agent Holds calendar displays expiring tentative blocks.
- LINE direct messages provide recommendations, clarification, and approval actions.
- iPhone Calendar may display the same Google calendars; it is not a second source
  when account sync is already enabled.
- Apple/iCloud-only calendars and email extraction remain separate adapters added
  only after the Google Calendar workflow is reliable.
- Group monitoring is opt-in and visible to participants. Only direct mentions plus
  scheduling intent enter the candidate pipeline.
- Every recommendation shows source, requester, proposed time, conflict, authority
  level, expiry, and the action awaiting the owner.
- The owner can approve, propose alternatives, decline, ask for clarification, or
  revoke a previous delegation policy through conversation.

## Explicitly out of scope

- answering substantive business or personal questions on the owner's behalf;
- revealing event metadata or inferring private activity;
- final external booking without approval;
- supporting every calendar provider;
- autonomous rescheduling or cancellation;
- silent collection of complete group transcripts;
- automatic displacement of a confirmed event based only on model-estimated priority;
- voice identity cloning or pretending the owner personally replied.

## Cost boundary

Phase 1 must run locally with deterministic fixtures. No paid scheduling service or
LLM is required for the policy decision path.
