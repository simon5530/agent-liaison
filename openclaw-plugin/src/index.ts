import { createHash } from "node:crypto";
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

const configSchema = Type.Object({
  ownerSessionKey: Type.String(),
  allowedRequesterSessionKeys: Type.Array(Type.String(), { minItems: 1 }),
}, { additionalProperties: false });

const requestSchema = Type.Object({
  startDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  endDate: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
  durationMinutes: Type.Integer({ minimum: 30, maximum: 480 }),
  earliestStart: Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }),
  latestEnd: Type.String({ pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$" }),
  timezone: Type.Literal("Asia/Taipei"),
  purposeClass: Type.Union([
    Type.Literal("personal_visit"),
    Type.Literal("meeting"),
    Type.Literal("appointment"),
  ]),
  idempotencyKey: Type.String({ minLength: 8, maxLength: 128 }),
}, { additionalProperties: false });

const statusSchema = Type.Object({
  proposalId: Type.String({ minLength: 16, maxLength: 96 }),
}, { additionalProperties: false });

const decisionSchema = Type.Object({
  proposalId: Type.String({ minLength: 16, maxLength: 96 }),
  decision: Type.Union([Type.Literal("approve"), Type.Literal("decline")]),
  selectedSlotId: Type.Optional(Type.String({ pattern: "^slot-[1-3]$" })),
}, { additionalProperties: false });

export type AvailabilityRequest = {
  startDate: string;
  endDate: string;
  durationMinutes: number;
  earliestStart: string;
  latestEnd: string;
  timezone: "Asia/Taipei";
  purposeClass: "personal_visit" | "meeting" | "appointment";
  idempotencyKey: string;
};

export type Slot = {
  slotId: string;
  start: string;
  end: string;
  timezone: "Asia/Taipei";
  weekday: string;
};

export type Proposal = {
  proposalId: string;
  state: "pending_owner" | "confirmed" | "declined" | "expired";
  authority: "candidate" | "confirmed";
  source: "policy_only";
  expiresAt: string;
  slots: Slot[];
  selectedSlot?: Slot;
};

type StoredProposal = {
  proposal: Proposal;
  request: AvailabilityRequest;
  requesterSessionKey: string;
};

const proposalStore = new Map<string, StoredProposal>();

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function dateAtTaipei(date: string, minuteOfDay: number): Date {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return new Date(`${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`);
}

function isoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function validateWindow(request: AvailabilityRequest): number {
  const firstDay = dateAtTaipei(request.startDate, 0);
  const lastDay = dateAtTaipei(request.endDate, 0);
  const rangeDays = Math.round((lastDay.getTime() - firstDay.getTime()) / 86_400_000);
  const earliest = minutes(request.earliestStart);
  const latest = minutes(request.latestEnd);
  if (rangeDays < 0 || rangeDays > 14) throw new Error("date range must be between 0 and 14 days");
  if (latest <= earliest || latest - earliest < request.durationMinutes) {
    throw new Error("daily window cannot fit the requested duration");
  }
  return rangeDays;
}

export function deriveCandidateSlots(request: AvailabilityRequest): Slot[] {
  const rangeDays = validateWindow(request);
  const firstDay = dateAtTaipei(request.startDate, 0);
  const earliest = minutes(request.earliestStart);
  const latest = minutes(request.latestEnd);
  const slots: Slot[] = [];
  for (let day = 0; day <= rangeDays && slots.length < 3; day += 1) {
    const localDate = isoDate(new Date(firstDay.getTime() + day * 86_400_000));
    for (let startMinute = earliest; startMinute + request.durationMinutes <= latest && slots.length < 3; startMinute += 30) {
      const start = dateAtTaipei(localDate, startMinute);
      const end = new Date(start.getTime() + request.durationMinutes * 60_000);
      slots.push({
        slotId: `slot-${slots.length + 1}`,
        start: start.toISOString(),
        end: end.toISOString(),
        timezone: request.timezone,
        weekday: new Intl.DateTimeFormat("en-US", {
          timeZone: request.timezone,
          weekday: "long",
        }).format(start),
      });
    }
  }
  return slots;
}

function expire(record: StoredProposal, now: Date): StoredProposal {
  if (record.proposal.state === "pending_owner" && new Date(record.proposal.expiresAt) <= now) {
    record.proposal = { ...record.proposal, state: "expired", slots: [] };
  }
  return record;
}

export function createCandidateProposal(
  request: AvailabilityRequest,
  requesterSessionKey: string,
  now = new Date(),
): Proposal {
  const digest = createHash("sha256")
    .update(JSON.stringify({ request, requesterSessionKey }))
    .digest("hex")
    .slice(0, 16);
  const proposalId = `candidate-${digest}`;
  const existing = proposalStore.get(proposalId);
  if (existing) return expire(existing, now).proposal;

  const proposal: Proposal = {
    proposalId,
    state: "pending_owner",
    authority: "candidate",
    source: "policy_only",
    expiresAt: new Date(now.getTime() + 2 * 60 * 60_000).toISOString(),
    slots: deriveCandidateSlots(request),
  };
  proposalStore.set(proposalId, { proposal, request, requesterSessionKey });
  return proposal;
}

export function getProposalStatus(
  proposalId: string,
  requesterSessionKey: string,
  now = new Date(),
): Proposal {
  const record = proposalStore.get(proposalId);
  if (!record || record.requesterSessionKey !== requesterSessionKey) {
    throw new Error("proposal not found for this requester");
  }
  return expire(record, now).proposal;
}

export function recordOwnerDecision(
  proposalId: string,
  decision: "approve" | "decline",
  selectedSlotId?: string,
  now = new Date(),
): { proposal: Proposal; requesterSessionKey: string } {
  const record = proposalStore.get(proposalId);
  if (!record) throw new Error("proposal not found");
  expire(record, now);
  if (record.proposal.state !== "pending_owner") throw new Error("proposal is not pending owner approval");

  if (decision === "decline") {
    record.proposal = { ...record.proposal, state: "declined", slots: [] };
  } else {
    const selected = record.proposal.slots.find((slot) => slot.slotId === selectedSlotId);
    if (!selected) throw new Error("approval requires a valid selectedSlotId");
    record.proposal = {
      ...record.proposal,
      state: "confirmed",
      authority: "confirmed",
      selectedSlot: selected,
      slots: [selected],
    };
  }
  return { proposal: record.proposal, requesterSessionKey: record.requesterSessionKey };
}

export function resetProposalStoreForTests(): void {
  proposalStore.clear();
}

function isAllowedGuest(ctx: { agentId?: string; sessionKey?: string }, allowlist: string[]) {
  return ctx.agentId === "guest" && Boolean(ctx.sessionKey) && allowlist.includes(ctx.sessionKey as string);
}

function isOwner(ctx: { agentId?: string; sessionKey?: string }, ownerSessionKey: string) {
  return ctx.agentId === "main" && ctx.sessionKey === ownerSessionKey;
}

function ownerEventFor(proposal: Proposal, request: AvailabilityRequest): string {
  return [
    "[Agent Liaison owner decision required]",
    `Correlation: ${proposal.proposalId}`,
    `Purpose class: ${request.purposeClass}`,
    `Authority: candidate; source: ${proposal.source}; expires: ${proposal.expiresAt}`,
    ...proposal.slots.map((slot) => `${slot.slotId}: ${slot.start} to ${slot.end} (${slot.timezone}, ${slot.weekday})`),
    "These times are policy-only candidates. No calendar or node data was checked.",
    "Only the human owner may approve one slot or decline the proposal.",
  ].join("\n");
}

function requesterEventFor(proposal: Proposal): string {
  if (proposal.state === "confirmed" && proposal.selectedSlot) {
    return [
      "[Agent Liaison owner decision]",
      `Correlation: ${proposal.proposalId}`,
      "Decision: confirmed",
      `Selected: ${proposal.selectedSlot.start} to ${proposal.selectedSlot.end} (${proposal.selectedSlot.timezone})`,
      "You may now communicate this confirmed result to the requester.",
    ].join("\n");
  }
  return [
    "[Agent Liaison owner decision]",
    `Correlation: ${proposal.proposalId}`,
    `Decision: ${proposal.state}`,
    "Do not present any candidate time as confirmed.",
  ].join("\n");
}

export default defineToolPlugin({
  id: "agent-liaison",
  name: "Agent Liaison",
  description: "Coordinate bounded candidate-time proposals and owner decisions.",
  configSchema,
  tools: (tool) => [
    tool({
      name: "request_candidate_times",
      label: "Request Candidate Times",
      description: "Propose policy-only candidate times pending explicit owner confirmation. Does not check a calendar or node.",
      parameters: requestSchema,
      optional: true,
      factory({ api, config, toolContext }) {
        if (!isAllowedGuest(toolContext, config.allowedRequesterSessionKeys)) return null;
        return {
          name: "request_candidate_times",
          label: "Request Candidate Times",
          description: "Propose policy-only candidate times pending explicit owner confirmation. Does not check a calendar or node.",
          parameters: requestSchema,
          executionMode: "sequential",
          async execute(_id: string, raw: unknown) {
            const request = raw as AvailabilityRequest;
            const requesterSessionKey = toolContext.sessionKey as string;
            const proposal = createCandidateProposal(request, requesterSessionKey);
            const queued = api.runtime.system.enqueueSystemEvent(ownerEventFor(proposal, request), {
              sessionKey: config.ownerSessionKey,
              contextKey: proposal.proposalId,
              replace: true,
            });
            if (queued) api.runtime.system.requestHeartbeat({
              source: "other",
              intent: "event",
              reason: "agent-liaison-candidate-request",
            });
            const details = { ok: true, proposal, ownerNotificationQueued: queued };
            return { content: [{ type: "text", text: JSON.stringify(details) }], details };
          },
        };
      },
    }),
    tool({
      name: "check_candidate_status",
      label: "Check Candidate Status",
      description: "Check the owner's decision for a proposal created by this Guest session.",
      parameters: statusSchema,
      optional: true,
      factory({ config, toolContext }) {
        if (!isAllowedGuest(toolContext, config.allowedRequesterSessionKeys)) return null;
        return {
          name: "check_candidate_status",
          label: "Check Candidate Status",
          description: "Check the owner's decision for a proposal created by this Guest session.",
          parameters: statusSchema,
          executionMode: "sequential",
          async execute(_id: string, raw: unknown) {
            const { proposalId } = raw as { proposalId: string };
            const proposal = getProposalStatus(proposalId, toolContext.sessionKey as string);
            const details = { ok: true, proposal };
            return { content: [{ type: "text", text: JSON.stringify(details) }], details };
          },
        };
      },
    }),
    tool({
      name: "record_owner_scheduling_decision",
      label: "Record Owner Scheduling Decision",
      description: "Record the human owner's approval or decline for a pending candidate proposal.",
      parameters: decisionSchema,
      optional: true,
      factory({ api, config, toolContext }) {
        if (!isOwner(toolContext, config.ownerSessionKey)) return null;
        return {
          name: "record_owner_scheduling_decision",
          label: "Record Owner Scheduling Decision",
          description: "Record the human owner's approval or decline for a pending candidate proposal.",
          parameters: decisionSchema,
          executionMode: "sequential",
          async execute(_id: string, raw: unknown) {
            const { proposalId, decision, selectedSlotId } = raw as {
              proposalId: string;
              decision: "approve" | "decline";
              selectedSlotId?: string;
            };
            const result = recordOwnerDecision(proposalId, decision, selectedSlotId);
            const queued = api.runtime.system.enqueueSystemEvent(requesterEventFor(result.proposal), {
              sessionKey: result.requesterSessionKey,
              contextKey: `${proposalId}:owner-decision`,
              replace: true,
            });
            if (queued) api.runtime.system.requestHeartbeat({
              source: "other",
              intent: "event",
              reason: "agent-liaison-owner-decision",
            });
            const details = { ok: true, proposal: result.proposal, guestNotificationQueued: queued };
            return { content: [{ type: "text", text: JSON.stringify(details) }], details };
          },
        };
      },
    }),
  ],
});
