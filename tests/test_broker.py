from __future__ import annotations

import unittest
from datetime import date, datetime, time, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from agent_liaison.broker import (
    InMemoryCalendar,
    LiaisonBroker,
    ProposalConflict,
    RequestValidationError,
)
from agent_liaison.models import AvailabilityRequest, HoldState, ProposalState


TZ = ZoneInfo("Asia/Taipei")
NOW = datetime(2026, 9, 16, 1, 0, tzinfo=timezone.utc)


def request(**overrides: object) -> AvailabilityRequest:
    values: Dict[str, object] = {
        "requester_id": "trusted-requester",
        "idempotency_key": "request-001",
        "start_date": date(2026, 9, 21),
        "end_date": date(2026, 9, 23),
        "duration_minutes": 120,
        "earliest_start": time(18, 0),
        "latest_end": time(22, 0),
        "timezone": "Asia/Taipei",
        "purpose_class": "personal_visit",
    }
    values.update(overrides)
    return AvailabilityRequest(**values)  # type: ignore[arg-type]


class LiaisonBrokerTests(unittest.TestCase):
    def make_broker(
        self, busy: Optional[List[Tuple[datetime, datetime]]] = None
    ) -> LiaisonBroker:
        return LiaisonBroker(
            calendar=InMemoryCalendar(busy),
            allowed_requesters={"trusted-requester"},
            now=NOW,
        )

    def test_slots_exclude_busy_time_and_compute_weekday(self) -> None:
        broker = self.make_broker(
            [(datetime(2026, 9, 21, 18, 0, tzinfo=TZ), datetime(2026, 9, 21, 20, 0, tzinfo=TZ))]
        )
        proposal = broker.submit(request())
        self.assertEqual(proposal.state, ProposalState.PROPOSED)
        self.assertTrue(all(slot.start >= datetime(2026, 9, 21, 20, 0, tzinfo=TZ) for slot in proposal.slots if slot.start.date() == date(2026, 9, 21)))
        self.assertEqual(proposal.slots[0].public_dict()["weekday"], "Monday")
        self.assertEqual(proposal.slots[0].public_dict()["timezone"], "Asia/Taipei")
        self.assertEqual(broker.audit[0]["policy_version"], "synthetic-v1")

    def test_unknown_requester_escalates_without_holds(self) -> None:
        broker = self.make_broker()
        proposal = broker.submit(request(requester_id="unknown"))
        self.assertEqual(proposal.state, ProposalState.ESCALATED)
        self.assertEqual(proposal.slots, [])
        self.assertEqual(broker.calendar.holds, {})

    def test_retry_is_idempotent(self) -> None:
        broker = self.make_broker()
        first = broker.submit(request())
        second = broker.submit(request())
        self.assertIs(first, second)
        self.assertEqual(len(broker.proposals), 1)

    def test_approval_confirms_one_and_deletes_siblings(self) -> None:
        broker = self.make_broker()
        proposal = broker.submit(request())
        selected = proposal.slots[1]
        broker.approve(proposal.proposal_id, selected.slot_id)
        states = {
            hold.slot.slot_id: hold.state for hold in broker.calendar.holds.values()
        }
        self.assertEqual(proposal.state, ProposalState.CONFIRMED)
        self.assertEqual(states[selected.slot_id], HoldState.CONFIRMED)
        self.assertEqual(
            [slot["slot_id"] for slot in proposal.guest_view()["slots"]],
            [selected.slot_id],
        )
        self.assertTrue(all(state == HoldState.DELETED for slot_id, state in states.items() if slot_id != selected.slot_id))

    def test_conflict_before_approval_fails_closed(self) -> None:
        broker = self.make_broker()
        proposal = broker.submit(request())
        selected = proposal.slots[0]
        broker.calendar.add_busy(selected.start, selected.end)
        with self.assertRaises(ProposalConflict):
            broker.approve(proposal.proposal_id, selected.slot_id)
        self.assertEqual(proposal.state, ProposalState.REPLAN_PROPOSED)
        self.assertTrue(all(hold.state == HoldState.DELETED for hold in broker.calendar.holds.values()))

    def test_expiry_removes_tentative_holds(self) -> None:
        broker = self.make_broker()
        proposal = broker.submit(request())
        broker.advance_time(timedelta(hours=3))
        self.assertEqual(proposal.state, ProposalState.EXPIRED)
        self.assertTrue(all(hold.state == HoldState.EXPIRED for hold in broker.calendar.holds.values()))

    def test_invalid_timezone_is_rejected(self) -> None:
        broker = self.make_broker()
        with self.assertRaises(RequestValidationError):
            broker.submit(request(timezone="Not/AZone"))


if __name__ == "__main__":
    unittest.main()
