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
