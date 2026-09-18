# Idea log

## 2026-09-13 — Agent Liaison / 三號電池

### Raw idea

An agent familiar with its owner's daily calendar and working style can act as a
third participant or buffer. If someone cannot reach the owner but needs them, the
agent can provide a safe tentative answer or help arrange a meeting.

### Value hypothesis

Reduce coordination latency without requiring the owner to be continuously
available and without giving outsiders direct access to private context.

### Decision

**CONTINUE to a bounded synthetic prototype.** Calendar integration is feasible
with standard APIs. The valuable experiment is delegated authority, not calendar
storage.

### Drop conditions

- a normal booking link solves the target user's real problem;
- users repeatedly confuse tentative and confirmed responses;
- safe operation requires revealing broad private context;
- the authority policy becomes too personalized to test or explain reliably.

## 2026-09-18 — Policy-enforced agent action zone

### Raw idea

Future scheduling may be handled mostly by agents, with the owner reviewing only
exceptions. Callers may also be agents whose internal prompts, models, tools, and
reasoning are outside our control. Instead of trying to govern how every external
agent thinks, define a field in which every request and effect is constrained by the
same identity, data, action, budget, approval, and audit boundaries.

### Value hypothesis

A deterministic action boundary can allow more routine coordination to complete
autonomously without trusting an agent's internal reasoning. The owner supervises
policy and exceptions rather than every scheduling turn.

### Decision

**CONTINUE as an Agent Liaison architecture hypothesis; do not create a separate
general-purpose agent-security platform.** Existing projects already provide agent
sandboxes, gateways, policy engines, identity, and governance controls. The useful
prototype is the scheduling-specific composition: typed requests, derived calendar
data, reversible holds, explicit authority tiers, effect-time checks, and auditable
receipts.

### Drop conditions

- the same safety and owner-interruption targets can be met by configuration of an
  existing governance product with no scheduling-specific layer;
- policies cannot be explained or tested independently of model behavior;
- autonomous handling does not reduce owner interruptions in measured use;
- safe recovery requires unrestricted calendar, conversation, or identity access.
