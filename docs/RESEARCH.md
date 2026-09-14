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
