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

## Open decisions

- Google Calendar only versus a provider-neutral adapter after Phase 1.
- Which policy tier may create a private hold or send a labeled tentative reply
  without asking first.
- How requester identity and trust tiers map across LINE, email, and other channels.
- What categories of non-scheduling provisional answers are safe enough to explore.
