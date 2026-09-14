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

## Open decisions

- Google Calendar only versus a provider-neutral adapter after Phase 1.
- Whether a “soft hold” should be a real private calendar event or internal state.
- How requester identity and trust tiers map across LINE, email, and other channels.
- What categories of non-scheduling provisional answers are safe enough to explore.
