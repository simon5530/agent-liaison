import { beforeEach, describe, expect, it, vi } from "vitest";
import { getToolPluginMetadata } from "openclaw/plugin-sdk/tool-plugin";
import entry, {
  createCandidateProposal,
  getProposalStatus,
  recordOwnerDecision,
  resetProposalStoreForTests,
  submitContextualCandidates,
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
      "submit_contextual_candidate_times",
      "check_candidate_status",
      "check_owner_candidate_status",
      "record_owner_scheduling_decision",
    ]);
    expect(metadata?.tools.every((tool) => tool.optional)).toBe(true);
  });

  it("creates an idempotent context-review request without precomputed candidates", () => {
    const now = new Date("2026-09-16T01:00:00Z");
    const first = createCandidateProposal(request, "guest-session", now);
    const retry = createCandidateProposal(request, "guest-session", now);
    expect(first.proposalId).toBe(retry.proposalId);
    expect(first.state).toBe("awaiting_context");
    expect(first.authority).toBe("candidate");
    expect(first.source).toBe("unreviewed");
    expect(first.contextBasis).toEqual([]);
    expect(first.slots).toEqual([]);
  });

  it("fails closed for an oversized range", () => {
    expect(() => createCandidateProposal(
      { ...request, endDate: "2026-10-20" },
      "guest-session",
    )).toThrow(/0 and 14 days/);
  });

  it("confirms only the owner-selected slot", () => {
    const proposal = createCandidateProposal(request, "guest-session", new Date("2026-09-16T01:00:00Z"));
    submitContextualCandidates(proposal.proposalId, [
      { start: "2026-09-21T10:00:00.000Z", end: "2026-09-21T12:00:00.000Z" },
      { start: "2026-09-22T10:00:00.000Z", end: "2026-09-22T12:00:00.000Z" },
    ], "main_memory", ["owner_scheduling_preferences"], new Date("2026-09-16T01:05:00Z"));
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
    submitContextualCandidates(proposal.proposalId, [
      { start: "2026-09-21T10:00:00.000Z", end: "2026-09-21T12:00:00.000Z" },
    ], "policy_only", ["request_constraints_only"], new Date("2026-09-16T01:05:00Z"));
    const result = recordOwnerDecision(
      proposal.proposalId,
      "decline",
      undefined,
      new Date("2026-09-16T01:10:00Z"),
    );
    expect(result.proposal.state).toBe("declined");
    expect(result.proposal.slots).toEqual([]);
  });

  it("expires while awaiting context and blocks later submission", () => {
    const proposal = createCandidateProposal(request, "guest-session", new Date("2026-09-16T01:00:00Z"));
    const expired = getProposalStatus(
      proposal.proposalId,
      "guest-session",
      new Date("2026-09-16T09:01:00Z"),
    );
    expect(expired.state).toBe("expired");
    expect(expired.slots).toEqual([]);
    expect(() => submitContextualCandidates(
      proposal.proposalId,
      [{ start: "2026-09-21T10:00:00.000Z", end: "2026-09-21T12:00:00.000Z" }],
      "policy_only",
      ["request_constraints_only"],
      new Date("2026-09-16T09:02:00Z"),
    )).toThrow(/not awaiting/);
  });

  it("accepts bounded memory-assisted candidates without exposing memory text", () => {
    const proposal = createCandidateProposal(request, "guest-session", new Date("2026-09-16T01:00:00Z"));
    const result = submitContextualCandidates(proposal.proposalId, [
      { start: "2026-09-21T10:00:00.000Z", end: "2026-09-21T12:00:00.000Z" },
      { start: "2026-09-22T10:00:00.000Z", end: "2026-09-22T12:00:00.000Z" },
    ], "main_memory", ["owner_scheduling_preferences", "owner_time_boundaries"], new Date("2026-09-16T01:05:00Z"));
    expect(result.proposal.state).toBe("pending_owner");
    expect(result.proposal.source).toBe("main_memory");
    expect(result.proposal.slots).toHaveLength(2);
    expect(JSON.stringify(result.proposal)).not.toContain("memory excerpt");
  });

  it("rejects candidates outside the typed request boundary", () => {
    const proposal = createCandidateProposal(request, "guest-session", new Date("2026-09-16T01:00:00Z"));
    expect(() => submitContextualCandidates(proposal.proposalId, [
      { start: "2026-09-21T08:00:00.000Z", end: "2026-09-21T10:00:00.000Z" },
    ], "policy_only", ["request_constraints_only"], new Date("2026-09-16T01:05:00Z"))).toThrow(/daily window/);
  });

  it("does not disclose a proposal to another Guest session", () => {
    const proposal = createCandidateProposal(request, "guest-session", new Date("2026-09-16T01:00:00Z"));
    expect(() => getProposalStatus(proposal.proposalId, "other-guest-session"))
      .toThrow(/not found for this requester/);
  });

  it("schedules an immediate owner turn and a two-hour pending reminder", async () => {
    const registered: Array<{ name: string; factory: (ctx: unknown) => unknown }> = [];
    const scheduleSessionTurn = vi.fn(async (params: { name?: string }) => ({
      id: params.name ?? "scheduled",
      pluginId: "agent-liaison",
      sessionKey: "agent:main:line:owner",
      kind: "session-turn",
    }));
    entry.register({
      pluginConfig: {
        ownerSessionKey: "agent:main:line:owner",
        allowedRequesterSessionKeys: ["agent:guest:line:requester"],
      },
      registerTool(factory: (ctx: unknown) => unknown, options: { name: string }) {
        registered.push({ name: options.name, factory });
      },
      session: { workflow: { scheduleSessionTurn } },
    } as never);

    const registration = registered.find((item) => item.name === "request_candidate_times");
    expect(registration).toBeDefined();
    const tool = registration?.factory({
      agentId: "guest",
      sessionKey: "agent:guest:line:requester",
    }) as { execute: (id: string, params: unknown) => Promise<{ details: Record<string, unknown> }> };
    const result = await tool.execute("call-1", request);

    expect(scheduleSessionTurn).toHaveBeenCalledTimes(2);
    expect(scheduleSessionTurn.mock.calls[0]?.[0]).toMatchObject({
      sessionKey: "agent:main:line:owner",
      agentId: "main",
      delayMs: 0,
      deliveryMode: "announce",
      deleteAfterRun: true,
    });
    expect(scheduleSessionTurn.mock.calls[1]?.[0]).toMatchObject({
      sessionKey: "agent:main:line:owner",
      agentId: "main",
      delayMs: 2 * 60 * 60_000,
      deliveryMode: "announce",
      deleteAfterRun: true,
    });
    expect(result.details).toMatchObject({
      ownerNotificationScheduled: true,
      ownerReminderScheduled: true,
    });
  });

  it("does not claim notification when the host disables global side effects", async () => {
    const registered: Array<{ name: string; factory: (ctx: unknown) => unknown }> = [];
    const scheduleSessionTurn = vi.fn(async () => undefined);
    entry.register({
      pluginConfig: {
        ownerSessionKey: "agent:main:line:owner",
        allowedRequesterSessionKeys: ["agent:guest:line:requester"],
      },
      registerTool(factory: (ctx: unknown) => unknown, options: { name: string }) {
        registered.push({ name: options.name, factory });
      },
      session: { workflow: { scheduleSessionTurn } },
    } as never);

    const registration = registered.find((item) => item.name === "request_candidate_times");
    const tool = registration?.factory({
      agentId: "guest",
      sessionKey: "agent:guest:line:requester",
    }) as { execute: (id: string, params: unknown) => Promise<{ details: Record<string, unknown> }> };
    const result = await tool.execute("call-side-effects-disabled", {
      ...request,
      idempotencyKey: "side-effects-disabled-proof",
    });

    expect(result.details).toMatchObject({
      ownerNotificationScheduled: false,
      ownerReminderScheduled: false,
    });
  });
});
