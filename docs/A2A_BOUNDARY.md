# A2A and bounded capability boundaries

## The short distinction

A2A standardizes how independent agents discover capabilities, authenticate, exchange
Messages and structured Parts, and manage Task lifecycles. A bounded scheduling
capability defines what an authenticated caller may ask, what data the server may
read, which actions require human approval, and what result may leave the boundary.

A2A can carry the capability, but it does not replace the capability's policy.

| Concern | Generic internal session message | Typed liaison capability | Cross-system A2A |
|---|---|---|---|
| Primary purpose | Trigger another local session | Enforce one business operation | Interoperate across independent agents |
| Discovery | Local configuration | Fixed local registration | Agent Card and Skills |
| Payload | Often free-form prompt | Validated scheduling schema | Message Parts: text, file, or structured data |
| Lifecycle | Session turn | Proposal / hold / approval state | Standard Task lifecycle and updates |
| Authentication | Gateway/session policy | Known internal caller + requester policy | HTTP authentication advertised by Agent Card |
| Authorization | Must be configured separately | Built into operation and data boundary | Implemented by the A2A server, ideally per Skill |
| Prompt-injection resistance | Weak when raw text is forwarded | Stronger through parsing, allowlists, and derived output | Still an application responsibility |

## Why authentication is not enough

Authentication answers “who is calling?” Authorization answers “which operation and
data may this identity use?” Input validation asks whether the request conforms to
the declared contract. Prompt-injection defense decides how untrusted content may
influence models and tools. Audit records what happened. These controls are related
but not interchangeable.

An authenticated remote agent can still send malicious or manipulated instructions.
The scheduling server must therefore avoid forwarding raw remote text into a privileged
owner-agent context. It should normalize the request into fields such as:

```json
{
  "requester_id": "derived-authenticated-identity",
  "date_range": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"},
  "duration_minutes": 120,
  "earliest_start": "18:00",
  "timezone": "Area/Location",
  "purpose_class": "personal_visit"
}
```

The server then validates the caller's scheduling scope, queries derived availability,
and returns only proposal IDs, slots, authority labels, and expiry. Raw event data,
owner memory, credentials, nodes, and session transcripts remain outside the A2A
surface.

## Evolution path

### Same Gateway

Use a local typed broker with a fixed destination. Do not grant the guest a general
cross-session prompt channel merely to implement one scheduling operation.

### Independent agents

Expose the broker as an A2A Server Skill such as `request_availability`:

- publish a protected Agent Card;
- require HTTPS and OAuth or another suitable HTTP authentication scheme;
- authorize the caller per Skill and requester identity;
- accept a structured Data Part rather than arbitrary instructions;
- represent long-running human approval as a Task;
- return status updates without revealing private calendar details;
- enforce TTL, idempotency, rate limits, audit, and cancellation.

The A2A Client may be another person's agent, but the Liaison remains the policy
enforcement point and gatekeeper for calendars and owner approval.

## Primary references

- [A2A Protocol Specification 1.0](https://a2a-protocol.org/latest/specification/)
- [A2A core concepts](https://a2a-protocol.org/latest/topics/key-concepts/)
- [A2A agent discovery and Agent Cards](https://a2a-protocol.org/latest/topics/agent-discovery/)
- [A2A enterprise authentication and authorization](https://a2a-protocol.org/latest/topics/enterprise-ready/)
