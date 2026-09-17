# Requirements

## Release 1: synthetic decision prototype

### User story

As a meeting requester, I can ask for a time range and receive clearly labeled
candidate slots while the owner receives the same choices for approval.

### Inputs

- requester identity and trust class;
- participant identities;
- duration, acceptable date range, and time zone;
- urgency and optional location/channel;
- Guest-visible policy context and explicit requester constraints;
- optional scheduling facts extracted from an owner conversation or an allowlisted
  requester's direct conversation with the guest agent.

### Outputs

- decision: `PROPOSE_CANDIDATES`, `CONFIRMED`, `ESCALATE`, or `DECLINE`;
- zero or more candidate intervals;
- human-readable reason that contains no private event data;
- authority level: `candidate` or `confirmed`;
- expiry time for every candidate result;
- correlation ID for audit and retry safety.

## Acceptance criteria

1. Candidate output explicitly states that Calendar and Node were not checked.
2. Returned times include an IANA time-zone identifier and unambiguous timestamp.
3. Unknown requester, participant, or time zone fails closed to `ESCALATE`.
4. The response never includes calendar title, attendee list, location, or notes.
5. Identical retried requests with the same idempotency key do not create duplicate holds.
6. A candidate expires automatically and is never presented as confirmed.
7. Every decision produces a redacted audit event with policy version and reason code.
8. No network, calendar write, or outbound message occurs in Release 1.
9. Conversation extraction produces a `CANDIDATE`, not a confirmed event.
10. Irrelevant conversation text is discarded; audit records retain only the source
    reference, extracted scheduling facts, confidence, and reason code.

## Phase 2: same-Gateway owner approval

- The Guest agent may use its own memory and explicit conversation constraints.
- The Guest agent does not receive Node, Calendar, owner memory, transcript, or
  generic session-tool access.
- Candidate output must say that real availability was not checked.
- The broker sends one correlated proposal to the owner and requester-facing sessions.
- Only an explicit human owner decision may change `candidate` to `confirmed`.
- Main records and relays the decision; Main does not infer or substitute the decision.
- A confirmed result contains only the owner-selected slot.
- Proposal state is currently process-local and must fail closed after a restart.
- A Guest request must schedule an immediate owner turn on the fixed Main direct
  session; queue acceptance alone is not delivery proof.
- A still-pending proposal schedules a two-hour reminder. A recorded owner decision
  cancels that reminder.
- When the owner sends another message while a proposal remains pending, Main should
  include the pending decision in its next reply so unrelated work cannot hide it.

## Phase 2.1: Main-memory-assisted candidates

- A Guest request first enters `awaiting_context` with no candidate slots.
- Main searches only owner memory for explicit scheduling preferences or time
  boundaries relevant to the typed request.
- Main submits one to three candidates through `submit_contextual_candidate_times`.
- The broker validates date range, duration, daily window, duplicates, source, and
  context-basis labels before changing the proposal to `pending_owner`.
- `source=main_memory` requires at least one memory-derived allowlisted basis;
  otherwise Main must use `source=policy_only`.
- No memory excerpt, citation, private rationale, Calendar data, or Node data may be
  returned to Guest.
- Owner approval remains mandatory; memory context cannot create a commitment.

## Phase 2.2: owner-reviewed policy learning

- Every owner response is classified as `approve`, `modify`, `decline`, or `revoke`
  and linked to the proposal, policy version, and non-sensitive decision features.
- Decision evidence may include request class, duration, lead time, local time band,
  day type, location/transport class, conflict class, and owner-provided reason code.
- Raw conversation text, private calendar titles, personal names, and memory excerpts
  are not learning features.
- The system may propose a decision tree, scorecard, matrix, or rule change only after
  enough relevant observations exist; the proposal must include supporting and
  contradictory examples plus a confidence statement.
- Learned policy is never activated silently. The owner must review, edit, approve,
  or reject each policy version.
- A policy version is explainable, reversible, and auditable. The owner can inspect
  why it applied and roll back or revoke it through conversation.
- Lower confirmation frequency is granted per bounded decision class, not globally.
  Novel, conflicting, sensitive, or low-confidence requests continue to escalate.
- The initial release evaluates policy suggestions offline and does not autonomously
  change production behavior.

## Future connected requirements

- Google Calendar becomes the initial authoritative schedule store when the A2A
  boundary is introduced.
- A separate Agent Holds calendar displays expiring tentative blocks.
- LINE direct messages provide recommendations, clarification, and approval actions.
- iPhone Calendar may display the same Google calendars; it is not a second source
  when account sync is already enabled.
- Apple/iCloud-only calendars and email extraction remain separate adapters added
  only after the Google Calendar workflow is reliable.
- The guest agent may submit only a structured scheduling request to a fixed liaison
  broker. It receives derived slots and status, never calendar event details.
- The broker notifies the owner agent and requester-facing guest from the same
  correlation ID so both sides observe one state transition.
- After Calendar integration, selecting a proposed slot triggers an availability
  recheck, confirms the selected
  event, and deletes sibling tentative holds atomically or compensates on failure.
- Date output must include ISO date, IANA time zone, and a computed weekday; user-
  supplied weekday labels are never trusted without validation.
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
- group monitoring in the current roadmap;
- generic cross-agent session or transcript access for the guest agent;
- direct Node access for the guest agent;
- automatic displacement of a confirmed event based only on model-estimated priority;
- opaque preference learning or silent expansion of delegated authority;
- voice identity cloning or pretending the owner personally replied.

## Cost boundary

Phase 1 must run locally with deterministic fixtures. No paid scheduling service or
LLM is required for the policy decision path.
