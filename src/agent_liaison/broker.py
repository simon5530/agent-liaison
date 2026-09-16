from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from itertools import count
from typing import Dict, List, Optional, Set, Tuple
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .models import (
    AvailabilityRequest,
    Hold,
    HoldState,
    Proposal,
    ProposalState,
    Slot,
)


class RequestValidationError(ValueError):
    pass


class ProposalConflict(RuntimeError):
    pass


class InMemoryCalendar:
    """Synthetic calendar boundary; stores intervals, never event metadata."""

    def __init__(self, busy: Optional[List[Tuple[datetime, datetime]]] = None) -> None:
        self.busy = list(busy or [])
        self.holds: Dict[str, Hold] = {}

    def is_free(
        self,
        start: datetime,
        end: datetime,
        *,
        ignore_hold_ids: Optional[Set[str]] = None,
    ) -> bool:
        ignore = ignore_hold_ids or set()
        intervals = list(self.busy)
        intervals.extend(
            (hold.slot.start, hold.slot.end)
            for hold_id, hold in self.holds.items()
            if hold_id not in ignore
            and hold.state in {HoldState.TENTATIVE, HoldState.CONFIRMED}
        )
        return all(end <= busy_start or start >= busy_end for busy_start, busy_end in intervals)

    def add_busy(self, start: datetime, end: datetime) -> None:
        self.busy.append((start, end))


class LiaisonBroker:
    ALLOWED_PURPOSES = {"personal_visit", "meeting", "appointment"}
    POLICY_VERSION = "synthetic-v1"

    def __init__(
        self,
        *,
        calendar: InMemoryCalendar,
        allowed_requesters: Set[str],
        now: Optional[datetime] = None,
        hold_ttl: timedelta = timedelta(hours=2),
    ) -> None:
        self.calendar = calendar
        self.allowed_requesters = set(allowed_requesters)
        self.now = now or datetime.now(timezone.utc)
        self.hold_ttl = hold_ttl
        self.proposals: Dict[str, Proposal] = {}
        self.idempotency_index: Dict[str, str] = {}
        self.audit: List[Dict[str, str]] = []
        self._ids = count(1)

    def submit(self, request: AvailabilityRequest) -> Proposal:
        self._validate(request)
        prior_id = self.idempotency_index.get(request.idempotency_key)
        if prior_id:
            return self.proposals[prior_id]

        proposal_id = f"proposal-{next(self._ids):04d}"
        expires_at = self.now + self.hold_ttl

        if request.requester_id not in self.allowed_requesters:
            proposal = Proposal(
                proposal_id=proposal_id,
                request=request,
                state=ProposalState.ESCALATED,
                expires_at=expires_at,
                reason_code="REQUESTER_NOT_ALLOWLISTED",
            )
            self._store(proposal)
            return proposal

        slots = self._find_slots(request, limit=3)
        proposal = Proposal(
            proposal_id=proposal_id,
            request=request,
            state=ProposalState.PROPOSED if slots else ProposalState.ESCALATED,
            expires_at=expires_at,
            slots=slots,
            reason_code="SLOTS_FOUND" if slots else "NO_VALID_SLOT",
        )
        self._store(proposal)
        for slot in slots:
            hold_id = f"{proposal_id}:{slot.slot_id}"
            self.calendar.holds[hold_id] = Hold(hold_id, proposal_id, slot)
        return proposal

    def approve(self, proposal_id: str, slot_id: str) -> Proposal:
        proposal = self.proposals[proposal_id]
        if self.now >= proposal.expires_at:
            self._expire(proposal)
            raise ProposalConflict("proposal expired")
        if proposal.state != ProposalState.PROPOSED:
            raise ProposalConflict(f"proposal is {proposal.state.value}")

        selected = next((slot for slot in proposal.slots if slot.slot_id == slot_id), None)
        if selected is None:
            raise ProposalConflict("unknown slot")

        sibling_ids = {
            f"{proposal_id}:{slot.slot_id}" for slot in proposal.slots
        }
        if not self.calendar.is_free(
            selected.start, selected.end, ignore_hold_ids=sibling_ids
        ):
            self._delete_holds(proposal, state=HoldState.DELETED)
            proposal.state = ProposalState.REPLAN_PROPOSED
            proposal.reason_code = "AVAILABILITY_CHANGED"
            self._audit(proposal, "approval_conflict")
            raise ProposalConflict("availability changed")

        for slot in proposal.slots:
            hold = self.calendar.holds[f"{proposal_id}:{slot.slot_id}"]
            hold.state = (
                HoldState.CONFIRMED if slot.slot_id == slot_id else HoldState.DELETED
            )
        proposal.state = ProposalState.CONFIRMED
        proposal.selected_slot_id = slot_id
        proposal.reason_code = "OWNER_APPROVED"
        self._audit(proposal, "confirmed")
        return proposal

    def advance_time(self, delta: timedelta) -> None:
        self.now += delta
        for proposal in self.proposals.values():
            if proposal.state == ProposalState.PROPOSED and self.now >= proposal.expires_at:
                self._expire(proposal)

    def owner_packet(self, proposal: Proposal) -> Dict[str, object]:
        return {
            **proposal.guest_view(),
            "requester_id": proposal.request.requester_id,
            "purpose_class": proposal.request.purpose_class,
            "action_required": proposal.state == ProposalState.PROPOSED,
        }

    def _find_slots(self, request: AvailabilityRequest, *, limit: int) -> List[Slot]:
        tz = ZoneInfo(request.timezone)
        duration = timedelta(minutes=request.duration_minutes)
        day = request.start_date
        slots: List[Slot] = []
        while day <= request.end_date and len(slots) < limit:
            cursor = datetime.combine(day, request.earliest_start, tzinfo=tz)
            day_end = datetime.combine(day, request.latest_end, tzinfo=tz)
            while cursor + duration <= day_end and len(slots) < limit:
                if self.calendar.is_free(cursor, cursor + duration):
                    slots.append(Slot(f"slot-{len(slots) + 1}", cursor, cursor + duration))
                cursor += timedelta(minutes=30)
            day += timedelta(days=1)
        return slots

    def _validate(self, request: AvailabilityRequest) -> None:
        if not request.idempotency_key or len(request.idempotency_key) > 128:
            raise RequestValidationError("invalid idempotency key")
        if request.end_date < request.start_date:
            raise RequestValidationError("end date precedes start date")
        if (request.end_date - request.start_date).days > 14:
            raise RequestValidationError("date range exceeds 14 days")
        if request.duration_minutes < 30 or request.duration_minutes > 480:
            raise RequestValidationError("duration outside 30-480 minutes")
        if request.latest_end <= request.earliest_start:
            raise RequestValidationError("invalid daily window")
        if request.purpose_class not in self.ALLOWED_PURPOSES:
            raise RequestValidationError("unsupported purpose class")
        try:
            ZoneInfo(request.timezone)
        except ZoneInfoNotFoundError as exc:
            raise RequestValidationError("unknown IANA time zone") from exc

    def _store(self, proposal: Proposal) -> None:
        self.proposals[proposal.proposal_id] = proposal
        self.idempotency_index[proposal.request.idempotency_key] = proposal.proposal_id
        self._audit(proposal, "submitted")

    def _expire(self, proposal: Proposal) -> None:
        self._delete_holds(proposal, state=HoldState.EXPIRED)
        proposal.state = ProposalState.EXPIRED
        proposal.reason_code = "TTL_EXPIRED"
        self._audit(proposal, "expired")

    def _delete_holds(self, proposal: Proposal, *, state: HoldState) -> None:
        for slot in proposal.slots:
            hold = self.calendar.holds.get(f"{proposal.proposal_id}:{slot.slot_id}")
            if hold and hold.state == HoldState.TENTATIVE:
                hold.state = state

    def _audit(self, proposal: Proposal, event: str) -> None:
        self.audit.append(
            {
                "proposal_id": proposal.proposal_id,
                "event": event,
                "state": proposal.state.value,
                "at": self.now.isoformat(),
                "reason_code": proposal.reason_code,
                "policy_version": self.POLICY_VERSION,
            }
        )
