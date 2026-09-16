import { beforeEach, describe, expect, it } from "vitest";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import entry, {
  createCandidateProposal,
  getProposalStatus,
  recordOwnerDecision,
  resetProposalStoreForTests,
} from "./index.js";

const request = {
  startDate: "2026-09-21",
  endDate: "2026-09-23",
  durationMinutes: 120,
  earliestStart: "18:00",
  latestEnd: "22:00",
  timezone: "Asia/Taipei" as const,
  purposeClass: "personal_visit" as const,
  idempotencyKey: "request-001",
};

describe("agent-liaison", () => {
  beforeEach(() => resetProposalStoreForTests());

  it("declares only the bounded same-Gateway tools", () => {
    const metadata = getToolPluginMetadata(entry);
    expect(metadata?.tools.map((tool) => tool.name)).toEqual([
      "request_candidate_times",
      "check_candidate_status",
      "record_owner_scheduling_decision",
    ]);
    expect(metadata?.tools.every((tool) => tool.optional)).toBe(true);
  });

  it("creates idempotent policy-only candidates without claiming availability", () => {
    const now = new Date("2026-09-16T01:00:00Z");
    const first = createCandidateProposal(request, "guest-session", now);
    const retry = createCandidateProposal(request, "guest-session", now);
    expect(first.proposalId).toBe(retry.proposalId);
    expect(first.state).toBe("pending_owner");
    expect(first.authority).toBe("candidate");
    expect(first.source).toBe("policy_only");
    expect(first.slots).toHaveLength(3);
    expect(first.slots[0]?.weekday).toBe("Monday");
  });

  it("fails closed for an oversized range", () => {
    expect(() => createCandidateProposal(
      { ...request, endDate: "2026-10-20" },
      "guest-session",
    )).toThrow(/0 and 14 days/);
  });

  it("confirms only the owner-selected slot", () => {
    const proposal = createCandidateProposal(request, "guest-session", new Date("2026-09-16T01:00:00Z"));
    const result = recordOwnerDecision(
      proposal.proposalId,
      "approve",
      "slot-2",
      new Date("2026-09-16T01:10:00Z"),
    );
    expect(result.proposal.state).toBe("confirmed");
    expect(result.proposal.authority).toBe("confirmed");
    expect(result.proposal.slots).toEqual([result.proposal.selectedSlot]);
    expect(result.proposal.selectedSlot?.slotId).toBe("slot-2");
  });

  it("declines without retaining candidate slots", () => {
    const proposal = createCandidateProposal(request, "guest-session", new Date("2026-09-16T01:00:00Z"));
    const result = recordOwnerDecision(
      proposal.proposalId,
      "decline",
      undefined,
      new Date("2026-09-16T01:10:00Z"),
    );
    expect(result.proposal.state).toBe("declined");
    expect(result.proposal.slots).toEqual([]);
  });

  it("expires a candidate before an owner decision", () => {
    const proposal = createCandidateProposal(request, "guest-session", new Date("2026-09-16T01:00:00Z"));
    const expired = getProposalStatus(
      proposal.proposalId,
      "guest-session",
      new Date("2026-09-16T03:01:00Z"),
    );
    expect(expired.state).toBe("expired");
    expect(expired.slots).toEqual([]);
    expect(() => recordOwnerDecision(
      proposal.proposalId,
      "approve",
      "slot-1",
      new Date("2026-09-16T03:02:00Z"),
    )).toThrow(/not pending/);
  });

  it("does not disclose a proposal to another Guest session", () => {
    const proposal = createCandidateProposal(request, "guest-session", new Date("2026-09-16T01:00:00Z"));
    expect(() => getProposalStatus(proposal.proposalId, "other-guest-session"))
      .toThrow(/not found for this requester/);
  });
});
