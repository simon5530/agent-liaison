# Decisions

## ADR-001: Continue as a thin liaison prototype

- **Status:** accepted
- **Date:** 2026-09-13
- **Decision:** Build only the delegated-authority and provisional-response layer.
- **Reason:** Existing calendar products already solve synchronization and booking;
  the unique hypothesis is whether a trusted agent can reduce coordination delay
  without impersonation or privacy leakage.

## ADR-002: Start with synthetic data

- **Status:** accepted
- **Decision:** Phase 1 uses deterministic calendar and preference fixtures.
- **Reason:** The decision logic, wording, and authority boundaries can be tested
  without OAuth credentials, private data, or external side effects.

## ADR-003: Tentative by default

- **Status:** accepted
- **Decision:** External commitments remain approval-gated; reversible holds must
  be labeled and expire.
- **Reason:** False confirmation damages trust more than delayed coordination.

## ADR-004: Separate public conversation from private calendar data

- **Status:** accepted
- **Decision:** The guest-facing agent receives only derived availability through
  a narrow capability, never direct general calendar access.
- **Reason:** A prompt injection or routing mistake should not expose private events.

## ADR-005: Use existing conversations and calendars as the interface

- **Status:** accepted
- **Date:** 2026-09-15
- **Decision:** Use LINE for commands, clarification, approval, and provisional
  responses; use Google Calendar plus a separate Agent Holds calendar for schedule
  visibility. Do not build a standalone application for the initial releases.
- **Reason:** Coordination should happen where people already communicate and review
  time. Another destination app adds adoption cost without proving the delegated-
  authority hypothesis.
- **Tradeoff:** Channel and calendar capabilities constrain the interaction design,
  and a small private state/audit service is still required.

## ADR-006: Extract candidates, not commitments

- **Status:** accepted
- **Decision:** Scheduling language in a conversation creates a candidate record.
  Calendar writes, external replies, moving confirmed events, and cancellation remain
  governed by explicit authority and approval policies.
- **Reason:** Date extraction can be ambiguous, incomplete, or conversational rather
  than intentional. Treating extraction as commitment would create false bookings.

## ADR-007: Separate tentative holds from confirmed events

- **Status:** accepted for the first live write path
- **Decision:** Place reversible, expiring holds on a dedicated calendar and promote
  them only after approval. Use tentative status and blocking transparency when a hold
  is intended to reserve time.
- **Reason:** The owner needs one familiar visual surface while retaining a clear
  distinction between agent proposals and commitments.

## ADR-008: Keep guest minimal and add a narrow liaison broker

- **Status:** accepted
- **Date:** 2026-09-16
- **Decision:** The guest agent may submit only a schema-validated scheduling request
  to a fixed owner-agent workflow. It does not receive Calendar, Node, owner memory,
  session history, or a generic cross-agent messaging tool.
- **Reason:** Capability-specific delegation scales better than repeatedly adding
  broad data and device permissions to an untrusted conversation surface.
- **Tradeoff:** A broker and workflow state must be implemented and tested.

## ADR-009: Use internal handoff before a standard A2A protocol

- **Status:** accepted
- **Decision:** Treat guest-to-owner coordination as an internal agent-to-agent
  handoff on the same Gateway. Defer a cross-system A2A protocol until an independent
  external agent needs discovery, authentication, task exchange, and status updates.
- **Reason:** A standard network protocol adds no value while both agents share one
  runtime and trust administrator. The security requirement is a narrow capability,
  not more connectivity.

## ADR-010: Drop group monitoring

- **Status:** accepted
- **Date:** 2026-09-16
- **Decision:** Remove LINE group monitoring from the roadmap. Scheduling requests
  enter through direct requester-to-guest or owner-to-main conversations.
- **Reason:** Direct conversations satisfy the initial personal workflow with less
  privacy exposure and avoid group-bot constraints.

## ADR-011: Use read-only FreeBusy before Calendar writes

- **Status:** deferred to the cross-Gateway phase
- **Date:** 2026-09-16
- **Decision:** Phase 2 queries only Google Calendar FreeBusy with the
  `calendar.freebusy` OAuth scope. It returns derived slots and never reads event
  resources or writes holds.
- **Reason:** Real availability can be validated without granting access to event
  titles, attendees, locations, notes, or mutation APIs.
- **Tradeoff:** OpenClaw needs its own Google OAuth client; credentials from a
  ChatGPT/Codex connector cannot cross the runtime boundary.

## ADR-012: Prove the local owner-decision loop before Calendar and A2A

- **Status:** accepted
- **Date:** 2026-09-16
- **Decision:** Phase 2 completes the same-Gateway candidate → owner decision →
  Guest confirmation loop. Candidate times use only Guest-visible context and
  requester constraints. Google Calendar login and cross-Gateway A2A move together
  to Phase 3.
- **Reason:** Calendar data cannot compensate for an unreliable authority handoff.
  Proving correlation, expiry, explicit human approval, and bounded return delivery
  first keeps failures attributable and reduces active credentials.
- **Tradeoff:** Current candidate times are proposals, not verified availability.
  The system must say so clearly and may require more owner corrections.

## ADR-013: Disable generic cross-agent session access

- **Status:** accepted
- **Date:** 2026-09-16
- **Decision:** Scope session visibility to each agent and disable OpenClaw's generic
  agent-to-agent messaging. All requester-to-owner coordination must pass through
  the typed liaison tools.
- **Reason:** The workflow needs a scheduling capability, not transcript access or
  arbitrary prompt delivery. Removing the broader route reduces prompt-injection
  and accidental-disclosure risk without affecting the broker.

## Open decisions

- Whether a provider-neutral availability interface is needed when Calendar and A2A
  are introduced.
- Which policy tier may create a private hold or send a labeled tentative reply
  without asking first.
- How requester identity and trust tiers map across LINE, email, and other channels.
- What categories of non-scheduling provisional answers are safe enough to explore.
