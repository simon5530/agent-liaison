# Domain language

## Scheduling intent

A message that asks about arranging time. It is evidence that coordination may be
needed, not permission to reserve or confirm time.

## Candidate proposal

One or more possible times generated from requester constraints and explicitly
available policy context. A candidate proposal does **not** claim that the owner is
free. It expires and always requires an owner decision.

## Tentative availability

A time that has been checked against an authoritative schedule source but has not
been approved by the owner. This term is reserved for a later calendar-connected
release; policy-only candidates are not tentative availability.

## Owner

The human whose time and authority are being represented. Only the owner can turn a
candidate proposal into a confirmed commitment in the current release.

## Owner decision

The owner's explicit approval of one candidate or rejection of the proposal. Agent
recommendations and inferred preferences are not owner decisions.

## Confirmed commitment

A time explicitly approved by the owner and safe for the requester-facing agent to
communicate as final. Calendar persistence is a separate later capability.

## Guest agent

The restricted requester-facing agent. It collects scheduling constraints, creates a
bounded candidate proposal, and communicates status. It does not receive the owner's
calendar, Node, private memory, transcript, or generic cross-agent messaging access.

## Owner agent

The owner's trusted assistant. It presents candidate proposals to the owner, records
the owner's decision, and returns that decision through the liaison workflow. It does
not make the decision on the owner's behalf.

## Liaison broker

The typed capability and state boundary between the Guest agent and Owner agent. It
accepts only scheduling fields, correlates the proposal and decision, enforces expiry,
and prevents arbitrary cross-agent prompt exchange.
