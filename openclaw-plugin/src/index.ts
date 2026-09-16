import { createHash } from "node:crypto";
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";

const configSchema = Type.Object(
  {
    ownerSessionKey: Type.String({
      description: "Fixed Main session that receives redacted approval events.",
    }),
    allowedRequesterSessionKeys: Type.Array(Type.String(), { minItems: 1 }),
  },
  { additionalProperties: false },
);

const requestSchema = Type.Object(
  {
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
  },
  { additionalProperties: false },
);

type Request = {
  startDate: string;
  endDate: string;
  durationMinutes: number;
  earliestStart: string;
  latestEnd: string;
  timezone: "Asia/Taipei";
  purposeClass: "personal_visit" | "meeting" | "appointment";
  idempotencyKey: string;
};

type Slot = {
  slotId: string;
  start: string;
  end: string;
  timezone: "Asia/Taipei";
  weekday: string;
};

type Proposal = {
  proposalId: string;
  state: "proposed";
  authority: "tentative";
  source: "synthetic";
  expiresAt: string;
  slots: Slot[];
};

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function dateAtTaipei(date: string, minuteOfDay: number): Date {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return new Date(
    `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`,
  );
}

function isoDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function buildSyntheticProposal(request: Request, now = new Date()): Proposal {
  const firstDay = dateAtTaipei(request.startDate, 0);
  const lastDay = dateAtTaipei(request.endDate, 0);
  const rangeDays = Math.round((lastDay.getTime() - firstDay.getTime()) / 86_400_000);
  const earliest = minutes(request.earliestStart);
  const latest = minutes(request.latestEnd);

  if (rangeDays < 0 || rangeDays > 14) {
    throw new Error("date range must be between 0 and 14 days");
  }
  if (latest <= earliest || latest - earliest < request.durationMinutes) {
    throw new Error("daily window cannot fit the requested duration");
  }

  const slots: Slot[] = [];
  for (let day = 0; day <= rangeDays && slots.length < 3; day += 1) {
    const date = new Date(firstDay.getTime() + day * 86_400_000);
    const localDate = isoDate(date);
    for (
      let startMinute = earliest;
      startMinute + request.durationMinutes <= latest && slots.length < 3;
      startMinute += 30
    ) {
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

  const digest = createHash("sha256")
    .update(JSON.stringify(request))
    .digest("hex")
    .slice(0, 16);
  return {
    proposalId: `synthetic-${digest}`,
    state: "proposed",
    authority: "tentative",
    source: "synthetic",
    expiresAt: new Date(now.getTime() + 2 * 60 * 60_000).toISOString(),
    slots,
  };
}

export default defineToolPlugin({
  id: "agent-liaison",
  name: "Agent Liaison",
  description: "Expose one bounded synthetic scheduling request to an allowlisted Guest session.",
  configSchema,
  tools: (tool) => [
    tool({
      name: "request_synthetic_availability",
      label: "Request Synthetic Availability",
      description:
        "Request synthetic tentative scheduling options. Never reads or writes a live calendar and never confirms a commitment.",
      parameters: requestSchema,
      optional: true,
      factory({ api, config, toolContext }) {
        const sessionKey = toolContext.sessionKey;
        if (
          toolContext.agentId !== "guest" ||
          !sessionKey ||
          !config.allowedRequesterSessionKeys.includes(sessionKey)
        ) {
          return null;
        }

        return {
          name: "request_synthetic_availability",
          label: "Request Synthetic Availability",
          description:
            "Request synthetic tentative scheduling options. Never reads or writes a live calendar and never confirms a commitment.",
          parameters: requestSchema,
          executionMode: "sequential",
          async execute(_toolCallId: string, rawParams: unknown) {
            const request = rawParams as Request;
            const proposal = buildSyntheticProposal(request);
            const ownerEvent = [
              "[Agent Liaison synthetic approval request]",
              `Correlation: ${proposal.proposalId}`,
              `Purpose class: ${request.purposeClass}`,
              `Authority: tentative; source: synthetic; expires: ${proposal.expiresAt}`,
              ...proposal.slots.map(
                (slot) =>
                  `${slot.slotId}: ${slot.start} to ${slot.end} (${slot.timezone}, ${slot.weekday})`,
              ),
              "No live calendar was read or changed. Do not present this as real availability.",
            ].join("\n");

            const queued = api.runtime.system.enqueueSystemEvent(ownerEvent, {
              sessionKey: config.ownerSessionKey,
              contextKey: proposal.proposalId,
              replace: true,
            });
            if (queued) {
              api.runtime.system.requestHeartbeat({
                source: "other",
                intent: "event",
                reason: "agent-liaison-synthetic-request",
              });
            }

            const details = { ok: true, proposal, ownerNotificationQueued: queued };
            return {
              content: [{ type: "text", text: JSON.stringify(details) }],
              details,
            };
          },
        };
      },
    }),
  ],
});
