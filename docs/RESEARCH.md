# Existing-solution preflight

Checked on 2026-09-13.

## Google Calendar API

- [Freebusy query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
  returns busy intervals for a requested range.
- [OAuth scopes](https://developers.google.com/workspace/calendar/api/auth) support
  least-privilege authorization.
- [Events watch](https://developers.google.com/workspace/calendar/api/v3/reference/events/watch)
  and [push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
  can notify a service when events change.

**Use it for:** provider-backed availability and later event lifecycle.

**Gap:** it does not define who the agent may represent, how tentative answers are
communicated, or when a decision must be escalated.

## Cal.com / Cal.diy

- [API v2](https://cal.com/docs/api-reference/v2/introduction) supports scheduling APIs.
- [Schedules](https://cal.com/docs/api-reference/v2/schedules/create-a-schedule)
  model availability and time-zone overrides.
- [Bookings](https://cal.com/docs/api-reference/v2/bookings/create-a-booking)
  create appointments.
- Cal.com announced that its production codebase became private in 2026; its
  community self-hosted option is [Cal.diy](https://cal.com/blog/cal-diy-open-source-to-closed-source).

**Use it for:** a scheduling backend if Google-specific integration becomes too narrow.

**Gap:** generic booking workflows still do not provide deployment-specific delegated
authority, provisional answers, or a cross-channel communication buffer.

## Standards

- [RFC 5545 iCalendar](https://datatracker.ietf.org/doc/html/rfc5545) defines the
  portable event format and `VFREEBUSY` component.
- [RFC 4791 CalDAV](https://datatracker.ietf.org/doc/html/rfc4791) defines calendar
  access over WebDAV, including free/busy queries.

## Build / buy decision

Do not build calendar storage, recurrence rules, or provider synchronization.
Prototype only the thin liaison layer:

1. identity and requester trust class;
2. explicit delegated-authority policy;
3. tentative/confirmed state model;
4. privacy-preserving availability responses;
5. escalation and audit.

This keeps the custom portion small and tests the unique product hypothesis.

## Agent action-zone preflight

Checked on 2026-09-18.

### Security model

- [NIST SP 800-207 Zero Trust Architecture](https://www.nist.gov/publications/zero-trust-architecture)
  removes implicit trust based on network location or ownership and requires explicit
  authentication and authorization around protected resources.
- [OWASP Agentic AI Threats and Mitigations](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/)
  treats agent autonomy as a threat-model problem rather than a prompt-only problem.
- [Open Policy Agent](https://www.openpolicyagent.org/docs/latest/) separates policy
  decision from enforcement and can evaluate structured identity, resource, network,
  time, and action inputs.
- [OpenFGA](https://github.com/openfga/openfga) provides fine-grained relationship-
  based authorization, but it does not sandbox execution or decide scheduling-domain
  consequences by itself.

### Agent-specific infrastructure

- [Microsoft Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit)
  combines action interception, policy enforcement, identity, approval, sandboxing,
  and audit. Its README marked the project Public Preview on the check date. This is
  the closest existing implementation of the general action-zone concept.
- [agentgateway](https://github.com/agentgateway/agentgateway) is an open-source Linux
  Foundation data plane for LLM, MCP, and A2A traffic with authentication, RBAC/CEL
  policy, rate limiting, guardrails, and OpenTelemetry. It governs traffic but is not
  a complete business-state or execution-isolation layer.
- [Kubernetes SIG Agent Sandbox](https://github.com/kubernetes-sigs/agent-sandbox)
  manages isolated, stateful agent workloads and delegates low-level isolation to
  runtimes such as gVisor or Kata Containers. It is a sandbox orchestrator, not the
  scheduling authorization policy.
- [E2B](https://github.com/e2b-dev/E2B) and
  [OpenSandbox](https://github.com/opensandbox-group/OpenSandbox) provide isolated
  execution environments for agent code and tools. Sandboxing limits computation;
  it does not by itself prevent an authorized tool from making an unsafe business
  change.

### Build / buy decision

Do not build another generic sandbox, agent gateway, identity provider, or policy
language. Compose existing controls where production deployment needs them. Keep the
custom layer at the domain boundary:

1. authenticate the requesting human or agent and bind delegation depth;
2. normalize free-form input into a typed scheduling intent;
3. authorize data reads and actions against policy and current state;
4. expose only derived availability and opaque proposal identifiers;
5. stage reversible effects and require approval for commitments or displacement;
6. re-check policy immediately before each external effect;
7. emit correlated, tamper-evident decision and effect receipts.

The market validates the architecture but also removes the case for a separate broad
platform. Agent Liaison should prove the scheduling-specific policy and state machine
on a small local deployment first.
