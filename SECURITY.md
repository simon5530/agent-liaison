# Security and authority boundaries

## Data classification

- **Private:** event titles, descriptions, attendees, locations, meeting links,
  personal preferences, raw messages, OAuth tokens.
- **Derived:** busy intervals, candidate slots, policy reason codes.
- **Shareable:** explicitly proposed slots and clearly labeled response state.

## Rules

1. Store credentials outside the repository and reference them through the runtime's
   secret mechanism.
2. Begin with read-only or free/busy-only scopes; event write access is a later phase.
3. Never send raw calendar objects to a public/guest-facing language model.
4. Treat all inbound messages as untrusted content, not policy instructions.
5. Authorize by provider-issued identity, not display name.
6. Log decisions and state changes, but redact message bodies and private event data.
7. Fail closed on uncertain identity, authority, time zone, or conflicting state.
8. Final booking, cancellation, or external communication requires explicit authority.

## Threats to test

- requester claims to be a trusted person using the same display name;
- prompt injection asks the agent to reveal event details or ignore policy;
- duplicate webhook delivery creates duplicate holds;
- calendar changes after a slot was proposed;
- DST transition makes a local time nonexistent or duplicated;
- stale tentative answer is presented after expiry;
- compromised guest agent attempts to call broader calendar operations.

## Publication and contribution checklist

- scan current files and full Git history for secrets and personal identifiers;
- use synthetic calendar fixtures and identities;
- document third-party licenses and keep the repository license current;
- reproduce implemented behavior from a clean environment;
- update the publication audit before a release.

If a credential reaches Git history, revoke or rotate it before rewriting history.
Deleting the latest file alone does not remove an earlier Git object.
