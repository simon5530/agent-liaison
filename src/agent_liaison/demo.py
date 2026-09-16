from __future__ import annotations

import json
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from .broker import InMemoryCalendar, LiaisonBroker
from .models import AvailabilityRequest


def main() -> None:
    now = datetime(2026, 9, 16, 1, 0, tzinfo=timezone.utc)
    calendar = InMemoryCalendar(
        busy=[
            (
                datetime(2026, 9, 21, 18, 0, tzinfo=ZoneInfo("Asia/Taipei")),
                datetime(2026, 9, 21, 19, 0, tzinfo=ZoneInfo("Asia/Taipei")),
            )
        ]
    )
    broker = LiaisonBroker(
        calendar=calendar,
        allowed_requesters={"trusted-requester"},
        now=now,
    )
    request = AvailabilityRequest(
        requester_id="trusted-requester",
        idempotency_key="demo-visit-001",
        start_date=date(2026, 9, 21),
        end_date=date(2026, 9, 23),
        duration_minutes=120,
        earliest_start=time(18, 0),
        latest_end=time(22, 0),
        timezone="Asia/Taipei",
        purpose_class="personal_visit",
    )
    proposal = broker.submit(request)
    print("GUEST_TENTATIVE_OPTIONS")
    print(json.dumps(proposal.guest_view(), ensure_ascii=False, indent=2))
    print("OWNER_APPROVAL_PACKET")
    print(json.dumps(broker.owner_packet(proposal), ensure_ascii=False, indent=2))
    confirmed = broker.approve(proposal.proposal_id, proposal.slots[0].slot_id)
    print("GUEST_FINAL_RESULT")
    print(json.dumps(confirmed.guest_view(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
