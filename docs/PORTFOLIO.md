# Portfolio framing

## Deployment Strategist narrative

This project demonstrates translation of a fuzzy request—“let my agent stand in
for me when I am unavailable”—into a bounded workflow with explicit stakeholders,
authority, privacy, reliability, and deployment constraints.

Its differentiating hypothesis is **explainable delegation learning**: repeated human
decisions become structured evidence for an owner-visible scheduling policy. The
system begins conservatively, proposes interpretable rules for review, and reduces
interruptions only within approved decision classes. This connects human-in-the-loop
AI, policy governance, and a practical coordination workflow without requiring a new
destination application.

## Evidence to collect

- before/after coordination time for representative scenarios;
- percentage of requests safely resolved without owner interruption;
- false-proposal and stale-hold rate;
- privacy tests proving event details never cross the availability boundary;
- replayable audit trail for every decision;
- precision, recall, abstention rate, and owner override rate for proposed policy
  rules before any reduction in confirmation frequency;
- evidence that every active learned rule has an owner approval, version, rationale,
  and rollback path;
- screenshots with synthetic identities and data only;
- failure demonstrations for unknown identity, DST ambiguity, conflict, and retry.

## Current evidence

- idea captured and continue/drop gate defined;
- existing-solution and standards preflight completed;
- first-release acceptance criteria and security boundaries documented;
- same-Gateway typed broker and owner-approval loop implemented and runtime-verified;
- bounded Main-memory candidate review implemented with fail-closed fallback when
  no explicit scheduling preference exists;
- explainable policy learning defined as planned Phase 2.2 work; no automatic policy
  inference or activation has been implemented yet;
- no live-calendar validation yet.
