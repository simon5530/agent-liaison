from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from enum import Enum
from typing import Dict, List, Optional


class ProposalState(str, Enum):
    PROPOSED = "proposed"
    ESCALATED = "escalated"
    CONFIRMED = "confirmed"
    REPLAN_PROPOSED = "replan_proposed"
    EXPIRED = "expired"


class HoldState(str, Enum):
    TENTATIVE = "tentative"
    CONFIRMED = "confirmed"
    DELETED = "deleted"
    EXPIRED = "expired"


@dataclass(frozen=True)
class AvailabilityRequest:
    requester_id: str
    idempotency_key: str
    start_date: date
    end_date: date
    duration_minutes: int
    earliest_start: time
    latest_end: time
    timezone: str
    purpose_class: str


@dataclass(frozen=True)
class Slot:
    slot_id: str
    start: datetime
    end: datetime

    def public_dict(self) -> Dict[str, str]:
        timezone_name = getattr(self.start.tzinfo, "key", str(self.start.tzinfo))
        return {
            "slot_id": self.slot_id,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "weekday": self.start.strftime("%A"),
            "timezone": timezone_name,
        }


@dataclass
class Hold:
    hold_id: str
    proposal_id: str
    slot: Slot
    state: HoldState = HoldState.TENTATIVE


@dataclass
class Proposal:
    proposal_id: str
    request: AvailabilityRequest
    state: ProposalState
    expires_at: datetime
    slots: List[Slot] = field(default_factory=list)
    reason_code: str = ""
    selected_slot_id: Optional[str] = None

    def guest_view(self) -> Dict[str, object]:
        visible_slots = self.slots
        if self.state == ProposalState.CONFIRMED:
            visible_slots = [
                slot for slot in self.slots if slot.slot_id == self.selected_slot_id
            ]
        return {
            "proposal_id": self.proposal_id,
            "state": self.state.value,
            "authority": "confirmed" if self.state == ProposalState.CONFIRMED else "tentative",
            "expires_at": self.expires_at.isoformat(),
            "slots": [slot.public_dict() for slot in visible_slots],
        }
